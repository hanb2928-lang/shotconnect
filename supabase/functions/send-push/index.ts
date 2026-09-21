import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface PushPayload {
  userId?: string;
  title: string;
  body: string;
  url?: string;
  data?: Record<string, unknown>;
}

interface SubscriptionRow {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // GET: return VAPID public key for client subscription
  if (req.method === "GET") {
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
    return new Response(
      JSON.stringify({ vapidPublicKey: vapidPublicKey || null }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const payload = await req.json() as PushPayload;

    if (!payload.userId || !payload.title || !payload.body) {
      return new Response(
        JSON.stringify({ error: "userId, title, body are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@snapconnect.app";

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({ error: "VAPID keys not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const subs = await fetchSubscriptions(payload.userId);
    if (subs.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: "No push subscriptions found for user" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const messageJson = buildPushMessage(payload);
    const expiredEndpoints: string[] = [];
    let sent = 0;
    let failed = 0;

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          const audience = new URL(sub.endpoint).origin;
          const jwt = await generateVapidJwt(vapidSubject, audience, vapidPrivateKey);
          const body = await encryptMessage(sub.keys.p256dh, sub.keys.auth, messageJson);
          const resp = await sendWebPush(sub.endpoint, body, jwt);

          if (resp.status === 201 || resp.status === 200) {
            sent++;
          } else if (resp.status === 404 || resp.status === 410) {
            expiredEndpoints.push(sub.endpoint);
            failed++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }),
    );

    if (expiredEndpoints.length > 0) {
      await cleanupExpiredSubscriptions(payload.userId, expiredEndpoints);
    }

    return new Response(
      JSON.stringify({ sent, failed, total: subs.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[send-push] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Push notification failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function fetchSubscriptions(userId: string): Promise<SubscriptionRow[]> {
  if (!supabaseUrl || !serviceRoleKey) return [];
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/push_subscriptions?user_id=eq.${userId}&select=endpoint,p256dh,auth`,
      {
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
        signal: controller.signal,
      },
    );
    clearTimeout(timeoutId);
    if (!resp.ok) return [];
    const rows = await resp.json() as Array<{ endpoint: string; p256dh: string; auth: string }>;
    return rows.map((r) => ({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }));
  } catch {
    clearTimeout(timeoutId);
    return [];
  }
}

async function cleanupExpiredSubscriptions(userId: string, endpoints: string[]): Promise<void> {
  if (!supabaseUrl || !serviceRoleKey) return;
  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      await fetch(
        `${supabaseUrl}/rest/v1/push_subscriptions?user_id=eq.${userId}&endpoint=eq.${encodeURIComponent(endpoint)}`,
        {
          method: "DELETE",
          headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
          signal: controller.signal,
        },
      );
      clearTimeout(timeoutId);
    } catch {
      // non-fatal
    }
  }
}

function buildPushMessage(payload: PushPayload): string {
  return JSON.stringify({
    notification: {
      title: payload.title,
      body: payload.body,
      data: { url: payload.url ?? "/", ...payload.data },
      icon: "/icon.webp",
      badge: "/icon.webp",
      vibrate: [200, 100, 200],
      requireInteraction: false,
      silent: false,
    },
  });
}

async function sendWebPush(endpoint: string, body: Uint8Array, jwt: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "TTL": "2419200",
        "Content-Encoding": "aes128gcm",
        "Content-Length": String(body.byteLength),
        "Authorization": `vapid ${jwt}`,
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return resp;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// === Web Push encryption (RFC 8291 + RFC 8188) ===

async function hmacSha256(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, message));
}

async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const hashLen = 32;
  const n = Math.ceil(length / hashLen);
  const okm = new Uint8Array(n * hashLen);
  let prev: Uint8Array = new Uint8Array(0);
  for (let i = 1; i <= n; i++) {
    const input = new Uint8Array(prev.length + info.length + 1);
    input.set(prev, 0);
    input.set(info, prev.length);
    input[prev.length + info.length] = i;
    prev = await hmacSha256(prk, input);
    okm.set(prev, (i - 1) * hashLen);
  }
  return okm.subarray(0, length);
}

async function encryptMessage(
  p256dh: string,
  authSecretB64: string,
  message: string,
): Promise<Uint8Array> {
  const subscriberPubKeyBytes = base64urlToBytes(p256dh);
  const authSecretBytes = base64urlToBytes(authSecretB64);

  // 1. Import subscriber's public ECDH key
  const subscriberPublicKey = await crypto.subtle.importKey(
    "raw", subscriberPubKeyBytes, { name: "ECDH", namedCurve: "P-256" }, false, [],
  );

  // 2. Generate ephemeral server key pair
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"],
  );

  // 3. ECDH shared secret
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: subscriberPublicKey }, serverKeyPair.privateKey, 256),
  );

  // 4. Export server public key (uncompressed P-256: 65 bytes)
  const serverPubKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKeyPair.publicKey),
  );

  // 5. PRK_key = HMAC-SHA-256(auth_secret, ecdh_secret) — HKDF-Extract
  const prkKey = await hmacSha256(authSecretBytes, ecdhSecret);

  // 6. IKM = HKDF-Expand(PRK_key, "WebPush: info\0" || server_pub || subscriber_pub, 32)
  const keyInfo = concatBytes(
    new TextEncoder().encode("WebPush: info\0"),
    serverPubKey,
    subscriberPubKeyBytes,
  );
  const ikm = await hkdfExpand(prkKey, keyInfo, 32);

  // 7. CEK = HKDF-Expand(IKM, "Content-Encoding: aes128gcm\0", 16)
  const cekInfo = new TextEncoder().encode("Content-Encoding: aes128gcm\0");
  const cek = await hkdfExpand(ikm, cekInfo, 16);

  // 8. nonce = HKDF-Expand(IKM, "Content-Encoding: nonce\0", 12)
  const nonceInfo = new TextEncoder().encode("Content-Encoding: nonce\0");
  const nonce = await hkdfExpand(ikm, nonceInfo, 12);

  // 9. Encrypt with AES-128-GCM
  const messageBytes = new TextEncoder().encode(message);
  const padded = new Uint8Array(messageBytes.length + 1);
  padded.set(messageBytes, 0);
  padded[messageBytes.length] = 2; // padding delimiter

  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, padded),
  );

  // 10. Build RFC 8291 header: salt(16) || rs(4) || idlen(1) || keyid(65)
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  const dv = new DataView(header.buffer);
  dv.setUint32(16, 4096); // record size
  header[20] = 65;        // key ID length
  header.set(serverPubKey, 21);

  return concatBytes(header, encrypted);
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function base64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// === VAPID JWT (RFC 8292) ===

async function generateVapidJwt(
  subject: string,
  audience: string,
  privateKeyB64: string,
): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const jwtPayload = { aud: audience, exp: now + 12 * 60 * 60, sub: subject };

  const encodedHeader = base64urlEncodeStr(JSON.stringify(header));
  const encodedPayload = base64urlEncodeStr(JSON.stringify(jwtPayload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const pkcs8Bytes = base64urlToBytes(privateKeyB64);
  const ecKey = await crypto.subtle.importKey(
    "pkcs8", pkcs8Bytes, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );

  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      ecKey,
      new TextEncoder().encode(signingInput),
    ),
  );

  // Convert DER signature to raw r||s for ES256 JWT
  const rawSig = derToRaw(signature);
  const encodedSignature = base64urlEncodeBytes(rawSig);
  return `${signingInput}.${encodedSignature}`;
}

function derToRaw(derSig: Uint8Array): Uint8Array {
  // ECDSA signatures from Web Crypto are in DER format; JWT needs raw r||s
  const rLen = derSig[3];
  const r = derSig.subarray(4, 4 + rLen);
  const sOffset = 4 + rLen + 2;
  const sLen = derSig[sOffset];
  const s = derSig.subarray(sOffset + 1, sOffset + 1 + sLen);

  const raw = new Uint8Array(64);
  // Right-align r and s into 32 bytes each (trim leading zeros or pad)
  raw.set(r.subarray(Math.max(0, r.length - 32)), Math.max(0, 32 - r.length));
  raw.set(s.subarray(Math.max(0, s.length - 32)), 32 + Math.max(0, 32 - s.length));
  return raw;
}

function base64urlEncodeStr(str: string): string {
  return base64urlEncodeBytes(new TextEncoder().encode(str));
}

function base64urlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
