import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AzureEnvironment,
  ItemTab,
  KeyVaultInfo,
  Subscription,
  Tenant,
  ThemeMode,
} from '../types';

/** Per-tab list view state, kept in the store so switching tabs doesn't discard it. */
export interface ListViewState {
  filter: string;
  sortKey: string | null;
  sortDirection: 'asc' | 'desc';
  visibleCount: number;
  selectedId: string | null;
}

export const DEFAULT_LIST_VIEW: ListViewState = {
  filter: '',
  sortKey: null,
  sortDirection: 'asc',
  visibleCount: 50,
  selectedId: null,
};

type ListTab = Extract<ItemTab, 'secrets' | 'keys' | 'certificates'>;

const freshListViews = (): Record<ListTab, ListViewState> => ({
  secrets: { ...DEFAULT_LIST_VIEW },
  keys: { ...DEFAULT_LIST_VIEW },
  certificates: { ...DEFAULT_LIST_VIEW },
});

interface AppStoreState {
  // Auth
  isSignedIn: boolean;
  userName: string | null;

  // Navigation
  selectedTenantId: string | null;
  selectedSubscriptionId: string | null;
  selectedVaultUri: string | null;
  selectedVaultName: string | null;
  activeTab: ItemTab;

  // Data (non-persisted, but kept in memory)
  tenants: Tenant[];
  subscriptions: Subscription[];
  keyvaults: KeyVaultInfo[];
  recentVaults: { name: string; uri: string }[];

  environment: AzureEnvironment;
  themeMode: ThemeMode;

  // Security settings
  requireReauthForReveal: boolean;
  autoHideSeconds: number;
  clipboardClearSeconds: number;
  disableClipboardCopy: boolean;

  // Layout
  detailPanelOpen: boolean;
  splitRatio: number;

  // Audit settings
  auditMaxEntries: number;
  auditRefreshInterval: number;

  // List views (filter/sort/paging/selection per tab)
  listViews: Record<ListTab, ListViewState>;

  /**
   * Action requested from another view, consumed by the target view on mount.
   * Dispatching a window event instead would race that view's mount.
   */
  pendingSecretsAction: 'new-secret' | null; // pragma: allowlist secret

  // Command palette
  commandPaletteOpen: boolean;

  // Settings dialog
  settingsOpen: boolean;

  // Actions
  setSignedIn: (signed: boolean, userName?: string | null) => void;
  setTenants: (tenants: Tenant[]) => void;
  setSubscriptions: (subs: Subscription[]) => void;
  setKeyvaults: (vaults: KeyVaultInfo[]) => void;
  selectTenant: (tenantId: string) => void;
  selectSubscription: (subId: string) => void;
  selectVault: (name: string, uri: string) => void;
  setActiveTab: (tab: ItemTab) => void;
  setEnvironment: (env: AzureEnvironment) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setRequireReauthForReveal: (enabled: boolean) => void;
  setAutoHideSeconds: (s: number) => void;
  setClipboardClearSeconds: (s: number) => void;
  setDisableClipboardCopy: (v: boolean) => void;
  toggleDetailPanel: () => void;
  setSplitRatio: (ratio: number) => void;
  clearRecentVaults: () => void;
  setListView: (tab: ListTab, patch: Partial<ListViewState>) => void;
  requestSecretsAction: (action: 'new-secret') => void;
  consumeSecretsAction: () => 'new-secret' | null;
  setCommandPaletteOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setAuditMaxEntries: (n: number) => void;
  setAuditRefreshInterval: (ms: number) => void;
  signOut: () => void;
}

