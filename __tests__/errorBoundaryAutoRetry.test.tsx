/**
 * Tests for ErrorBoundary auto-retry-on-online behavior.
 * Uses react-test-renderer matching the project's existing test conventions.
 */

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
    removeEventListener: (event: string, cb: () => void) => {
      if (event === 'online') {
        const i = onlineListeners.indexOf(cb);
        if (i >= 0) onlineListeners.splice(i, 1);
      }
      if (event === 'offline') {
        const i = offlineListeners.indexOf(cb);
        if (i >= 0) offlineListeners.splice(i, 1);
      }
    },
    setTimeout: (fn: () => void, ms?: number) => global.setTimeout(fn, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => global.clearTimeout(id),
  },
  writable: true,
  configurable: true,
});

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: {
    create: <T extends Record<string, any>>(s: T): T => s,
  },
}));

jest.mock('lucide-react-native', () => ({
  AlertTriangle: 'AlertTriangle',
  RefreshCw: 'RefreshCw',
  WifiOff: 'WifiOff',
  Wifi: 'Wifi',
}));

jest.mock('@/lib/theme', () => ({
  theme: {
    colors: {
      dark: { bg: '#000', surface: '#111', surfaceLight: '#222', text: '#fff', textDim: '#aaa', textFaint: '#666', border: '#333' },
      warning: { 400: '#fbbf24', 500: '#f59e0b' },
      error: { 400: '#f87171' },
      primary: { 300: '#93c5fd', 500: '#3b82f6' },
      success: { 400: '#4ade80', 500: '#22c55e' },
    },
    typography: { title: 18, body: 14, caption: 12, fontFamily: { bold: 'bold', semiBold: '600', regular: 'regular' } },
    spacing: { sm: 8, md: 16, xl: 32, xxl: 48 },
    radius: { md: 8, lg: 16, full: 999 },
    shadows: { elevated: {}, card: {} },
  },
}));

