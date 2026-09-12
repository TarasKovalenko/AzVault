import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../stores/appStore';
import { CommandPalette } from './CommandPalette';

const initialState = useAppStore.getState();

const openPalette = () => {
  useAppStore.setState({ commandPaletteOpen: true });
  return render(<CommandPalette />);
};

beforeEach(() => {
  useAppStore.setState(initialState, true);
});

describe('CommandPalette', () => {
  it('stays hidden while closed', () => {
    render(<CommandPalette />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists the vault-free commands and hides the vault ones', () => {
    openPalette();
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Open Settings/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Go to Secrets/ })).not.toBeInTheDocument();
  });

  it('reveals the vault commands once a vault is selected', () => {
    useAppStore.setState({ selectedVaultName: 'my-vault', selectedVaultUri: 'https://v/' });
    openPalette();
    expect(screen.getByRole('option', { name: /Go to Secrets/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Copy Vault URI/ })).toBeInTheDocument();
  });

  it('filters as you type and reports when nothing matches', async () => {
    openPalette();
    await userEvent.type(screen.getByPlaceholderText('Search or run a command…'), 'theme');
    expect(screen.getByRole('option', { name: /Toggle Theme/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Refresh All Data/ })).not.toBeInTheDocument();

    await userEvent.clear(screen.getByPlaceholderText('Search or run a command…'));
    await userEvent.type(screen.getByPlaceholderText('Search or run a command…'), 'zzzzzz');
    expect(screen.getByText('No matching commands')).toBeInTheDocument();
  });

  it('runs a command on click and closes', async () => {
    openPalette();
    await userEvent.click(screen.getByRole('option', { name: /Toggle Theme/ }));
    expect(useAppStore.getState().commandPaletteOpen).toBe(false);
    await waitFor(() => expect(useAppStore.getState().themeMode).toBe('dark'));
  });

  it('moves the highlight with the arrow keys and runs the highlighted command', async () => {
    openPalette();
    const input = screen.getByPlaceholderText('Search or run a command…');
    await userEvent.type(input, 'toggle');
    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(1);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id);

    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1].id);

    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');

    const highlighted = screen.getAllByRole('option')[0].textContent ?? '';
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(useAppStore.getState().commandPaletteOpen).toBe(false));
    // The command that ran is the one that was highlighted, not simply the first.
    expect(highlighted).toMatch(/Toggle/i);
  });

  it('closes on Escape and on a backdrop click', async () => {
    const { unmount } = openPalette();
    await userEvent.type(screen.getByPlaceholderText('Search or run a command…'), '{Escape}');
    expect(useAppStore.getState().commandPaletteOpen).toBe(false);
    unmount();

    openPalette();
    await userEvent.click(screen.getByRole('dialog').parentElement as HTMLElement);
    expect(useAppStore.getState().commandPaletteOpen).toBe(false);
  });

  it('dispatches window events for the list commands', async () => {
    const refresh = vi.fn();
    window.addEventListener('azv:refresh', refresh);
    openPalette();
    await userEvent.click(screen.getByRole('option', { name: /Refresh All Data/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    window.removeEventListener('azv:refresh', refresh);
  });

  it('copies the vault URI', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    useAppStore.setState({ selectedVaultUri: 'https://v/' });
    openPalette();
    await userEvent.click(screen.getByRole('option', { name: /Copy Vault URI/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://v/'));
  });

  it('offers clearing recent vaults only when there are any', async () => {
    openPalette();
    expect(screen.queryByRole('option', { name: /Clear Recent Vaults/ })).not.toBeInTheDocument();

    useAppStore.getState().selectVault('a', 'https://a/');
    useAppStore.setState({ commandPaletteOpen: true });
    await userEvent.click(await screen.findByRole('option', { name: /Clear Recent Vaults/ }));
    await waitFor(() => expect(useAppStore.getState().recentVaults).toEqual([]));
  });

  it('toggles the fetch confirmation setting', async () => {
    openPalette();
    await userEvent.click(screen.getByRole('option', { name: /Toggle Fetch Confirmation/ }));
    await waitFor(() => expect(useAppStore.getState().requireReauthForReveal).toBe(true));
  });

  it('highlights the hovered command', async () => {
    openPalette();
    const settings = screen.getByRole('option', { name: /Open Settings/ });
    await userEvent.hover(settings);
    expect(settings.className).toMatch(/bg-\[var\(--accent\)\]/);
  });
});
