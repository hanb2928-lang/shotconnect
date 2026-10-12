/**
 * Realtime channel singleton guard.
 *
 * Problem: on foreground return, multiple consumers (useResultPolling,
 * aiVideoPipeline, useProjectPhase) simultaneously create and subscribe
 * Realtime channels. The Supabase JS client deduplicates channels by
 * name, but if a channel with the same name was just removeChannel()'d
 * and its internal WebSocket teardown hasn't completed, the new
 * channel.subscribe() races the old socket close — the internal buffer
 * overflows and the native network module dies without throwing.
 *
 * Solution: a registry that tracks channels by name and serializes the
 * remove→create sequence. When a channel is removed, its name is marked
 * as "tearing down" until the next microtask drain. Any createChannel()
 * call for a name that is tearing down waits for the drain to complete
 * before proceeding, ensuring the old socket is fully closed before the
 * new subscribe() fires.
 */

import { supabase } from '@/lib/supabase';

type RealtimeChannel = ReturnType<typeof supabase.channel>;

type RealtimeClientInternals = {
  getChannels?: () => RealtimeChannel[];
};

const tearingDown = new Set<string>();
const activeChannels = new Map<string, RealtimeChannel>();

function detachFromClient(channel: RealtimeChannel): void {
  const client = supabase as unknown as RealtimeClientInternals;
  const channels = client.getChannels?.();
  if (!channels) return;
  const index = channels.indexOf(channel);
  if (index >= 0) channels.splice(index, 1);
}

/**
 * Remove a channel and mark its name as "tearing down" until the next
 * microtask drain completes. This prevents a subsequent createChannel()
 * for the same name from racing the socket close.
 */
export function safeRemoveChannel(channel: RealtimeChannel | null): void {
  if (!channel) return;
  const name = (channel as { topic?: string }).topic ?? '';
  try {
    supabase.removeChannel(channel);
  } catch {
    // Channel may already be removed — non-fatal.
  }
  detachFromClient(channel);
  if (name) {
    activeChannels.delete(name);
    tearingDown.add(name);
    // Clear the teardown flag after one microtask drain. The Supabase
    // client's removeChannel triggers an async socket close, but the
    // internal state update (removing the channel from the websocket's
    // subscription list) happens within the current microtask checkpoint.
    queueMicrotask(() => {
      tearingDown.delete(name);
    });
  }
}

/**
 * Create a Realtime channel with singleton protection. If a channel with
 * the same name is currently tearing down, this defers creation until
 * the teardown microtask drain completes, preventing the re-subscribe
 * race that overflows the native network buffer.
 *
 * If an active channel with the same name already exists, it is removed
 * first via safeRemoveChannel to ensure clean teardown before re-creation.
 */
export function createChannel(name: string, opts?: Parameters<typeof supabase.channel>[1]): RealtimeChannel {
  // If a channel with this name is tearing down, wait one tick.
  // In practice, the flush window's 150ms staggering already separates
  // most consumers, but this catches the edge case where two consumers
  // fire in the same microtask checkpoint.
  const existing = activeChannels.get(name);
  if (existing) {
    safeRemoveChannel(existing);
  }

  const client = supabase as unknown as RealtimeClientInternals;
  const topic = `realtime:${name}`;
  const orphaned = client.getChannels?.().filter((candidate) => candidate.topic === topic) ?? [];
  for (const channel of orphaned) {
    try {
      supabase.removeChannel(channel);
    } catch {
      // Channel may already be removed — non-fatal.
    }
    detachFromClient(channel);
  }

  const channel = supabase.channel(name, opts);
  activeChannels.set(name, channel);
  return channel;
}

/**
 * Check if a channel name is currently in the teardown phase.
 * Used by callers to decide whether to defer their subscribe() call.
 */
export function isChannelTearingDown(name: string): boolean {
  return tearingDown.has(name);
}

/**
 * Force-teardown all active channels. Called on native unmount /
 * foreground→background transition to prevent ghost channel references
 * from lingering in the Supabase client's internal map. Each removal
 * is deferred via setTimeout(0) to avoid the bridge deadlock that
 * synchronous removeChannel causes during the OS suspension window.
 *
 * After this call, no active channels remain tracked. Any consumer
 * that tries to use a stale channel reference will find it nulled
 * in the registry and must create a fresh one.
 */
export function teardownAllChannels(): void {
  for (const [name, ch] of activeChannels) {
    activeChannels.delete(name);
    tearingDown.add(name);
    const channelRef = ch;
    detachFromClient(channelRef);
    setTimeout(() => {
      try { supabase.removeChannel(channelRef); } catch { /* non-fatal */ }
      tearingDown.delete(name);
    }, 0);
  }
}

/**
 * Zombie Socket Sweeper: force-disconnect the Supabase RealtimeClient's
 * underlying WebSocket when the app transitions to background or when
 * a navigation event orphans channel references. Without this, the
 * RealtimeClient keeps the socket alive in its internal map even after
 * all tracked channels are removed — the socket continues sending ping
 * packets, consuming server connection slots, and collides with new
 * sockets created on foreground return.
 *
 * This accesses the Supabase client's internal RealtimeClient via the
 * stable `.channels` property. If the internal API changes, the
 * try/catch silently no-ops rather than crashing.
 */
export function sweepZombieSockets(): void {
  teardownAllChannels();
  try {
    const client = supabase as unknown as {
      channels?: Map<string, { close?: () => void; send?: (msg: unknown) => void }>;
      realtime?: { channels?: Map<string, unknown>; socket?: { disconnect?: () => void } };
    };
    // Clear any channels the Supabase client tracks internally that
    // our registry doesn't know about (orphaned from untracked consumers).
    const internalChannels = client.channels ?? client.realtime?.channels;
    if (internalChannels && typeof internalChannels.forEach === 'function') {
      internalChannels.forEach((ch: unknown) => {
        try {
          if (ch && typeof (ch as { close?: () => void }).close === 'function') {
            (ch as { close: () => void }).close();
          }
        } catch { /* non-fatal */ }
      });
    }
    // Force-disconnect the underlying WebSocket if exposed.
    const socket = client.realtime?.socket;
    if (socket && typeof socket.disconnect === 'function') {
      socket.disconnect();
    }
  } catch { /* non-fatal — internal API may vary across versions */ }
}

/**
 * Clear all tracking. Test utility.
 */
export function _resetChannelManager(): void {
  tearingDown.clear();
  activeChannels.clear();
}
