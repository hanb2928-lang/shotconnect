jest.mock('@/lib/errorLogger', () => ({
  addBreadcrumb: jest.fn(),
}));

import {
  HybridRealtimePoller,
  DEFAULT_HYBRID_CONFIG,
  type ChannelHealth,
} from '@/lib/hybridRealtimePoller';

describe('HybridRealtimePoller', () => {
  it('starts disconnected with fast poll interval', () => {
    const poller = new HybridRealtimePoller();
    const delay = poller.nextPollDelayMs();
    expect(delay).toBe(DEFAULT_HYBRID_CONFIG.degradedPollMs);
  });

  it('backs off to healthy interval after marking healthy', () => {
    const poller = new HybridRealtimePoller();
    poller.markHealthy();
    const delay = poller.nextPollDelayMs();
    expect(delay).toBe(DEFAULT_HYBRID_CONFIG.healthyPollMs);
    expect(delay).toBeGreaterThan(DEFAULT_HYBRID_CONFIG.degradedPollMs);
  });

  it('drops to degraded interval when channel degrades', () => {
    const poller = new HybridRealtimePoller();
    poller.markHealthy();
    poller.nextPollDelayMs(); // consume one healthy cycle
    poller.markDegraded();
    const delay = poller.nextPollDelayMs();
    expect(delay).toBe(DEFAULT_HYBRID_CONFIG.degradedPollMs);
  });

  it('drops to degraded interval when channel disconnects', () => {
    const poller = new HybridRealtimePoller();
    poller.markHealthy();
    poller.markDisconnected();
    const delay = poller.nextPollDelayMs();
    expect(delay).toBe(DEFAULT_HYBRID_CONFIG.degradedPollMs);
  });

  it('resets backoff when health changes', () => {
    const poller = new HybridRealtimePoller();
    poller.nextPollDelayMs();
    poller.nextPollDelayMs();
    poller.nextPollDelayMs();
    poller.markDegraded();
    const delay = poller.nextPollDelayMs();
    expect(delay).toBe(DEFAULT_HYBRID_CONFIG.degradedPollMs);
  });

  it('onRealtimeEvent marks healthy and resets backoff', () => {
    const poller = new HybridRealtimePoller();
    poller.markDegraded();
    poller.nextPollDelayMs();
    poller.nextPollDelayMs();
    poller.onRealtimeEvent();
    expect(poller.getHealth()).toBe('HEALTHY');
    const delay = poller.nextPollDelayMs();
    expect(delay).toBe(DEFAULT_HYBRID_CONFIG.healthyPollMs);
  });

  it('applies exponential backoff within same health state', () => {
    const poller = new HybridRealtimePoller();
    poller.markHealthy();
    const d1 = poller.nextPollDelayMs();
    const d2 = poller.nextPollDelayMs();
    const d3 = poller.nextPollDelayMs();
    expect(d2).toBeGreaterThan(d1);
    expect(d3).toBeGreaterThan(d2);
  });

  it('caps at maxPollMs', () => {
    const poller = new HybridRealtimePoller({ maxPollMs: 50000, degradedPollMs: 1000, backoffFactor: 10 });
    poller.markDegraded();
    for (let i = 0; i < 20; i++) poller.nextPollDelayMs();
    const delay = poller.nextPollDelayMs();
    expect(delay).toBeLessThanOrEqual(50000);
  });

  it('calls onHealthChange callback on transitions', () => {
    const transitions: ChannelHealth[] = [];
    const poller = new HybridRealtimePoller(undefined, (h) => transitions.push(h));
    poller.markHealthy();
    poller.markHealthy();
    poller.markDegraded();
    poller.markDisconnected();
    poller.markDegraded();
    expect(transitions).toEqual(['HEALTHY', 'DEGRADED', 'DISCONNECTED', 'DEGRADED']);
  });

  it('does not fire callback for same-state transitions', () => {
    const transitions: ChannelHealth[] = [];
    const poller = new HybridRealtimePoller(undefined, (h) => transitions.push(h));
    poller.markDisconnected();
    poller.markDisconnected();
    expect(transitions).toHaveLength(0);
  });

  it('statusToHealth maps Supabase status strings', () => {
    expect(HybridRealtimePoller.statusToHealth('SUBSCRIBED')).toBe('HEALTHY');
    expect(HybridRealtimePoller.statusToHealth('CHANNEL_ERROR')).toBe('DEGRADED');
    expect(HybridRealtimePoller.statusToHealth('TIMED_OUT')).toBe('DEGRADED');
    expect(HybridRealtimePoller.statusToHealth('CLOSED')).toBe('DISCONNECTED');
    expect(HybridRealtimePoller.statusToHealth('UNKNOWN')).toBe('DEGRADED');
  });

  it('accepts custom config overrides', () => {
    const poller = new HybridRealtimePoller({
      healthyPollMs: 60_000,
      degradedPollMs: 5_000,
      maxPollMs: 120_000,
    });
    poller.markHealthy();
    expect(poller.nextPollDelayMs()).toBe(60_000);
    poller.markDegraded();
    expect(poller.nextPollDelayMs()).toBe(5_000);
  });
});