export const useAppStore = create<AppStoreState>()(
  persist(
    (set, get) => ({
      isSignedIn: false,
      userName: null,
      selectedTenantId: null,
      selectedSubscriptionId: null,
      selectedVaultUri: null,
      selectedVaultName: null,
      activeTab: 'secrets',
      tenants: [],
      subscriptions: [],
      keyvaults: [],
      recentVaults: [],
      environment: 'azurePublic',
      themeMode: 'light',
      requireReauthForReveal: false,
      autoHideSeconds: 30,
      clipboardClearSeconds: 30,
      disableClipboardCopy: false,
      detailPanelOpen: true,
      splitRatio: 0.6,
      auditMaxEntries: 1000,
      auditRefreshInterval: 10000,
      listViews: freshListViews(),
      pendingSecretsAction: null,
      commandPaletteOpen: false,
      settingsOpen: false,

      setSignedIn: (signed, userName) => set({ isSignedIn: signed, userName: userName ?? null }),
      setTenants: (tenants) => set({ tenants }),
      setSubscriptions: (subscriptions) => set({ subscriptions }),
      setKeyvaults: (keyvaults) => set({ keyvaults }),

      selectTenant: (tenantId) =>
        set({
          selectedTenantId: tenantId,
          selectedSubscriptionId: null,
          selectedVaultUri: null,
          selectedVaultName: null,
          keyvaults: [],
        }),

      selectSubscription: (subId) =>
        set({
          selectedSubscriptionId: subId,
          selectedVaultUri: null,
          selectedVaultName: null,
        }),

      selectVault: (name, uri) =>
        set((state) => {
          const recent = [{ name, uri }, ...state.recentVaults.filter((v) => v.uri !== uri)].slice(
            0,
            10,
          );
          return {
            selectedVaultUri: uri,
            selectedVaultName: name,
            recentVaults: recent,
            activeTab: 'secrets',
            listViews: freshListViews(),
          };
        }),

      setActiveTab: (tab) => set({ activeTab: tab }),

      setListView: (tab, patch) =>
        set((state) => ({
          listViews: { ...state.listViews, [tab]: { ...state.listViews[tab], ...patch } },
        })),

      requestSecretsAction: (action) => set({ activeTab: 'secrets', pendingSecretsAction: action }),
      consumeSecretsAction: () => {
        const pending = get().pendingSecretsAction;
        if (pending) set({ pendingSecretsAction: null });
        return pending;
      },
      setEnvironment: (environment) => set({ environment }),
      setThemeMode: (themeMode) => set({ themeMode }),
      setRequireReauthForReveal: (requireReauthForReveal) => set({ requireReauthForReveal }),
      setAutoHideSeconds: (autoHideSeconds) => set({ autoHideSeconds }),
      setClipboardClearSeconds: (clipboardClearSeconds) => set({ clipboardClearSeconds }),
      setDisableClipboardCopy: (disableClipboardCopy) => set({ disableClipboardCopy }),

      toggleDetailPanel: () => set((s) => ({ detailPanelOpen: !s.detailPanelOpen })),
      setSplitRatio: (splitRatio) => set({ splitRatio }),

      clearRecentVaults: () => set({ recentVaults: [] }),
      setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setAuditMaxEntries: (auditMaxEntries) => set({ auditMaxEntries }),
      setAuditRefreshInterval: (auditRefreshInterval) => set({ auditRefreshInterval }),

      signOut: () =>
        set({
          isSignedIn: false,
          userName: null,
          selectedTenantId: null,
          selectedSubscriptionId: null,
          selectedVaultUri: null,
          selectedVaultName: null,
          tenants: [],
          subscriptions: [],
          keyvaults: [],
          listViews: freshListViews(),
        }),
    }),
    {
      name: 'azvault-settings',
      partialize: (state) => ({
        selectedTenantId: state.selectedTenantId,
        selectedSubscriptionId: state.selectedSubscriptionId,
        selectedVaultUri: state.selectedVaultUri,
        selectedVaultName: state.selectedVaultName,
        recentVaults: state.recentVaults,
        environment: state.environment,
        themeMode: state.themeMode,
        requireReauthForReveal: state.requireReauthForReveal,
        autoHideSeconds: state.autoHideSeconds,
        clipboardClearSeconds: state.clipboardClearSeconds,
        disableClipboardCopy: state.disableClipboardCopy,
        detailPanelOpen: state.detailPanelOpen,
        splitRatio: state.splitRatio,
        auditMaxEntries: state.auditMaxEntries,
        auditRefreshInterval: state.auditRefreshInterval,
      }),
    },
  ),
);
