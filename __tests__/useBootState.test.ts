/**
 * Tests for useBootState hook.
 * Verifies fresh boot detection via sessionStorage, Fast Refresh skip,
 * marker writing, and cleanup on unmount during booting.
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

const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

const { useBootState, resetBootState } = require('@/hooks/useBootState');

function HookComp() {
  const { phase, isFreshBoot, markBooted } = useBootState();
  return React.createElement('Text', { testID: 'phase' }, `${phase}|${isFreshBoot}`);
}

describe('useBootState', () => {
  beforeEach(() => {
    sessionStorageStore = {};
    jest.clearAllMocks();
    // jest-expo sets __DEV__ = true globally; default to false for
    // non-dev-mode tests so the boot marker logic is testable.
    (global as any).__DEV__ = false;
  });

  afterEach(() => {
    sessionStorageStore = {};
  });

  it('starts in booting phase on fresh page load (no marker)', () => {
    let testRenderer: any;
    act(() => {
      testRenderer = TestRenderer.create(React.createElement(HookComp));
    });
    const text = testRenderer.root.findByType('Text').props.children;
    expect(text).toBe('booting|true');
    act(() => { testRenderer.unmount(); });
  });

  it('transitions to booted after markBooted is called', () => {
    let testRenderer: any;
    let hookResult: any;

    function HookCompWithButton() {
      const result = useBootState();
      hookResult = result;
      return React.createElement('Text', { testID: 'phase' }, `${result.phase}|${result.isFreshBoot}`);
    }

    act(() => {
      testRenderer = TestRenderer.create(React.createElement(HookCompWithButton));
    });
    expect(hookResult.phase).toBe('booting');

    act(() => {
      hookResult.markBooted();
    });
    expect(hookResult.phase).toBe('booted');
    expect(sessionStorageStore['shotconnect-boot-session']).toBe('1');
    expect(sessionStorageStore['shotconnect-boot-version']).toBeDefined();

    act(() => { testRenderer.unmount(); });
  });

  it('starts in booted phase when marker and version match (Fast Refresh)', () => {
    sessionStorageStore['shotconnect-boot-session'] = '1';
    sessionStorageStore['shotconnect-boot-version'] = '20261001-shotconnect-v2';

    let testRenderer: any;
    act(() => {
      testRenderer = TestRenderer.create(React.createElement(HookComp));
    });
    const text = testRenderer.root.findByType('Text').props.children;
    expect(text).toBe('booted|false');
    act(() => { testRenderer.unmount(); });
  });

  it('does not re-write marker if already booted', () => {
    sessionStorageStore['shotconnect-boot-session'] = '1';
    sessionStorageStore['shotconnect-boot-version'] = '20261001-shotconnect-v2';

    let testRenderer: any;
    let hookResult: any;

    function HookCompWithButton() {
      const result = useBootState();
      hookResult = result;
      return React.createElement('Text', null, result.phase);
    }

    act(() => {
      testRenderer = TestRenderer.create(React.createElement(HookCompWithButton));
    });
    expect(hookResult.phase).toBe('booted');

    act(() => {
      hookResult.markBooted();
    });
    expect(hookResult.phase).toBe('booted');
    expect(sessionStorageStore['shotconnect-boot-session']).toBe('1');

    act(() => { testRenderer.unmount(); });
  });

  it('clears marker on unmount if still booting', () => {
    sessionStorageStore = {};

    let testRenderer: any;
    act(() => {
      testRenderer = TestRenderer.create(React.createElement(HookComp));
    });
    expect(sessionStorageStore['shotconnect-boot-session']).toBeUndefined();

    act(() => { testRenderer.unmount(); });
    expect(sessionStorageStore['shotconnect-boot-session']).toBeUndefined();
  });

  it('preserves marker on unmount if already booted', () => {
    sessionStorageStore['shotconnect-boot-version'] = '20261001-shotconnect-v2';

    let testRenderer: any;
    let hookResult: any;

    function HookCompWithButton() {
      const result = useBootState();
      hookResult = result;
      return React.createElement('Text', null, result.phase);
    }

    act(() => {
      testRenderer = TestRenderer.create(React.createElement(HookCompWithButton));
    });
    act(() => { hookResult.markBooted(); });
    expect(sessionStorageStore['shotconnect-boot-session']).toBe('1');

    act(() => { testRenderer.unmount(); });
    expect(sessionStorageStore['shotconnect-boot-session']).toBe('1');
  });

  it('resetBootState clears the marker', () => {
    sessionStorageStore['shotconnect-boot-session'] = '1';
    sessionStorageStore['shotconnect-boot-version'] = '20261001-shotconnect-v2';
    resetBootState();
    expect(sessionStorageStore['shotconnect-boot-session']).toBeUndefined();
    expect(sessionStorageStore['shotconnect-boot-version']).toBeUndefined();
  });

  it('starts fresh booting when marker exists but version mismatches (preview update)', () => {
    sessionStorageStore['shotconnect-boot-session'] = '1';
    sessionStorageStore['shotconnect-boot-version'] = 'old-version-20260901';

    let testRenderer: any;
    act(() => {
      testRenderer = TestRenderer.create(React.createElement(HookComp));
    });
    // Version mismatch → treated as fresh boot, not Fast Refresh skip
    const text = testRenderer.root.findByType('Text').props.children;
    expect(text).toBe('booting|true');
    // Stale markers should have been cleaned up
    expect(sessionStorageStore['shotconnect-boot-session']).toBeUndefined();
    expect(sessionStorageStore['shotconnect-boot-version']).toBeUndefined();
    act(() => { testRenderer.unmount(); });
  });

  describe('dev mode (__DEV__)', () => {
    let originalDev: boolean | undefined;

    beforeEach(() => {
      originalDev = (global as any).__DEV__;
      (global as any).__DEV__ = true;
    });

    afterEach(() => {
      if (originalDev === undefined) {
        delete (global as any).__DEV__;
      } else {
        (global as any).__DEV__ = originalDev;
      }
    });

    it('forces fresh boot even when valid marker exists', () => {
      sessionStorageStore['shotconnect-boot-session'] = '1';
      sessionStorageStore['shotconnect-boot-version'] = '20261001-shotconnect-v2';

      let testRenderer: any;
      act(() => {
        testRenderer = TestRenderer.create(React.createElement(HookComp));
      });
      // In dev mode, marker is ignored — always boots fresh
      const text = testRenderer.root.findByType('Text').props.children;
      expect(text).toBe('booting|true');
      act(() => { testRenderer.unmount(); });
    });

    it('does not persist boot marker after markBooted in dev mode', () => {
      let testRenderer: any;
      let hookResult: any;

      function HookCompWithButton() {
        const result = useBootState();
        hookResult = result;
        return React.createElement('Text', null, result.phase);
      }

      act(() => {
        testRenderer = TestRenderer.create(React.createElement(HookCompWithButton));
      });
      expect(hookResult.phase).toBe('booting');

      act(() => {
        hookResult.markBooted();
      });
      expect(hookResult.phase).toBe('booted');
      // In dev mode, marker should NOT be written to sessionStorage
      expect(sessionStorageStore['shotconnect-boot-session']).toBeUndefined();
      expect(sessionStorageStore['shotconnect-boot-version']).toBeUndefined();

      act(() => { testRenderer.unmount(); });
    });
  });
});
