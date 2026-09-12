import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../stores/appStore';
import { isEditableTarget, useKeyboardShortcuts } from './useKeyboardShortcuts';

const initialState = useAppStore.getState();

function Harness() {
  useKeyboardShortcuts();
  return (
    <>
      <input aria-label="filter" />
      <textarea aria-label="notes" />
      <div role="dialog" aria-label="confirm">
        <input aria-label="confirm phrase" />
      </div>
    </>
  );
}

function HarnessWithoutDialog() {
  useKeyboardShortcuts();
  return <input aria-label="filter" />;
}

beforeEach(() => {
  useAppStore.setState(initialState, true);
  useAppStore.setState({ selectedVaultName: 'vault', selectedVaultUri: 'https://v/' });
});

describe('isEditableTarget', () => {
  it('recognises the elements that own their own key handling', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    // jsdom does not implement isContentEditable from the attribute alone.
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    const plain = document.createElement('div');

    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(textarea)).toBe(true);
    expect(isEditableTarget(select)).toBe(true);
    expect(isEditableTarget(editable)).toBe(true);
    expect(isEditableTarget(plain)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe('useKeyboardShortcuts gating', () => {
  it('leaves select-all to the caret while typing in a field', async () => {
    const selectAll = vi.fn();
    window.addEventListener('azv:select-all', selectAll);
    useAppStore.setState({ activeTab: 'secrets' });
    render(<HarnessWithoutDialog />);

    screen.getByLabelText('filter').focus();
    await userEvent.keyboard('{Meta>}a{/Meta}');
    await userEvent.keyboard('{Control>}a{/Control}');

    expect(selectAll).not.toHaveBeenCalled();
    window.removeEventListener('azv:select-all', selectAll);
  });

  it('does not fire list shortcuts while a dialog is open', async () => {
    const deleteSelected = vi.fn();
    window.addEventListener('azv:delete-selected', deleteSelected);
    useAppStore.setState({ activeTab: 'secrets' });
    render(<Harness />);

    await userEvent.keyboard('{Meta>}{Shift>}d{/Shift}{/Meta}');
    await userEvent.keyboard('{Control>}{Shift>}d{/Shift}{/Control}');

    expect(deleteSelected).not.toHaveBeenCalled();
    window.removeEventListener('azv:delete-selected', deleteSelected);
  });

  it('does not fire secrets-only shortcuts on another tab', async () => {
    const newSecret = vi.fn();
    window.addEventListener('azv:new-secret', newSecret);
    useAppStore.setState({ activeTab: 'keys' });
    render(<HarnessWithoutDialog />);

    await userEvent.keyboard('{Meta>}n{/Meta}');
    await userEvent.keyboard('{Control>}n{/Control}');
    expect(newSecret).not.toHaveBeenCalled();

    useAppStore.setState({ activeTab: 'secrets' });
    await userEvent.keyboard('{Meta>}n{/Meta}');
    await userEvent.keyboard('{Control>}n{/Control}');
    expect(newSecret).toHaveBeenCalledTimes(1);

    window.removeEventListener('azv:new-secret', newSecret);
  });

  it('still opens the command palette from inside a text field', async () => {
    render(<HarnessWithoutDialog />);
    screen.getByLabelText('filter').focus();

    await userEvent.keyboard('{Meta>}k{/Meta}');
    await userEvent.keyboard('{Control>}k{/Control}');

    expect(useAppStore.getState().commandPaletteOpen).toBe(true);
  });

  it('asks every list view to focus its filter, not just secrets', async () => {
    const focusSearch = vi.fn();
    window.addEventListener('azv:focus-search', focusSearch);
    useAppStore.setState({ activeTab: 'certificates' });
    render(<HarnessWithoutDialog />);

    await userEvent.keyboard('{Meta>}f{/Meta}');
    await userEvent.keyboard('{Control>}f{/Control}');

    expect(focusSearch).toHaveBeenCalledTimes(1);
    window.removeEventListener('azv:focus-search', focusSearch);
  });
});
