import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from './appStore';

const initialState = useAppStore.getState();
const reset = () => useAppStore.setState(initialState, true);
const state = () => useAppStore.getState();

beforeEach(reset);

describe('appStore auth', () => {
  it('records the signed-in user', () => {
    state().setSignedIn(true, 'ada@contoso.com');
    expect(state().isSignedIn).toBe(true);
    expect(state().userName).toBe('ada@contoso.com');
  });

  it('falls back to a null user name', () => {
    state().setSignedIn(true);
    expect(state().userName).toBeNull();
  });

  it('clears session and resource data on sign out but keeps recent vaults', () => {
    state().setSignedIn(true, 'ada');
    state().setTenants([{ id: 't', tenant_id: 'tenant-1', display_name: 'Contoso' }]);
    state().setSubscriptions([
      { subscriptionId: 'sub-1', displayName: 'Prod', state: 'Enabled', tenantId: 'tenant-1' },
    ]);
    state().selectTenant('tenant-1');
    state().selectSubscription('sub-1');
    state().selectVault('vault-a', 'https://a/');

    state().signOut();

    expect(state()).toMatchObject({
      isSignedIn: false,
      userName: null,
      selectedTenantId: null,
      selectedSubscriptionId: null,
      selectedVaultUri: null,
      selectedVaultName: null,
      tenants: [],
      subscriptions: [],
      keyvaults: [],
    });
    expect(state().recentVaults).toHaveLength(1);
  });
});

describe('appStore selection cascade', () => {
  it('clears subscription, vault and vault list when the tenant changes', () => {
    state().selectSubscription('sub-1');
    state().selectVault('vault-a', 'https://a/');
    state().setKeyvaults([
      {
        id: 'v',
        name: 'vault-a',
        location: 'we',
        resourceGroup: 'rg',
        vaultUri: 'https://a/',
        tags: null,
        softDeleteEnabled: true,
      },
    ]);

    state().selectTenant('tenant-2');

    expect(state()).toMatchObject({
      selectedTenantId: 'tenant-2',
      selectedSubscriptionId: null,
      selectedVaultUri: null,
      selectedVaultName: null,
      keyvaults: [],
    });
  });

  it('clears only the vault when the subscription changes', () => {
    state().selectTenant('tenant-1');
    state().selectVault('vault-a', 'https://a/');
    state().selectSubscription('sub-2');
    expect(state()).toMatchObject({
      selectedTenantId: 'tenant-1',
      selectedSubscriptionId: 'sub-2',
      selectedVaultUri: null,
      selectedVaultName: null,
    });
  });

  it('selecting a vault switches back to the secrets tab', () => {
    state().setActiveTab('logs');
    state().selectVault('vault-a', 'https://a/');
    expect(state().activeTab).toBe('secrets');
    expect(state().selectedVaultUri).toBe('https://a/');
  });
});

describe('appStore recent vaults', () => {
  it('moves a re-selected vault to the front without duplicating it', () => {
    state().selectVault('a', 'https://a/');
    state().selectVault('b', 'https://b/');
    state().selectVault('a', 'https://a/');
    expect(state().recentVaults).toEqual([
      { name: 'a', uri: 'https://a/' },
      { name: 'b', uri: 'https://b/' },
    ]);
  });

  it('keeps at most ten entries, newest first', () => {
    for (let index = 0; index < 12; index += 1) {
      state().selectVault(`vault-${index}`, `https://${index}/`);
    }
    expect(state().recentVaults).toHaveLength(10);
    expect(state().recentVaults[0]).toEqual({ name: 'vault-11', uri: 'https://11/' });
    expect(state().recentVaults.at(-1)).toEqual({ name: 'vault-2', uri: 'https://2/' });
  });

  it('clears recent vaults on request', () => {
    state().selectVault('a', 'https://a/');
    state().clearRecentVaults();
    expect(state().recentVaults).toEqual([]);
  });
});

describe('appStore settings', () => {
  it('updates each simple setting', () => {
    state().setActiveTab('keys');
    state().setEnvironment('azureChina');
    state().setThemeMode('dark');
    state().setRequireReauthForReveal(true);
    state().setAutoHideSeconds(60);
    state().setClipboardClearSeconds(15);
    state().setDisableClipboardCopy(true);
    state().setSplitRatio(0.4);
    state().setCommandPaletteOpen(true);
    state().setSettingsOpen(true);
    state().setAuditMaxEntries(500);
    state().setAuditRefreshInterval(5000);

    expect(state()).toMatchObject({
      activeTab: 'keys',
      environment: 'azureChina',
      themeMode: 'dark',
      requireReauthForReveal: true,
      autoHideSeconds: 60,
      clipboardClearSeconds: 15,
      disableClipboardCopy: true,
      splitRatio: 0.4,
      commandPaletteOpen: true,
      settingsOpen: true,
      auditMaxEntries: 500,
      auditRefreshInterval: 5000,
    });
  });

  it('toggles the detail panel', () => {
    const before = state().detailPanelOpen;
    state().toggleDetailPanel();
    expect(state().detailPanelOpen).toBe(!before);
    state().toggleDetailPanel();
    expect(state().detailPanelOpen).toBe(before);
  });
});

describe('appStore persistence', () => {
  it('persists workspace selection and preferences but not session or resource data', async () => {
    state().setSignedIn(true, 'ada');
    state().selectTenant('tenant-1');
    state().selectSubscription('sub-1');
    state().selectVault('vault-a', 'https://a/');
    await Promise.resolve();

    const persisted = JSON.parse(window.localStorage.getItem('azvault-settings') ?? '{}');
    expect(Object.keys(persisted.state).sort()).toEqual(
      [
        'auditMaxEntries',
        'auditRefreshInterval',
        'autoHideSeconds',
        'clipboardClearSeconds',
        'detailPanelOpen',
        'disableClipboardCopy',
        'environment',
        'recentVaults',
        'requireReauthForReveal',
        'selectedSubscriptionId',
        'selectedTenantId',
        'selectedVaultName',
        'selectedVaultUri',
        'splitRatio',
        'themeMode',
      ].sort(),
    );
    expect(persisted.state.selectedVaultName).toBe('vault-a');
    expect(persisted.state).not.toHaveProperty('isSignedIn');
    expect(persisted.state).not.toHaveProperty('userName');
    expect(persisted.state).not.toHaveProperty('tenants');
  });
});
