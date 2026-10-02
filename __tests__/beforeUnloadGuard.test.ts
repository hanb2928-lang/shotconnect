import { renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { useBeforeUnloadGuard, createBeforeUnloadGuard } from '@/hooks/useBeforeUnloadGuard';

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

const originalAddEventListener = window.addEventListener;
const originalRemoveEventListener = window.removeEventListener;

let addedListeners: ((event: any) => void)[];

function mockWindow() {
  addedListeners = [];
  window.addEventListener = ((type: string, listener: any) => {
    if (type === 'beforeunload') addedListeners.push(listener);
  }) as any;
  window.removeEventListener = ((type: string, listener: any) => {
    if (type === 'beforeunload') {
      addedListeners = addedListeners.filter((l) => l !== listener);
    }
  }) as any;
}

function restoreWindow() {
  window.addEventListener = originalAddEventListener;
  window.removeEventListener = originalRemoveEventListener;
}

function dispatchBeforeUnload(): boolean {
  let defaultPrevented = false;
  const event = {
    preventDefault: () => { defaultPrevented = true; },
    returnValue: '' as string,
  };
  for (const listener of addedListeners) {
    listener(event);
  }
  return defaultPrevented;
}

afterAll(() => {
  restoreWindow();
});

describe('useBeforeUnloadGuard', () => {
  beforeEach(() => {
    mockWindow();
  });

  it('registers a beforeunload listener on web', () => {
    const { unmount } = renderHook(() => useBeforeUnloadGuard(true));
    expect(addedListeners.length).toBe(1);
    unmount();
    expect(addedListeners.length).toBe(0);
  });

  it('prevents default when active', () => {
    renderHook(() => useBeforeUnloadGuard(true));
    expect(dispatchBeforeUnload()).toBe(true);
  });

  it('does not prevent default when inactive', () => {
    renderHook(() => useBeforeUnloadGuard(false));
    expect(dispatchBeforeUnload()).toBe(false);
  });

  it('responds to isActive changes via ref', () => {
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) => useBeforeUnloadGuard(active),
      { initialProps: { active: true } },
    );
    expect(dispatchBeforeUnload()).toBe(true);

    rerender({ active: false });
    expect(dispatchBeforeUnload()).toBe(false);

    rerender({ active: true });
    expect(dispatchBeforeUnload()).toBe(true);
  });

  it('sets returnValue on the event', () => {
    renderHook(() => useBeforeUnloadGuard(true));
    const event = {
      preventDefault: () => {},
      returnValue: 'untouched' as string,
    };
    for (const listener of addedListeners) {
      listener(event);
    }
    expect(event.returnValue).toBe('');
  });
});

describe('createBeforeUnloadGuard', () => {
  beforeEach(() => {
    mockWindow();
  });

  it('activate adds a listener, deactivate removes it', () => {
    const guard = createBeforeUnloadGuard();
    expect(addedListeners.length).toBe(0);

    guard.activate();
    expect(addedListeners.length).toBe(1);

    guard.deactivate();
    expect(addedListeners.length).toBe(0);
  });

  it('activate is idempotent', () => {
    const guard = createBeforeUnloadGuard();
    guard.activate();
    guard.activate();
    expect(addedListeners.length).toBe(1);
    guard.deactivate();
  });

  it('deactivate is idempotent', () => {
    const guard = createBeforeUnloadGuard();
    guard.activate();
    guard.deactivate();
    guard.deactivate();
    expect(addedListeners.length).toBe(0);
  });

  it('prevents default when active', () => {
    const guard = createBeforeUnloadGuard();
    guard.activate();
    expect(dispatchBeforeUnload()).toBe(true);
    guard.deactivate();
  });
});
