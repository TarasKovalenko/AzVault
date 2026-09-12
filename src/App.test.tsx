import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { MainContent } from './components/app/MainContent';
import * as tauri from './services/tauri';
import { useAppStore } from './stores/appStore';
import { useMockStore } from './stores/mockStore';
import { makeAuditEntry, makeSecret, makeTenant } from './test/fixtures';

vi.mock('./services/tauri', () => ({
  authStatus: vi.fn(),
  authSignOut: vi.fn(),
  setTenant: vi.fn(),
  listTenants: vi.fn(),
  listSubscriptions: vi.fn(),
  listKeyvaults: vi.fn(),
  listSecrets: vi.fn(),
  listKeys: vi.fn(),
  listCertificates: vi.fn(),
  getSecretValue: vi.fn(),
  getAuditLog: vi.fn(),
  exportAuditLog: vi.fn(),
  clearAuditLog: vi.fn(),
  setSecret: vi.fn(),
  deleteSecret: vi.fn(),
  purgeSecret: vi.fn(),
  exportItems: vi.fn(),
}));

const initialState = useAppStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState(initialState, true);
  useMockStore.setState({ mockMode: false, mockAvailable: false });
  vi.mocked(tauri.authStatus).mockResolvedValue({
    signed_in: false,
    user_name: null,
    tenant_id: null,
  });
  vi.mocked(tauri.authSignOut).mockResolvedValue(undefined);
  vi.mocked(tauri.listTenants).mockResolvedValue([makeTenant()]);
  vi.mocked(tauri.listSubscriptions).mockResolvedValue([]);
  vi.mocked(tauri.listKeyvaults).mockResolvedValue([]);
  vi.mocked(tauri.listSecrets).mockResolvedValue([makeSecret()]);
  vi.mocked(tauri.listKeys).mockResolvedValue([]);
  vi.mocked(tauri.listCertificates).mockResolvedValue([]);
  vi.mocked(tauri.getAuditLog).mockResolvedValue([makeAuditEntry()]);
  vi.mocked(tauri.setTenant).mockResolvedValue(undefined);
});

describe('App', () => {
  it('shows the sign-in screen while signed out and applies the theme', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('Azure CLI status')).toBeInTheDocument());
    expect(document.body.dataset.theme).toBe('light');
  });

  it('applies a dark theme to the document body', async () => {
    useAppStore.setState({ themeMode: 'dark' });
    render(<App />);
    await waitFor(() => expect(document.body.dataset.theme).toBe('dark'));
  });

  it('renders the workspace once signed in', async () => {
    useAppStore.setState({ isSignedIn: true, userName: 'ada' });
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText('Primary navigation')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Select a Key Vault' })).toBeInTheDocument();
    expect(screen.getByText('ada')).toBeInTheDocument();
  });

  it('signs out through the user menu, clearing the session', async () => {
    useAppStore.setState({
      isSignedIn: true,
      userName: 'ada',
      selectedTenantId: 'tenant-1',
      selectedVaultName: 'my-vault',
      selectedVaultUri: 'https://v/',
    });
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'User menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(useAppStore.getState().isSignedIn).toBe(false));
    expect(tauri.authSignOut).toHaveBeenCalled();
  });

  it('still clears the local session when Azure sign-out fails', async () => {
    vi.mocked(tauri.authSignOut).mockRejectedValue(new Error('offline'));
    useAppStore.setState({ isSignedIn: true, userName: 'ada' });
    render(<App />);
    act(() => {
      window.dispatchEvent(new CustomEvent('azv:sign-out'));
    });
    await waitFor(() => expect(useAppStore.getState().isSignedIn).toBe(false));
  });

  it('refetches data when a refresh is requested', async () => {
    useAppStore.setState({
      isSignedIn: true,
      selectedTenantId: 'tenant-1',
      selectedVaultName: 'my-vault',
      selectedVaultUri: 'https://v/',
    });
    render(<App />);
    await waitFor(() => expect(tauri.listSecrets).toHaveBeenCalledTimes(1));
    act(() => {
      window.dispatchEvent(new CustomEvent('azv:refresh'));
    });
    await waitFor(() => expect(tauri.listSecrets).toHaveBeenCalledTimes(2));
  });

  it('opens the command palette and the settings dialog with the keyboard', async () => {
    useAppStore.setState({ isSignedIn: true });
    render(<App />);
    await userEvent.keyboard('{Control>}k{/Control}');
    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    await userEvent.keyboard('{Control>},{/Control}');
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });
});

describe('MainContent', () => {
  beforeEach(() => {
    // A tenant is pre-selected so the workspace switcher does not reset the
    // vault by auto-picking the first tenant.
    useAppStore.setState({
      selectedTenantId: 'tenant-1',
      selectedSubscriptionId: 'sub-1',
      selectedVaultName: 'my-vault',
      selectedVaultUri: 'https://v/',
    });
  });

  it('asks for a vault first', () => {
    useAppStore.setState({ selectedVaultName: null });
    render(<MainContent />);
    expect(screen.getByRole('heading', { name: 'Select a Key Vault' })).toBeInTheDocument();
  });

  it.each([
    ['secrets', 'Secrets'],
    ['keys', 'Keys'],
    ['certificates', 'Certificates'],
    ['logs', 'Activity'],
  ] as const)('renders the %s tab', async (tab, heading) => {
    useAppStore.setState({ activeTab: tab });
    render(<App />);
    useAppStore.setState({ isSignedIn: true });
    await waitFor(() =>
      expect(screen.getAllByRole('heading', { name: heading }).length).toBeGreaterThan(0),
    );
  });

  it('renders the dashboard tab', async () => {
    useAppStore.setState({ activeTab: 'dashboard', isSignedIn: true });
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'my-vault' })).toBeInTheDocument(),
    );
  });
});
