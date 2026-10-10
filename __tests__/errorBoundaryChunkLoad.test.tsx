/**
 * Tests for ErrorBoundary ChunkLoadError detection and cache-busting reload.
 */

let navigatorOnLine = true;
const onlineListeners: (() => void)[] = [];
const offlineListeners: (() => void)[] = [];

let mockLocationHref = 'http://localhost:8081/';
let replaceUrl: string | null = null;
let reloadCalled = false;

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
    location: {
      get href() { return mockLocationHref; },
      replace: (url: string) => { replaceUrl = url; },
      reload: () => { reloadCalled = true; },
    },
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
  PackageX: 'PackageX',
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

const mockLogFatal = jest.fn();
const mockAddBreadcrumb = jest.fn();
jest.mock('@/lib/errorLogger', () => ({
  logFatal: (...args: any[]) => mockLogFatal(...args),
  addBreadcrumb: (...args: any[]) => mockAddBreadcrumb(...args),
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

function ThrowOnRender({ errorType }: { errorType: 'none' | 'chunk' | 'generic' }) {
  if (errorType === 'chunk') {
    const err = new Error('Loading chunk 42 failed.');
    err.name = 'ChunkLoadError';
    throw err;
  }
  if (errorType === 'generic') throw new Error('something broke');
  return React.createElement('Text', null, 'OK');
}

function getAllTexts(testRenderer: any): string[] {
  const texts: string[] = [];
  function walk(node: any) {
    if (typeof node === 'string') { texts.push(node); return; }
    if (node && Array.isArray(node)) { node.forEach(walk); return; }
    if (node && node.children) {
      if (Array.isArray(node.children)) node.children.forEach(walk);
      else walk(node.children);
    }
  }
  walk(testRenderer.root);
  return texts;
}

describe('ErrorBoundary ChunkLoadError detection', () => {
  let testRenderer: any;

  beforeEach(() => {
    navigatorOnLine = true;
    onlineListeners.length = 0;
    offlineListeners.length = 0;
    replaceUrl = null;
    reloadCalled = false;
    mockLocationHref = 'http://localhost:8081/';
    mockLogFatal.mockClear();
    mockAddBreadcrumb.mockClear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    if (testRenderer) {
      act(() => { testRenderer.unmount(); });
      testRenderer = null;
    }
    jest.useRealTimers();
  });

  it('renders children when no error', () => {
    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(ErrorBoundary, null,
          React.createElement(ThrowOnRender, { errorType: 'none' }),
        ),
      );
    });
    expect(getAllTexts(testRenderer)).toContain('OK');
  });

  it('detects ChunkLoadError and shows update message', () => {
    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(ErrorBoundary, null,
          React.createElement(ThrowOnRender, { errorType: 'chunk' }),
        ),
      );
    });
    const texts = getAllTexts(testRenderer);
    expect(texts.some((t) => t.includes('앱이 업데이트되어'))).toBe(true);
  });

  it('shows cache-busting reload button for chunk errors', () => {
    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(ErrorBoundary, null,
          React.createElement(ThrowOnRender, { errorType: 'chunk' }),
        ),
      );
    });
    const texts = getAllTexts(testRenderer);
    expect(texts).toContain('최신 버전으로 새로고침');
    expect(texts).not.toContain('다시 시도');
  });

  it('shows generic error UI for non-chunk errors', () => {
    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(ErrorBoundary, null,
          React.createElement(ThrowOnRender, { errorType: 'generic' }),
        ),
      );
    });
    const texts = getAllTexts(testRenderer);
    expect(texts).toContain('다시 시도');
    expect(texts).not.toContain('최신 버전으로 새로고침');
  });

  it('auto-triggers cache-busting reload on chunk error after delay', () => {
    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(ErrorBoundary, null,
          React.createElement(ThrowOnRender, { errorType: 'chunk' }),
        ),
      );
    });
    expect(replaceUrl).toBeNull();
    act(() => { jest.advanceTimersByTime(600); });
    expect(replaceUrl).not.toBeNull();
    expect(replaceUrl).toContain('_cb=');
  });

  it('does not auto-reload for generic errors', () => {
    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(ErrorBoundary, null,
          React.createElement(ThrowOnRender, { errorType: 'generic' }),
        ),
      );
    });
    act(() => { jest.advanceTimersByTime(1000); });
    expect(replaceUrl).toBeNull();
    expect(reloadCalled).toBe(false);
  });

  it('logs breadcrumb for chunk error', () => {
    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(ErrorBoundary, null,
          React.createElement(ThrowOnRender, { errorType: 'chunk' }),
        ),
      );
    });
    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      'chunk',
      expect.stringContaining('ChunkLoadError'),
      'warning',
      expect.any(Object),
    );
  });

  it('hides stack trace for chunk errors (not useful to user)', () => {
    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(ErrorBoundary, null,
          React.createElement(ThrowOnRender, { errorType: 'chunk' }),
        ),
      );
    });
    const texts = getAllTexts(testRenderer);
    expect(texts.some((t) => t.includes('캐시를 초기화'))).toBe(true);
  });

  it('detects dynamic import failure as chunk error', () => {
    function ThrowDynamicImport() {
      const err = new Error('Failed to fetch dynamically imported module: /assets/foo.js');
      throw err;
    }
    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(ErrorBoundary, null,
          React.createElement(ThrowDynamicImport),
        ),
      );
    });
    const texts = getAllTexts(testRenderer);
    expect(texts.some((t) => t.includes('앱이 업데이트되어'))).toBe(true);
    expect(texts).toContain('최신 버전으로 새로고침');
  });

  it('detects CSS chunk load failure as chunk error', () => {
    function ThrowCssChunk() {
      const err = new Error('Loading CSS chunk 12 failed.');
      throw err;
    }
    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(ErrorBoundary, null,
          React.createElement(ThrowCssChunk),
        ),
      );
    });
    const texts = getAllTexts(testRenderer);
    expect(texts).toContain('최신 버전으로 새로고침');
  });

  it('manual reload button triggers cache-busting reload', () => {
    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(ErrorBoundary, null,
          React.createElement(ThrowOnRender, { errorType: 'chunk' }),
        ),
      );
    });
    // Prevent the auto-reload timer from firing
    act(() => { jest.advanceTimersByTime(200); });

    const buttons = testRenderer.root.findAllByType('TouchableOpacity');
    expect(buttons.length).toBeGreaterThan(0);

    act(() => {
      buttons[0].props.onPress();
    });

    expect(replaceUrl).not.toBeNull();
    expect(replaceUrl).toContain('_cb=');
  });

  it('cache-busting URL preserves existing query params', () => {
    mockLocationHref = 'http://localhost:8081/?tab=home&foo=bar';
    act(() => {
      testRenderer = TestRenderer.create(
        React.createElement(ErrorBoundary, null,
          React.createElement(ThrowOnRender, { errorType: 'chunk' }),
        ),
      );
    });
    act(() => { jest.advanceTimersByTime(600); });
    expect(replaceUrl).not.toBeNull();
    expect(replaceUrl).toContain('tab=home');
    expect(replaceUrl).toContain('foo=bar');
    expect(replaceUrl).toContain('_cb=');
  });
});
