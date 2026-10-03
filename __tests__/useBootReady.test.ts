/**
 * Tests for useBootReady hook.
 * Verifies that boot readiness is only reported after fonts + storage
 * are confirmed ready, and that the hard timeout forces readiness.
 */

let sessionStorageStore: Record<string, string> = {};

Object.defineProperty(global, 'window', {
  value: {
    sessionStorage: {
      getItem: (key: string) => sessionStorageStore[key] ?? null,
      setItem: (key: string, value: string) => { sessionStorageStore[key] = value; },
      removeItem: (key: string) => { delete sessionStorageStore[key]; },
      clear: () => { sessionStorageStore = {}; },
      get length() { return Object.keys(sessionStorageStore).length; },
      key: (index: number) => Object.keys(sessionStorageStore)[index] ?? null,
    },
  },
  writable: true,
  configurable: true,
});

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// Track storage readiness state
let mockStorageReady = false;
jest.mock('@/lib/storage', () => ({
  initStorage: () => Promise.resolve(),
  isStorageReady: () => mockStorageReady,
}));

const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

const { useBootReady } = require('@/hooks/useBootReady');

function HookComp({ fontsReady, bootPhase }: { fontsReady: boolean; bootPhase: 'booting' | 'booted' }) {
  const { isBootReady } = useBootReady({ fontsReady, bootPhase });
  return React.createElement('Text', { testID: 'ready' }, String(isBootReady));
}

describe('useBootReady', () => {
  beforeEach(() => {
    sessionStorageStore = {};
    mockStorageReady = false;
    jest.clearAllMocks();
    jest.useFakeTimers({ now: 1000000 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reports not ready when booting and fonts not ready', () => {
    let testRenderer: any;
    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(HookComp, { fontsReady: false, bootPhase: 'booting' }),
      );
    });
    expect(testRenderer.root.findByType('Text').props.children).toBe('false');
    act(() => { testRenderer.unmount(); });
  });

  it('reports not ready when booted but fonts not ready', () => {
    mockStorageReady = true;
    let testRenderer: any;
    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(HookComp, { fontsReady: false, bootPhase: 'booted' }),
      );
    });
    expect(testRenderer.root.findByType('Text').props.children).toBe('false');
    act(() => { testRenderer.unmount(); });
  });

  it('reports not ready when booted and fonts ready but storage not ready', () => {
    mockStorageReady = false;
    let testRenderer: any;
    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(HookComp, { fontsReady: true, bootPhase: 'booted' }),
      );
    });
    // Storage not ready yet — should not be ready immediately
    expect(testRenderer.root.findByType('Text').props.children).toBe('false');
    act(() => { testRenderer.unmount(); });
  });

  it('reports ready immediately when booted, fonts ready, and storage ready (Fast Refresh)', () => {
    mockStorageReady = true;
    let testRenderer: any;
    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(HookComp, { fontsReady: true, bootPhase: 'booted' }),
      );
    });
    expect(testRenderer.root.findByType('Text').props.children).toBe('true');
    act(() => { testRenderer.unmount(); });
  });

  it('transitions to ready after storage initializes', async () => {
    mockStorageReady = false;
    let testRenderer: any;
    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(HookComp, { fontsReady: true, bootPhase: 'booted' }),
      );
    });
    expect(testRenderer.root.findByType('Text').props.children).toBe('false');

    // Simulate storage becoming ready
    mockStorageReady = true;
    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    expect(testRenderer.root.findByType('Text').props.children).toBe('true');
    act(() => { testRenderer.unmount(); });
  });

  it('forces ready after hard timeout even if resources never resolve', async () => {
    mockStorageReady = false;
    let testRenderer: any;
    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(HookComp, { fontsReady: false, bootPhase: 'booted' }),
      );
    });
    expect(testRenderer.root.findByType('Text').props.children).toBe('false');

    // Advance past the 2.5s hard timeout + 1s poll window.
    // Advance in steps so the setInterval poll fires.
    await act(async () => {
      jest.advanceTimersByTime(2600);
    });
    await act(async () => {
      jest.advanceTimersByTime(1100);
    });

    expect(testRenderer.root.findByType('Text').props.children).toBe('true');
    act(() => { testRenderer.unmount(); });
  });

  it('does not report ready during booting phase even if resources are ready', () => {
    mockStorageReady = true;
    let testRenderer: any;
    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(HookComp, { fontsReady: true, bootPhase: 'booting' }),
      );
    });
    // bootPhase is 'booting' — should not be ready
    expect(testRenderer.root.findByType('Text').props.children).toBe('false');
    act(() => { testRenderer.unmount(); });
  });

  it('updates when fonts become ready after initial render', async () => {
    mockStorageReady = true;
    let testRenderer: any;
    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(HookComp, { fontsReady: false, bootPhase: 'booted' }),
      );
    });
    expect(testRenderer.root.findByType('Text').props.children).toBe('false');

    act(() => {
      testRenderer.update(
        React.createElement(HookComp, { fontsReady: true, bootPhase: 'booted' }),
      );
    });

    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    expect(testRenderer.root.findByType('Text').props.children).toBe('true');
    act(() => { testRenderer.unmount(); });
  });
});
