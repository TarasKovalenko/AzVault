import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as tauri from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import {
  makeAuditEntry,
  makeCertificate,
  makeKey,
  makeSecret,
  makeVault,
} from '../../test/fixtures';
import { renderWithProviders } from '../../test/utils';
import { VaultDashboard } from './VaultDashboard';

vi.mock('../../services/tauri', () => ({
  listSecrets: vi.fn(),
  listKeys: vi.fn(),
  listCertificates: vi.fn(),
  getAuditLog: vi.fn(),
}));

const initialState = useAppStore.getState();
const soon = new Date(Date.now() + 5 * 86_400_000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState(initialState, true);
  useAppStore.setState({
    selectedVaultUri: 'https://my-vault.vault.azure.net/',
    selectedVaultName: 'my-vault',
    keyvaults: [makeVault()],
  });
  vi.mocked(tauri.listSecrets).mockResolvedValue([
    makeSecret({ id: 's1', name: 'alpha' }),
    makeSecret({ id: 's2', name: 'expiring', expires: soon }),
  ]);
  vi.mocked(tauri.listKeys).mockResolvedValue([makeKey({ enabled: false })]);
  vi.mocked(tauri.listCertificates).mockResolvedValue([makeCertificate()]);
  vi.mocked(tauri.getAuditLog).mockResolvedValue([
    makeAuditEntry({ itemName: 'alpha', action: 'get_value' }),
    makeAuditEntry({ itemName: 'beta', action: 'set', result: 'error' }),
  ]);
});

describe('VaultDashboard', () => {
  it('renders nothing without a selected vault', () => {
    useAppStore.setState({ selectedVaultName: null });
    renderWithProviders(<VaultDashboard />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('counts each resource type and navigates on click', async () => {
    renderWithProviders(<VaultDashboard />);
    const secretsCard = screen.getByRole('button', { name: /Secrets/ });
    await waitFor(() => expect(secretsCard).toHaveTextContent('2'));
    await userEvent.click(secretsCard);
    expect(useAppStore.getState().activeTab).toBe('secrets');

    const keysCard = screen.getByRole('button', { name: /Keys/ });
    expect(keysCard).toHaveTextContent('1');
    await userEvent.click(keysCard);
    expect(useAppStore.getState().activeTab).toBe('keys');

    await userEvent.click(screen.getByRole('button', { name: /Certificates/ }));
    expect(useAppStore.getState().activeTab).toBe('certificates');
  });

  it('lists the items that need attention and opens their tab', async () => {
    renderWithProviders(<VaultDashboard />);
    await waitFor(() => expect(screen.getByText('expiring')).toBeInTheDocument());
    expect(screen.getByText('2 items need review')).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    await userEvent.click(screen.getByText('signing-key'));
    expect(useAppStore.getState().activeTab).toBe('keys');
  });

  it('celebrates a healthy vault', async () => {
    vi.mocked(tauri.listSecrets).mockResolvedValue([makeSecret()]);
    vi.mocked(tauri.listKeys).mockResolvedValue([]);
    vi.mocked(tauri.listCertificates).mockResolvedValue([]);
    renderWithProviders(<VaultDashboard />);
    await waitFor(() =>
      expect(screen.getByText('No disabled or soon-to-expire items')).toBeInTheDocument(),
    );
    expect(screen.getByText(/Everything looks healthy/)).toBeInTheDocument();
  });

  it('shows the vault properties and copies the URI', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    renderWithProviders(<VaultDashboard />);
    expect(screen.getByText('westeurope')).toBeInTheDocument();
    expect(screen.getByText('rg-1')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Copy vault URI' }));
    expect(writeText).toHaveBeenCalledWith('https://my-vault.vault.azure.net/');
    await waitFor(() => expect(screen.getByText('Vault URI copied')).toBeInTheDocument());
  });

  it('warns when soft delete is off and copes with an unknown vault', async () => {
    useAppStore.setState({ keyvaults: [makeVault({ softDeleteEnabled: false })] });
    const { unmount } = renderWithProviders(<VaultDashboard />);
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    expect(screen.getByText(/Soft delete is off/)).toBeInTheDocument();
    unmount();

    // An unreadable setting is its own state, not the same as "off".
    useAppStore.setState({ keyvaults: [makeVault({ softDeleteEnabled: null })] });
    renderWithProviders(<VaultDashboard />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByText(/could not be read/)).toBeInTheDocument();
  });

  it('falls back to placeholders when the vault is not in the list', () => {
    useAppStore.setState({ keyvaults: [] });
    renderWithProviders(<VaultDashboard />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('shows recent activity and reports an empty log', async () => {
    renderWithProviders(<VaultDashboard />);
    await waitFor(() => expect(screen.getByText('Read value')).toBeInTheDocument());
    expect(screen.getByText('beta')).toBeInTheDocument();

    vi.mocked(tauri.getAuditLog).mockResolvedValue([]);
    const second = renderWithProviders(<VaultDashboard />);
    await waitFor(() =>
      expect(second.getByText('No activity recorded for this vault.')).toBeInTheDocument(),
    );
  });

  it('jumps to secrets and leaves a create request for that view to pick up', async () => {
    useAppStore.setState({ activeTab: 'dashboard' });
    renderWithProviders(<VaultDashboard />);
    await userEvent.click(screen.getByRole('button', { name: 'New secret' }));

    // The request is handed over through the store rather than a window event,
    // which would fire before SecretsList mounts and be lost.
    expect(useAppStore.getState().activeTab).toBe('secrets');
    expect(useAppStore.getState().pendingSecretsAction).toBe('new-secret');
    expect(useAppStore.getState().consumeSecretsAction()).toBe('new-secret');
    expect(useAppStore.getState().pendingSecretsAction).toBeNull();
  });
});
