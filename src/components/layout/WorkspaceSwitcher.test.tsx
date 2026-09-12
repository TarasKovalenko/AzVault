import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as tauri from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import { makeSubscription, makeTenant, makeVault } from '../../test/fixtures';
import { renderWithProviders } from '../../test/utils';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

vi.mock('../../services/tauri', () => ({
  listTenants: vi.fn(),
  listSubscriptions: vi.fn(),
  listKeyvaults: vi.fn(),
  setTenant: vi.fn(),
}));

const initialState = useAppStore.getState();

beforeEach(() => {
  // Effects from the previous test can land after vitest resets mocks.
  vi.clearAllMocks();
  useAppStore.setState(initialState, true);
  vi.mocked(tauri.listTenants).mockResolvedValue([
    makeTenant(),
    makeTenant({ tenant_id: 'tenant-2', display_name: null }),
  ]);
  vi.mocked(tauri.listSubscriptions).mockResolvedValue([makeSubscription()]);
  vi.mocked(tauri.listKeyvaults).mockResolvedValue([makeVault()]);
  vi.mocked(tauri.setTenant).mockResolvedValue(undefined);
});

describe('WorkspaceSwitcher', () => {
  it('auto-selects the first tenant and pushes it to the backend', async () => {
    renderWithProviders(<WorkspaceSwitcher />);
    await waitFor(() => expect(useAppStore.getState().selectedTenantId).toBe('tenant-1'));
    expect(tauri.setTenant).toHaveBeenCalledWith('tenant-1');
    await waitFor(() => expect(useAppStore.getState().tenants).toHaveLength(2));
  });

  it('keeps a tenant the user already chose', async () => {
    useAppStore.setState({ selectedTenantId: 'tenant-2' });
    renderWithProviders(<WorkspaceSwitcher />);
    await waitFor(() => expect(tauri.listSubscriptions).toHaveBeenCalled());
    expect(useAppStore.getState().selectedTenantId).toBe('tenant-2');
    expect(tauri.setTenant).not.toHaveBeenCalled();
  });

  it('falls back to a shortened id for a tenant with no display name', async () => {
    renderWithProviders(<WorkspaceSwitcher />);
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'tenant-2' })).toBeInTheDocument(),
    );
  });

  it('disables the downstream pickers until their parent is chosen', async () => {
    vi.mocked(tauri.listTenants).mockResolvedValue([]);
    renderWithProviders(<WorkspaceSwitcher />);
    await waitFor(() => expect(screen.getByLabelText('Subscription')).toBeDisabled());
    expect(screen.getByLabelText('Key Vault')).toBeDisabled();
    expect(screen.getByText('No tenants found')).toBeInTheDocument();
    expect(screen.getByText('Select a tenant first')).toBeInTheDocument();
    expect(screen.getByText('Select a subscription first')).toBeInTheDocument();
  });

  it('walks tenant to subscription to vault', async () => {
    renderWithProviders(<WorkspaceSwitcher />);
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Production' })).toBeInTheDocument(),
    );

    await userEvent.selectOptions(screen.getByLabelText('Subscription'), 'sub-1');
    expect(useAppStore.getState().selectedSubscriptionId).toBe('sub-1');
    await waitFor(() => expect(tauri.listKeyvaults).toHaveBeenCalledWith('sub-1'));

    await waitFor(() =>
      expect(screen.getByRole('option', { name: /my-vault/ })).toBeInTheDocument(),
    );
    await userEvent.selectOptions(screen.getByLabelText('Key Vault'), 'my-vault');
    expect(useAppStore.getState()).toMatchObject({
      selectedVaultName: 'my-vault',
      selectedVaultUri: 'https://my-vault.vault.azure.net/',
    });
    expect(screen.getByLabelText('Key Vault')).toHaveAttribute('title', 'Vault: my-vault');
  });

  it('reports a vault list with no results', async () => {
    vi.mocked(tauri.listKeyvaults).mockResolvedValue([]);
    useAppStore.setState({ selectedTenantId: 'tenant-1', selectedSubscriptionId: 'sub-1' });
    renderWithProviders(<WorkspaceSwitcher />);
    await waitFor(() => expect(screen.getByText('No Key Vaults found')).toBeInTheDocument());
    expect(screen.getByLabelText('Key Vault')).toBeDisabled();
  });

  it('does not move the UI to a tenant the backend refused to switch to', async () => {
    renderWithProviders(<WorkspaceSwitcher />);
    await waitFor(() => expect(useAppStore.getState().selectedTenantId).toBe('tenant-1'));

    vi.mocked(tauri.setTenant).mockRejectedValue(new Error('boom'));
    await userEvent.selectOptions(screen.getByLabelText('Tenant'), 'tenant-2');

    // Showing tenant-2 while the CLI is still on tenant-1 would list the wrong
    // tenant's vaults under the new tenant's name.
    await waitFor(() => expect(screen.getByText('Could not switch tenant')).toBeInTheDocument());
    expect(useAppStore.getState().selectedTenantId).toBe('tenant-1');
  });

  it('switches the backend tenant before letting the subscription query run', async () => {
    const order: string[] = [];
    vi.mocked(tauri.setTenant).mockImplementation(async () => {
      order.push('setTenant');
    });
    vi.mocked(tauri.listSubscriptions).mockImplementation(async () => {
      order.push('listSubscriptions');
      return [makeSubscription()];
    });

    renderWithProviders(<WorkspaceSwitcher />);
    await waitFor(() => expect(order).toContain('listSubscriptions'));

    expect(order[0]).toBe('setTenant');
  });
});
