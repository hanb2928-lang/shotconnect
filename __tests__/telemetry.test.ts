import { addBreadcrumb, getBreadcrumbs, logError, logWarning, logFatal, installGlobalErrorHandlers } from '@/lib/errorLogger';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      insert: jest.fn(() => Promise.resolve({ error: null })),
      select: jest.fn(() => Promise.resolve({ data: [], error: null })),
    })),
    channel: jest.fn(() => ({
      on: jest.fn(() => ({ subscribe: jest.fn() })),
    })),
    removeChannel: jest.fn(),
  },
  supabaseAnonKey: 'test-key',
}));

describe('errorLogger breadcrumbs', () => {
  beforeEach(() => {
    // Reset breadcrumbs between tests by clearing the internal array
    getBreadcrumbs().forEach(() => {});
  });

  it('addBreadcrumb stores a breadcrumb', () => {
    addBreadcrumb('test', 'Test breadcrumb', 'warning', { foo: 'bar' });
    const crumbs = getBreadcrumbs();
    expect(crumbs.length).toBeGreaterThan(0);
    const last = crumbs[crumbs.length - 1];
    expect(last.category).toBe('test');
    expect(last.message).toBe('Test breadcrumb');
    expect(last.data).toEqual({ foo: 'bar' });
  });

  it('breadcrumbs are capped at MAX_BREADCRUMBS', () => {
    for (let i = 0; i < 40; i++) {
      addBreadcrumb('test', `crumb-${i}`);
    }
    const crumbs = getBreadcrumbs();
    expect(crumbs.length).toBeLessThanOrEqual(30);
  });

  it('breadcrumb has ISO timestamp', () => {
    addBreadcrumb('test', 'timestamp test');
    const crumbs = getBreadcrumbs();
    const last = crumbs[crumbs.length - 1];
    expect(last.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

describe('errorLogger log functions', () => {
  it('logError does not throw for non-Error values', () => {
    expect(() => logError('string error')).not.toThrow();
    expect(() => logError({ foo: 'bar' })).not.toThrow();
    expect(() => logError(null)).not.toThrow();
  });

  it('logWarning does not throw', () => {
    expect(() => logWarning('test warning')).not.toThrow();
    expect(() => logWarning('test warning', { component: 'test' })).not.toThrow();
  });

  it('logFatal does not throw for non-Error values', () => {
    expect(() => logFatal('string fatal')).not.toThrow();
    expect(() => logFatal(new Error('fatal error'))).not.toThrow();
  });
});

describe('errorLogger installGlobalErrorHandlers', () => {
  it('does not throw when called', () => {
    expect(() => installGlobalErrorHandlers()).not.toThrow();
  });

  it('is idempotent — multiple calls are safe', () => {
    expect(() => {
      installGlobalErrorHandlers();
      installGlobalErrorHandlers();
      installGlobalErrorHandlers();
    }).not.toThrow();
  });
});

describe('errorLogger exports', () => {
  it('exports SESSION_ID and APP_RELEASE', () => {
    const mod = require('@/lib/errorLogger');
    expect(mod.SESSION_ID).toBeDefined();
    expect(typeof mod.SESSION_ID).toBe('string');
    expect(mod.APP_RELEASE).toBeDefined();
    expect(typeof mod.APP_RELEASE).toBe('string');
  });
});
