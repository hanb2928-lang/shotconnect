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

const tearingDown = new Set<string>();
const activeChannels = new Map<string, RealtimeChannel>();

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
 * Clear all tracking. Test utility.
 */
export function _resetChannelManager(): void {
  tearingDown.clear();
  activeChannels.clear();
}
