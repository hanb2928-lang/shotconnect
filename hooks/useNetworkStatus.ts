import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { registerAppStateHandler } from '@/lib/appStateCoordinator';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase';

export type NetworkStatus = 'online' | 'offline' | 'unstable' | 'unknown';

type RecoveryListener = () => void;

let currentStatus: NetworkStatus = 'unknown';
let initialized = false;
const listeners = new Set<(status: NetworkStatus) => void>();
const recoveryListeners = new Set<RecoveryListener>();
let probeTimer: ReturnType<typeof setInterval> | null = null;
let probing = false;
let activeProbeController: AbortController | null = null;
let consecutiveProbeFailures = 0;
let wasOffline = false;

const PROBE_INTERVAL_MS = 15000;
const PROBE_TIMEOUT_MS = 8000;

const RECOVERY_DEBOUNCE_MS = 1500;
const RECOVERY_STAGGER_MS = 300;
let recoveryDispatchTimer: ReturnType<typeof setTimeout> | null = null;

const RAPID_FLIP_WINDOW_MS = 10_000;
const RAPID_FLIP_THRESHOLD = 3;
let recentFlips: number[] = [];
let unstableTimer: ReturnType<typeof setTimeout> | null = null;

function recordFlip() {
  const now = Date.now();
  recentFlips = recentFlips.filter((t) => now - t < RAPID_FLIP_WINDOW_MS);
  recentFlips.push(now);
  if (recentFlips.length >= RAPID_FLIP_THRESHOLD) {
    recentFlips = [];
    notify('unstable');
    if (unstableTimer) clearTimeout(unstableTimer);
    unstableTimer = setTimeout(() => {
      unstableTimer = null;
      if (currentStatus === 'unstable') {
        if (wasOffline) {
          notify('offline');
        } else {
          notify('online');
        }
      }
    }, 5000);
    return true;
  }
  return false;
}

function clearUnstable() {
  if (unstableTimer) {
    clearTimeout(unstableTimer);
    unstableTimer = null;
  }
  recentFlips = [];
}

function dispatchRecovery() {
  if (recoveryDispatchTimer) clearTimeout(recoveryDispatchTimer);
  recoveryDispatchTimer = setTimeout(() => {
    recoveryDispatchTimer = null;
    const snapshot = [...recoveryListeners];
    snapshot.forEach((cb, i) => {
      const stagger = Math.floor(i * RECOVERY_STAGGER_MS * (0.8 + Math.random() * 0.4));
      setTimeout(() => {
        try { cb(); } catch { /* listener error should not block others */ }
      }, stagger);
    });
  }, RECOVERY_DEBOUNCE_MS);
}

function notify(status: NetworkStatus) {
  const changed = status !== currentStatus;
  const previousStatus = currentStatus;
  currentStatus = status;
  if (changed) {
    const snapshot = [...listeners];
    for (const cb of snapshot) {
      if (typeof cb === 'function') cb(status);
    }
    if (status === 'online' && previousStatus === 'offline') {
      dispatchRecovery();
    }
  }
}

const onlineHandler = () => {
  if (recordFlip()) return;
  if (wasOffline) {
    wasOffline = false;
    notify('online');
    dispatchRecovery();
  } else {
    notify('online');
  }
};
const offlineHandler = () => {
  wasOffline = true;
  if (recordFlip()) return;
  notify('offline');
};

function abortActiveProbe() {
  if (activeProbeController) {
    activeProbeController.abort();
    activeProbeController = null;
  }
  probing = false;
}

async function probeConnectivity(): Promise<boolean> {
  abortActiveProbe();
  const controller = new AbortController();
  activeProbeController = controller;
  const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
      method: 'GET',
      headers: { apikey: supabaseAnonKey },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res.ok || res.status === 401;
  } catch {
    clearTimeout(timeoutId);
    return false;
  } finally {
    if (activeProbeController === controller) {
      activeProbeController = null;
    }
  }
}

async function runProbe() {
  if (probing) return;
  probing = true;
  const reachable = await probeConnectivity();
  probing = false;
  if (reachable) {
    consecutiveProbeFailures = 0;
    clearUnstable();
    if (wasOffline) {
      wasOffline = false;
      notify('online');
      dispatchRecovery();
    } else {
      notify('online');
    }
    return;
  }
  consecutiveProbeFailures += 1;
  if (consecutiveProbeFailures >= 2) {
    wasOffline = true;
    notify('offline');
  }
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
  abortActiveProbe();
  consecutiveProbeFailures = 0;
  clearUnstable();
}

function handleAppStateChange(nextState: string) {
  if (nextState === 'background' || nextState === 'inactive') {
    stopProbing();
  } else if (nextState === 'active') {
    startProbing();
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
  } else {
    registerAppStateHandler('deferred', handleAppStateChange);
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
  return currentStatus === 'online' || currentStatus === 'unstable';
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

export function onNetworkRecovery(listener: RecoveryListener): () => void {
  recoveryListeners.add(listener);
  return () => { recoveryListeners.delete(listener); };
}

export function _resetFlipStateForTesting(): void {
  recentFlips = [];
  if (unstableTimer) {
    clearTimeout(unstableTimer);
    unstableTimer = null;
  }
}
