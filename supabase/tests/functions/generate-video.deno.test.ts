import { assertEquals, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts";

const BASE_URL = "http://localhost:54321/functions/v1/generate-video";

Deno.test("generate-video 에지 함수 - 잘못된 페이로드 요청 시 400 에러 반환", async () => {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invalid_payload: true }), // 필수 필드 누락
  });
  assertEquals(res.status, 400);
  const data = await res.json();
  assertExists(data.error);
});
