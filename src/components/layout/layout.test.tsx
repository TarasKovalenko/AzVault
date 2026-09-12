import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../stores/appStore';
import { useMockStore } from '../../stores/mockStore';
import { makeSubscription, makeTenant } from '../../test/fixtures';
import { NavigationRail } from './NavigationRail';
import { StatusBar } from './StatusBar';
import { CommandPaletteTrigger } from './top-bar/CommandPaletteTrigger';
import { TopBarActions } from './top-bar/TopBarActions';
import { UserMenu } from './top-bar/UserMenu';

const initialState = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(initialState, true);
  useMockStore.setState({ mockMode: false, mockAvailable: false });
});

describe('NavigationRail', () => {
  it('disables every resource tab until a vault is selected', () => {
    render(<NavigationRail />);
    for (const label of ['Secrets', 'Keys', 'Certificates', 'Overview', 'Activity']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: /Settings/ })).toBeEnabled();
  });

  it('marks the active tab and switches tabs on click', async () => {
    useAppStore.setState({ selectedVaultName: 'my-vault' });
    render(<NavigationRail />);
    expect(screen.getByRole('button', { name: /Secrets/ })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(screen.getByRole('button', { name: /Keys/ }));
    expect(useAppStore.getState().activeTab).toBe('keys');
    expect(screen.getByRole('button', { name: /Keys/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /Secrets/ })).not.toHaveAttribute('aria-current');
  });

  it('opens settings', async () => {
    render(<NavigationRail />);
    await userEvent.click(screen.getByRole('button', { name: /Settings/ }));
    expect(useAppStore.getState().settingsOpen).toBe(true);
  });

  it('advertises the shortcut in each tooltip', () => {
    render(<NavigationRail />);
    expect(screen.getByRole('button', { name: /Secrets/ })).toHaveAttribute(
      'title',
      'Secrets (Ctrl+1)',
    );
  });
});

describe('StatusBar', () => {
  it('reports the signed-out, unselected state', () => {
    render(<StatusBar />);
    // One line, one capitalization style.
    expect(screen.getByText('Not signed in')).toBeInTheDocument();
    expect(screen.getByText('No tenant')).toBeInTheDocument();
    expect(screen.getByText('No subscription')).toBeInTheDocument();
    expect(screen.getByText('No vault selected')).toBeInTheDocument();
  });

  it('shows the resolved tenant, subscription and vault names', () => {
    useAppStore.setState({
      userName: 'ada@contoso.com',
      tenants: [makeTenant()],
      subscriptions: [makeSubscription()],
      selectedTenantId: 'tenant-1',
      selectedSubscriptionId: 'sub-1',
      selectedVaultName: 'my-vault',
    });
    render(<StatusBar />);
    expect(screen.getByText('ada@contoso.com')).toBeInTheDocument();
    expect(screen.getByText('Contoso')).toBeInTheDocument();
    expect(screen.getByText('Production')).toBeInTheDocument();
    expect(screen.getByText('my-vault')).toBeInTheDocument();
  });

  it('falls back to a shortened tenant id when the tenant is unknown', () => {
    useAppStore.setState({ selectedTenantId: 'abcdefgh-1234' });
    render(<StatusBar />);
    expect(screen.getByText('abcdefgh')).toBeInTheDocument();
  });
});

describe('CommandPaletteTrigger', () => {
  it('opens the palette and shows the shortcut', async () => {
    render(<CommandPaletteTrigger />);
    expect(screen.getByText('Ctrl+K')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button'));
    expect(useAppStore.getState().commandPaletteOpen).toBe(true);
  });
});

describe('TopBarActions', () => {
  it('switches the theme', async () => {
    render(<TopBarActions />);
    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark appearance' }));
    expect(useAppStore.getState().themeMode).toBe('dark');
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light appearance' }));
    expect(useAppStore.getState().themeMode).toBe('light');
  });

  it('broadcasts a refresh', async () => {
    const refresh = vi.fn();
    window.addEventListener('azv:refresh', refresh);
    render(<TopBarActions />);
    await userEvent.click(screen.getByRole('button', { name: 'Refresh all data' }));
    expect(refresh).toHaveBeenCalledTimes(1);
    window.removeEventListener('azv:refresh', refresh);
  });

  it('badges mock mode only when it is on', () => {
    const { rerender } = render(<TopBarActions />);
    expect(screen.queryByText('MOCK')).not.toBeInTheDocument();
    useMockStore.setState({ mockMode: true });
    rerender(<TopBarActions />);
    expect(screen.getByText('MOCK')).toBeInTheDocument();
  });
});

describe('UserMenu', () => {
  it('derives initials from the user name', () => {
    useAppStore.setState({ userName: 'Ada Lovelace' });
    render(<UserMenu />);
    expect(screen.getByRole('button', { name: 'User menu' })).toHaveTextContent('AL');
  });

  it('falls back to a generic avatar and name', async () => {
    render(<UserMenu />);
    expect(screen.getByRole('button', { name: 'User menu' })).toHaveTextContent('U');
    await userEvent.click(screen.getByRole('button', { name: 'User menu' }));
    expect(screen.getByText('Azure User')).toBeInTheDocument();
  });

  it('shows the version as information rather than a dead command, and signs out', async () => {
    const signOut = vi.fn();
    window.addEventListener('azv:sign-out', signOut);
    render(<UserMenu />);
    await userEvent.click(screen.getByRole('button', { name: 'User menu' }));
    expect(screen.getByText(/AzVault v/)).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /AzVault v/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledTimes(1);
    window.removeEventListener('azv:sign-out', signOut);
  });

  it('offers the mock-mode toggle only when the build allows it', async () => {
    const { rerender } = render(<UserMenu />);
    await userEvent.click(screen.getByRole('button', { name: 'User menu' }));
    expect(screen.queryByRole('menuitem', { name: /mock mode/i })).not.toBeInTheDocument();

    useMockStore.setState({ mockAvailable: true });
    rerender(<UserMenu />);
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Enable mock mode' })).toBeInTheDocument(),
    );
    const setMockMode = vi.spyOn(useMockStore.getState(), 'setMockMode');
    useMockStore.setState({ setMockMode });
    await userEvent.click(screen.getByRole('menuitem', { name: 'Enable mock mode' }));
    expect(setMockMode).toHaveBeenCalledWith(true);
  });
});
