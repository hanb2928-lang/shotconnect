import { useEffect, useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { getItem, setItem } from '@/lib/storage';

type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

interface UseWebPushResult {
  supported: boolean;
  permission: PermissionState;
  isSubscribed: boolean;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
  sendTestNotification: () => Promise<{ sent: number; failed: number; message?: string }>;
  error: string | null;
}

const SW_PATH = '/sw-push.js';
const DEVICE_ID_KEY = 'push_device_id';

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

async function getOrCreateDeviceId(): Promise<string> {
  let id = await getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function useWebPush(): UseWebPushResult {
  const [permission, setPermission] = useState<PermissionState>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  const isWeb = Platform.OS === 'web';
  const supported = isWeb
    && typeof window !== 'undefined'
    && typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window;

  useEffect(() => {
    if (!supported) {
      setPermission('unsupported');
      return;
    }

    let cancelled = false;

    if ('Notification' in window) {
      setPermission(Notification.permission as PermissionState);
    }

    fetchVapidKey().then((key) => {
      if (!cancelled && key) setVapidPublicKey(key);
    }).catch(() => {});

    getOrCreateDeviceId().then((id) => {
      if (!cancelled) setDeviceId(id);
    }).catch(() => {});

    (async () => {
      try {
        const reg = await navigator.serviceWorker.register(SW_PATH, { scope: '/' });
        if (cancelled) return;
        registrationRef.current = reg;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setIsSubscribed(!!sub);
      } catch {
        // SW registration failed
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

      const subJson = sub.toJSON();
      const did = deviceId ?? (await getOrCreateDeviceId());

      const { error: dbError } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: did,
          endpoint: subJson.endpoint,
          keys: subJson.keys ?? {},
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
  }, [supported, vapidPublicKey, deviceId]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!registrationRef.current) return false;

    try {
      const sub = await registrationRef.current.pushManager.getSubscription();
      const endpoint = sub?.endpoint;
      if (sub) {
        await sub.unsubscribe();
      }

      const did = deviceId ?? (await getOrCreateDeviceId());
      if (endpoint) {
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', did)
          .eq('endpoint', endpoint);
      }

      setIsSubscribed(false);
      setError(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : '알림 구독 해지에 실패했습니다.');
      return false;
    }
  }, [deviceId]);

  const sendTestNotification = useCallback(async (): Promise<{ sent: number; failed: number; message?: string }> => {
    try {
      const did = deviceId ?? (await getOrCreateDeviceId());
      const { data, error: invokeError } = await supabase.functions.invoke('send-push', {
        method: 'POST',
        body: {
          userId: did,
          title: '테스트 알림',
          body: '푸시 알림이 정상적으로 작동합니다! 영상 완성 알림을 받을 준비가 되었어요.',
          url: '/',
        },
      });

      if (invokeError) {
        return { sent: 0, failed: 1, message: invokeError.message };
      }

      const result = data as { sent?: number; failed?: number; message?: string; error?: string };
      if (result.error) {
        return { sent: 0, failed: 1, message: result.error };
      }
      return {
        sent: result.sent ?? 0,
        failed: result.failed ?? 0,
        message: result.message,
      };
    } catch (err) {
      return { sent: 0, failed: 1, message: err instanceof Error ? err.message : '알 수 없는 오류' };
    }
  }, [deviceId]);

  return { supported, permission, isSubscribed, subscribe, unsubscribe, sendTestNotification, error };
}

async function fetchVapidKey(): Promise<string | null> {
  try {
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
