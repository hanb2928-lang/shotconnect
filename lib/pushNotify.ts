import { supabase } from '@/lib/supabase';
import { getItem, setItem } from '@/lib/storage';
import { safeInvoke } from '@/lib/apiClient';

const DEVICE_ID_KEY = 'push_device_id';

async function getOrCreateDeviceId(): Promise<string> {
  let id = await getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export async function notifyVideoCompleted(videoUrl?: string): Promise<void> {
  try {
    const deviceId = await getOrCreateDeviceId();
    await safeInvoke(() => supabase.functions.invoke('send-push', {
      method: 'POST',
      body: {
        userId: deviceId,
        title: '영상 제작 완료',
        body: 'AI 영상이 완성되었습니다. 지금 바로 확인해보세요!',
        url: videoUrl ? `/result/${videoUrl}` : '/',
      },
    }));
  } catch {
    // best-effort — don't block the UI on push failures
  }
}
