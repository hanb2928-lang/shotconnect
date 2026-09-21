import { useState, useEffect } from 'react';
import { Platform } from 'react-native';

export type NetworkStatus = 'online' | 'offline' | 'unknown';

let currentStatus: NetworkStatus = 'unknown';
let initialized = false;
const listeners = new Set<(status: NetworkStatus) => void>();

function notify(status: NetworkStatus) {
  currentStatus = status;
  for (const cb of listeners) cb(status);
}

function init() {
  if (initialized) return;
  initialized = true;

  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined') {
      currentStatus = navigator.onLine ? 'online' : 'offline';
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('online', () => notify('online'));
      window.addEventListener('offline', () => notify('offline'));
    }
  } else {
    currentStatus = 'online';
  }
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>(() => {
    init();
    return currentStatus;
  });

  useEffect(() => {
    init();
    listeners.add(setStatus);
    setStatus(currentStatus);
    return () => {
      listeners.delete(setStatus);
    };
  }, []);

  return status;
}

init();

export function isOnline(): boolean {
  if (!initialized) init();
  return currentStatus === 'online';
}

export function waitForOnline(timeoutMs = 30000): Promise<boolean> {
  if (isOnline()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      listeners.delete(check);
      resolve(false);
    }, timeoutMs);
    const check = (s: NetworkStatus) => {
      if (s === 'online') {
        clearTimeout(timer);
        listeners.delete(check);
        resolve(true);
      }
    };
    listeners.add(check);
  });
}