jest.mock('@/lib/errorLogger', () => ({
  logFatal: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

jest.mock('@/components/BootFallback', () => ({
  BootFallback: 'BootFallback',
}));

jest.mock('@/hooks/useNetworkStatus', () => ({
  isOnline: () => (global as any).navigator?.onLine ?? true,
  onNetworkRecovery: (cb: () => void) => {
    (global as any).__networkRecoveryListeners = (global as any).__networkRecoveryListeners || [];
    (global as any).__networkRecoveryListeners.push(cb);
    return () => {
      const list: (() => void)[] = (global as any).__networkRecoveryListeners || [];
      const i = list.indexOf(cb);
      if (i >= 0) list.splice(i, 1);
    };
  },
}));

const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

const { ErrorBoundary } = require('@/components/ErrorBoundary');

function ThrowOnRender({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('test error');
  return React.createElement('Text', null, 'OK');
}

function getAllTexts(testRenderer: any): string[] {
  const texts: string[] = [];
  function walk(node: any) {
    if (typeof node === 'string') {
      texts.push(node);
      return;
    }
    if (node && Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && node.children) {
      if (Array.isArray(node.children)) node.children.forEach(walk);
      else walk(node.children);
    }
  }
  walk(testRenderer.root);
  return texts;
}

describe('ErrorBoundary auto-retry-on-online', () => {
  let testRenderer: any;

  function fireOnline() {
    onlineListeners.forEach((cb) => cb());
    const rec: (() => void)[] = (global as any).__networkRecoveryListeners || [];
    rec.slice().forEach((cb) => cb());
  }

  beforeEach(() => {
    navigatorOnLine = true;
    onlineListeners.length = 0;
    offlineListeners.length = 0;
    (global as any).__networkRecoveryListeners = [];
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (testRenderer) {
      act(() => { testRenderer.unmount(); });
      testRenderer = null;
    }
  });

  it('renders children when no error', () => {
    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(ErrorBoundary, null,
          React.createElement(ThrowOnRender, { shouldThrow: false }),
        ),
      );
    });
    const texts = getAllTexts(testRenderer);
    expect(texts).toContain('OK');
  });

  it('shows error UI when child throws', () => {
    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(ErrorBoundary, null,
          React.createElement(ThrowOnRender, { shouldThrow: true }),
        ),
      );
    });
    const texts = getAllTexts(testRenderer);
    expect(texts.some((t) => t.includes('문제가 발생했어요'))).toBe(true);
  });

  it('shows offline message when navigator.onLine is false', () => {
    navigatorOnLine = false;
    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(ErrorBoundary, null,
          React.createElement(ThrowOnRender, { shouldThrow: true }),
        ),
      );
    });
    const texts = getAllTexts(testRenderer);
    expect(texts.some((t) => t.includes('인터넷 연결이 끊겨 있어요'))).toBe(true);
  });

  it('shows retry button when online', () => {
    navigatorOnLine = true;
    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(ErrorBoundary, null,
          React.createElement(ThrowOnRender, { shouldThrow: true }),
        ),
      );
    });
    const texts = getAllTexts(testRenderer);
    expect(texts).toContain('다시 시도');
  });

  it('hides retry button and shows waiting badge when offline', () => {
    navigatorOnLine = false;
    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(ErrorBoundary, null,
          React.createElement(ThrowOnRender, { shouldThrow: true }),
        ),
      );
    });
    const texts = getAllTexts(testRenderer);
    expect(texts).not.toContain('다시 시도');
    expect(texts.some((t) => t.includes('오프라인'))).toBe(true);
  });

  it('shows auto-recovery hint when offline', () => {
    navigatorOnLine = false;
    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(ErrorBoundary, null,
          React.createElement(ThrowOnRender, { shouldThrow: true }),
        ),
      );
    });
    const texts = getAllTexts(testRenderer);
    expect(texts.some((t) => t.includes('자동으로 복구돼요'))).toBe(true);
  });

  it('auto-retries when online event fires after offline error', () => {
    navigatorOnLine = true;
    let shouldThrow = true;

    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(ErrorBoundary, { key: 'eb1' },
          React.createElement(ThrowOnRender, { shouldThrow }),
        ),
      );
    });
    expect(getAllTexts(testRenderer).some((t) => t.includes('문제가 발생했어요'))).toBe(true);

    act(() => {
      navigatorOnLine = false;
      offlineListeners.forEach((cb) => cb());
    });
    expect(getAllTexts(testRenderer).some((t) => t.includes('오프라인'))).toBe(true);

    shouldThrow = false;
    act(() => {
      testRenderer.update(
        React.createElement(ErrorBoundary, { key: 'eb1' },
          React.createElement(ThrowOnRender, { shouldThrow }),
        ),
      );
    });

    act(() => {
      navigatorOnLine = true;
      fireOnline();
    });

    const texts = getAllTexts(testRenderer);
    expect(texts).not.toContain('문제가 발생했어요');
    expect(texts).toContain('OK');
  });

  it('auto-retries for each new error occurrence when offline→online', () => {
    navigatorOnLine = true;
    let shouldThrow = true;

    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(ErrorBoundary, { key: 'eb2' },
          React.createElement(ThrowOnRender, { shouldThrow }),
        ),
      );
    });
    expect(getAllTexts(testRenderer).some((t) => t.includes('문제가 발생했어요'))).toBe(true);

    // First offline → online cycle: auto-retry succeeds
    act(() => {
      navigatorOnLine = false;
      offlineListeners.forEach((cb) => cb());
    });
    shouldThrow = false;
    act(() => {
      testRenderer.update(
        React.createElement(ErrorBoundary, { key: 'eb2' },
          React.createElement(ThrowOnRender, { shouldThrow }),
        ),
      );
    });
    act(() => {
      navigatorOnLine = true;
      fireOnline();
    });
    expect(getAllTexts(testRenderer)).toContain('OK');

    // Second error, second offline → online cycle: auto-retry should fire again
    shouldThrow = true;
    act(() => {
      testRenderer.update(
        React.createElement(ErrorBoundary, { key: 'eb2' },
          React.createElement(ThrowOnRender, { shouldThrow }),
        ),
      );
    });
    expect(getAllTexts(testRenderer).some((t) => t.includes('문제가 발생했어요'))).toBe(true);

    act(() => {
      navigatorOnLine = false;
      offlineListeners.forEach((cb) => cb());
    });
    shouldThrow = false;
    act(() => {
      testRenderer.update(
        React.createElement(ErrorBoundary, { key: 'eb2' },
          React.createElement(ThrowOnRender, { shouldThrow }),
        ),
      );
    });
    act(() => {
      navigatorOnLine = true;
      fireOnline();
    });
    expect(getAllTexts(testRenderer)).toContain('OK');
  });

  it('cleans up event listeners on unmount', () => {
    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(ErrorBoundary, null,
          React.createElement(ThrowOnRender, { shouldThrow: false }),
        ),
      );
    });
    const initialOnline = onlineListeners.length;
    const initialOffline = offlineListeners.length;
    expect(initialOnline).toBeGreaterThan(0);
    expect(initialOffline).toBeGreaterThan(0);

    act(() => { testRenderer.unmount(); testRenderer = null; });
    expect(onlineListeners.length).toBe(initialOnline - 1);
    expect(offlineListeners.length).toBe(initialOffline - 1);
  });
});
