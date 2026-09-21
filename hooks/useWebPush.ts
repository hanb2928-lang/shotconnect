import { useEffect, useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';

type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

interface UseWebPushResult {
  supported: boolean;
  permission: PermissionState;
  isSubscribed: boolean;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
  error: string | null;
}

// VAPID public key — will be set from server or env
// For now we use a placeholder that the send-push function checks against
const SW_PATH = '/sw-push.js';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = globalThis.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export function useWebPush(): UseWebPushResult {
  const [permission, setPermission] = useState<PermissionState>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  const isWeb = Platform.OS === 'web';
  const supported = isWeb && typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

  useEffect(() => {
    if (!supported) {
      setPermission('unsupported');
      return;
    }

    let cancelled = false;

    // Check current permission
    if ('Notification' in window) {
      setPermission(Notification.permission as PermissionState);
    }

    // Fetch VAPID public key from server
    fetchVapidKey().then((key) => {
      if (!cancelled && key) setVapidPublicKey(key);
    }).catch(() => {
      // VAPID key not configured yet — push won't work until it is
    });

    // Register service worker and check existing subscription
    (async () => {
      try {
        const reg = await navigator.serviceWorker.register(SW_PATH, { scope: '/' });
        if (cancelled) return;
        registrationRef.current = reg;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setIsSubscribed(!!sub);
      } catch {
        // SW registration failed — push won't work
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supported]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!supported || !registrationRef.current) {
      setError('이 브라우저에서는 푸시 알림을 지원하지 않습니다.');
      return false;
    }

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm as PermissionState);
      if (perm !== 'granted') {
        setError('알림 권한이 거부되었습니다. 브라우저 설정에서 알림을 허용해주세요.');
        return false;
      }

      const key = vapidPublicKey ?? (await fetchVapidKey());
      if (!key) {
        setError('푸시 알림이 아직 서버에 설정되지 않았습니다.');
        return false;
      }

      const sub = await registrationRef.current.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key).buffer as ArrayBuffer,
      });

      // Save subscription to database
      const { supabase } = await import('@/lib/supabase');
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        setError('알림을 구독하려면 로그인이 필요합니다.');
        return false;
      }

      const subJson = sub.toJSON();
      const { error: dbError } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: userId,
          endpoint: subJson.endpoint,
          p256dh: subJson.keys?.p256dh ?? '',
          auth: subJson.keys?.auth ?? '',
        }, { onConflict: 'user_id,endpoint' });

      if (dbError) {
        setError('알림 구독 저장에 실패했습니다.');
        return false;
      }

      setIsSubscribed(true);
      setError(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : '알림 구독에 실패했습니다.');
      return false;
    }
  }, [supported, vapidPublicKey]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!registrationRef.current) return false;

    try {
      const sub = await registrationRef.current.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
      }

      const { supabase } = await import('@/lib/supabase');
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (userId) {
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', userId);
      }

      setIsSubscribed(false);
      setError(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : '알림 구독 해지에 실패했습니다.');
      return false;
    }
  }, []);

  return { supported, permission, isSubscribed, subscribe, unsubscribe, error };
}

async function fetchVapidKey(): Promise<string | null> {
  try {
    const { supabase } = await import('@/lib/supabase');
    const { data, error } = await supabase.functions.invoke('send-push', {
      method: 'GET',
    });
    if (error || !data) return null;
    const result = data as { vapidPublicKey?: string };
    return result.vapidPublicKey ?? null;
  } catch {
    return null;
  }
}
