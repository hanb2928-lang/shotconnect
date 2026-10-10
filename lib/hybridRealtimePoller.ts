/**
 * Hybrid Realtime + Polling Load Controller
 *
 * Coordinates Supabase Realtime websocket subscriptions with fallback DB
 * polling so they are never both running at full frequency simultaneously.
 *
 * When the Realtime channel is HEALTHY (receiving events), polling backs
 * off to a long interval (default 15s) to minimize redundant DB queries.
 * When the channel degrades or disconnects, polling immediately drops to
 * a fast interval (default 3s) to maintain responsiveness.
 *
 * This prevents the scenario where a flaky network causes the websocket
 * to reconnect repeatedly while the polling timer also fires at full speed,
 * multiplying server load and exhausting the DB connection pool.
 *
 * Health transitions:
 *   DISCONNECTED → SUBSCRIBED:  poll backs off to HEALTHY_INTERVAL
 *   HEALTHY → CHANNEL_ERROR:    poll drops to DEGRADED_INTERVAL
 *   HEALTHY → CLOSED:           poll drops to DEGRADED_INTERVAL
 *   Any realtime event received: poll backs off (reset to healthy cadence)
 */

export type ChannelHealth = 'HEALTHY' | 'DEGRADED' | 'DISCONNECTED';

export interface HybridPollConfig {
  healthyPollMs: number;
  degradedPollMs: number;
  maxPollMs: number;
  backoffFactor: number;
}

export const DEFAULT_HYBRID_CONFIG: HybridPollConfig = {
  healthyPollMs: 15_000,
  degradedPollMs: 3_000,
  maxPollMs: 30_000,
  backoffFactor: 1.8,
};

export class HybridRealtimePoller {
  private health: ChannelHealth = 'DISCONNECTED';
  private pollAttempt = 0;
  private config: HybridPollConfig;
  private onHealthChange?: (health: ChannelHealth) => void;

  constructor(
    config?: Partial<HybridPollConfig>,
    onHealthChange?: (health: ChannelHealth) => void,
  ) {
    this.config = { ...DEFAULT_HYBRID_CONFIG, ...config };
    this.onHealthChange = onHealthChange;
  }

  getHealth(): ChannelHealth {
    return this.health;
  }

  markHealthy(): void {
    const prev = this.health;
    this.health = 'HEALTHY';
    this.pollAttempt = 0;
    if (prev !== 'HEALTHY' && this.onHealthChange) {
      this.onHealthChange('HEALTHY');
    }
  }

  markDegraded(): void {
    const prev = this.health;
    this.health = 'DEGRADED';
    this.pollAttempt = 0;
    if (prev !== 'DEGRADED' && this.onHealthChange) {
      this.onHealthChange('DEGRADED');
    }
  }

  markDisconnected(): void {
    const prev = this.health;
    this.health = 'DISCONNECTED';
    this.pollAttempt = 0;
    if (prev !== 'DISCONNECTED' && this.onHealthChange) {
      this.onHealthChange('DISCONNECTED');
    }
  }

  /**
   * Computes the next poll delay based on current channel health.
   * When healthy, uses the healthy interval with mild backoff to further
   * reduce load during long-running jobs. When degraded/disconnected,
   * uses the fast interval with standard exponential backoff up to max.
   */
  nextPollDelayMs(): number {
    const base = this.health === 'HEALTHY'
      ? this.config.healthyPollMs
      : this.config.degradedPollMs;

    const delay = Math.min(
      Math.round(base * Math.pow(this.config.backoffFactor, this.pollAttempt)),
      this.config.maxPollMs,
    );

    this.pollAttempt++;
    return delay;
  }

  /**
   * Called after a realtime event is received. Resets the poll backoff
   * so the next poll is far in the future (the realtime channel is working).
   */
  onRealtimeEvent(): void {
    this.markHealthy();
  }

  /**
   * Maps a Supabase channel subscribe status string to a health state.
   */
  static statusToHealth(status: string): ChannelHealth {
    if (status === 'SUBSCRIBED') return 'HEALTHY';
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') return 'DEGRADED';
    if (status === 'CLOSED') return 'DISCONNECTED';
    return 'DEGRADED';
  }
}
