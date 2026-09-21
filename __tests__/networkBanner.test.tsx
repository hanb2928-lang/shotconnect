// Test useNetworkStatus hook's event listener logic directly.
// The hook registers window event listeners at module-load time via init().
// We set up mocks BEFORE requiring the module so init() picks them up.

let navigatorOnLine = true;
const onlineListeners: (() => void)[] = [];
const offlineListeners: (() => void)[] = [];

Object.defineProperty(global, 'navigator', {
  value: { get onLine() { return navigatorOnLine; } },
  writable: true,
  configurable: true,
});

Object.defineProperty(global, 'window', {
  value: {
    addEventListener: (event: string, cb: () => void) => {
      if (event === 'online') onlineListeners.push(cb);
      if (event === 'offline') offlineListeners.push(cb);
    },
    removeEventListener: () => {},
    setTimeout: (fn: () => void, ms?: number) => global.setTimeout(fn, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => global.clearTimeout(id),
  },
  writable: true,
  configurable: true,
});

// Mock react-native BEFORE requiring the hook
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// Require AFTER all mocks are in place so init() sees them
const { useNetworkStatus, isOnline } = require('@/hooks/useNetworkStatus');

// Simple React test renderer to verify hook state
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

function HookComp() {
  const status = useNetworkStatus();
  return React.createElement('Text', { testID: 'status' }, status);
}

describe('NetworkBanner — useNetworkStatus transitions', () => {
  beforeEach(() => {
    navigatorOnLine = true;
    // Reset to online by firing online event
    onlineListeners.forEach((cb) => cb());
  });

  it('registers window event listeners at module load', () => {
    expect(offlineListeners.length).toBeGreaterThan(0);
    expect(onlineListeners.length).toBeGreaterThan(0);
  });

  it('starts as online when navigator.onLine is true', () => {
    expect(isOnline()).toBe(true);
    let testRenderer: any;
    act(() => {
      testRenderer = TestRenderer.create(React.createElement(HookComp));
    });
    expect(testRenderer.root.findByType('Text').props.children).toBe('online');
  });

  it('transitions to offline when offline event fires', () => {
    let testRenderer: any;
    act(() => {
      testRenderer = TestRenderer.create(React.createElement(HookComp));
    });

    act(() => {
      navigatorOnLine = false;
      offlineListeners.forEach((cb) => cb());
    });

    expect(isOnline()).toBe(false);
    expect(testRenderer.root.findByType('Text').props.children).toBe('offline');
  });

  it('transitions back to online when online event fires after offline', () => {
    let testRenderer: any;
    act(() => {
      testRenderer = TestRenderer.create(React.createElement(HookComp));
    });

    act(() => {
      navigatorOnLine = false;
      offlineListeners.forEach((cb) => cb());
    });
    expect(testRenderer.root.findByType('Text').props.children).toBe('offline');

    act(() => {
      navigatorOnLine = true;
      onlineListeners.forEach((cb) => cb());
    });
    expect(testRenderer.root.findByType('Text').props.children).toBe('online');
    expect(isOnline()).toBe(true);
  });
});
