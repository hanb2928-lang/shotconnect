import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { supabaseUrl } from '@/lib/supabase';

export type NetworkStatus = 'online' | 'offline' | 'unknown';

let currentStatus: NetworkStatus = 'unknown';
let initialized = false;
const listeners = new Set<(status: NetworkStatus) => void>();
let probeTimer: ReturnType<typeof setInterval> | null = null;
let probing = false;

const PROBE_INTERVAL_MS = 15000;
const PROBE_TIMEOUT_MS = 8000;

function notify(status: NetworkStatus) {
  if (status === currentStatus) return;
  currentStatus = status;
  const snapshot = [...listeners];
  for (const cb of snapshot) {
    if (typeof cb === 'function') cb(status);
  }
}

const onlineHandler = () => notify('online');
const offlineHandler = () => notify('offline');

async function probeConnectivity(): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/analyze-photo`, {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res.ok || res.status === 405 || res.status === 401;
  } catch {
    clearTimeout(timeoutId);
    return false;
  }
}

async function runProbe() {
  if (probing) return;
  probing = true;
  const reachable = await probeConnectivity();
  probing = false;
  notify(reachable ? 'online' : 'offline');
}

function startProbing() {
  if (probeTimer) return;
  runProbe();
  probeTimer = setInterval(runProbe, PROBE_INTERVAL_MS);
}

function stopProbing() {
  if (probeTimer) {
    clearInterval(probeTimer);
    probeTimer = null;
  }
}

function init() {
  if (initialized) return;
  initialized = true;

  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined') {
      currentStatus = navigator.onLine ? 'online' : 'offline';
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('online', onlineHandler);
      window.addEventListener('offline', offlineHandler);
    }
  }
  startProbing();
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
