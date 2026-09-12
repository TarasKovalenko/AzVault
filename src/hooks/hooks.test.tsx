import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../stores/appStore';
import { useAutoHide } from './useAutoHide';
import { formatShortcut, useKeyboardShortcuts } from './useKeyboardShortcuts';

const initialState = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(initialState, true);
});

describe('formatShortcut', () => {
  it('uses the non-mac modifiers in this environment', () => {
    expect(formatShortcut('k')).toBe('K');
    expect(formatShortcut('k', true)).toBe('Ctrl+K');
    expect(formatShortcut('d', true, true)).toBe('Ctrl+Shift+D');
  });
});

describe('useKeyboardShortcuts', () => {
  const press = (key: string, options: KeyboardEventInit = {}) =>
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, ...options }),
      );
    });

  it('ignores keys pressed without the modifier', () => {
    renderHook(() => useKeyboardShortcuts());
    press('k', { ctrlKey: false });
    expect(useAppStore.getState().commandPaletteOpen).toBe(false);
  });

  it('opens the command palette, settings and toggles the detail panel', () => {
    renderHook(() => useKeyboardShortcuts());
    press('k');
    expect(useAppStore.getState().commandPaletteOpen).toBe(true);
    press(',');
    expect(useAppStore.getState().settingsOpen).toBe(true);
    const before = useAppStore.getState().detailPanelOpen;
    press('\\');
    expect(useAppStore.getState().detailPanelOpen).toBe(!before);
  });

  it('is case-insensitive', () => {
    renderHook(() => useKeyboardShortcuts());
    press('K');
    expect(useAppStore.getState().commandPaletteOpen).toBe(true);
  });

  it('gates vault shortcuts until a vault is selected', () => {
    renderHook(() => useKeyboardShortcuts());
    press('2');
    expect(useAppStore.getState().activeTab).toBe('secrets');

    act(() => useAppStore.getState().selectVault('vault-a', 'https://a/'));
    press('2');
    expect(useAppStore.getState().activeTab).toBe('keys');
    press('3');
    expect(useAppStore.getState().activeTab).toBe('certificates');
    press('4');
    expect(useAppStore.getState().activeTab).toBe('dashboard');
    press('5');
    expect(useAppStore.getState().activeTab).toBe('logs');
    press('1');
    expect(useAppStore.getState().activeTab).toBe('secrets');
  });

  it('emits window events for list actions', () => {
    renderHook(() => useKeyboardShortcuts());
    const events: string[] = [];
    const names = [
      'azv:new-secret',
      'azv:refresh',
      'azv:focus-search',
      'azv:select-all',
      'azv:delete-selected',
    ];
    const listeners = names.map((name) => {
      const listener = () => events.push(name);
      window.addEventListener(name, listener);
      return [name, listener] as const;
    });

    act(() => useAppStore.getState().selectVault('vault-a', 'https://a/'));
    press('n');
    press('r');
    press('f');
    press('a');
    press('d', { shiftKey: true });
    expect(events).toEqual(names);

    // Shift is part of the match: plain Ctrl+D does nothing.
    press('d');
    expect(events).toEqual(names);

    for (const [name, listener] of listeners) window.removeEventListener(name, listener);
  });

  it('keeps vault-free shortcuts working without a vault', () => {
    renderHook(() => useKeyboardShortcuts());
    const refresh = vi.fn();
    window.addEventListener('azv:refresh', refresh);
    press('r');
    expect(refresh).toHaveBeenCalledTimes(1);
    window.removeEventListener('azv:refresh', refresh);
  });

  it('stops listening once unmounted', () => {
    const { unmount } = renderHook(() => useKeyboardShortcuts());
    unmount();
    press('k');
    expect(useAppStore.getState().commandPaletteOpen).toBe(false);
  });
});

describe('useAutoHide', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts hidden', () => {
    const { result } = renderHook(() => useAutoHide({ timeoutSeconds: 3 }));
    expect(result.current.isRevealed).toBe(false);
    expect(result.current.secondsLeft).toBe(0);
  });

  it('counts down while revealed and hides at the end', () => {
    const onHide = vi.fn();
    const { result } = renderHook(() => useAutoHide({ timeoutSeconds: 3, onHide }));
    act(() => result.current.reveal());
    expect(result.current.isRevealed).toBe(true);
    expect(result.current.secondsLeft).toBe(3);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.secondsLeft).toBe(2);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.secondsLeft).toBe(1);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.isRevealed).toBe(false);
    expect(result.current.secondsLeft).toBe(0);
    expect(onHide).toHaveBeenCalledTimes(1);

    // Timers are cleared, so nothing fires again.
    act(() => vi.advanceTimersByTime(5000));
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('hides early on request without calling onHide', () => {
    const onHide = vi.fn();
    const { result } = renderHook(() => useAutoHide({ timeoutSeconds: 30, onHide }));
    act(() => result.current.reveal());
    act(() => result.current.hide());
    expect(result.current.isRevealed).toBe(false);
    act(() => vi.advanceTimersByTime(60_000));
    expect(onHide).not.toHaveBeenCalled();
  });

  it('restarts the countdown when revealed again', () => {
    const { result } = renderHook(() => useAutoHide({ timeoutSeconds: 5 }));
    act(() => result.current.reveal());
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.secondsLeft).toBe(2);
    act(() => result.current.reveal());
    expect(result.current.secondsLeft).toBe(5);
  });

  it('clears its timers on unmount', () => {
    const onHide = vi.fn();
    const { result, unmount } = renderHook(() => useAutoHide({ timeoutSeconds: 2, onHide }));
    act(() => result.current.reveal());
    unmount();
    act(() => vi.advanceTimersByTime(5000));
    expect(onHide).not.toHaveBeenCalled();
  });
});
