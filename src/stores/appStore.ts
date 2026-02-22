import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AzureEnvironment,
  ItemTab,
  KeyVaultInfo,
  PinnedVault,
  Subscription,
  Tenant,
  ThemeMode,
} from '../types';

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
  pinnedVaults: PinnedVault[];

  // Search
  searchQuery: string;
  environment: AzureEnvironment;
  themeMode: ThemeMode;

  // Security settings
  requireReauthForReveal: boolean;
  autoHideSeconds: number;
  clipboardClearSeconds: number;
  disableClipboardCopy: boolean;

  // Layout
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  detailPanelOpen: boolean;
  splitRatio: number;

  // Audit settings
  auditMaxEntries: number;
  auditRefreshInterval: number;

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
  setSearchQuery: (query: string) => void;
  setEnvironment: (env: AzureEnvironment) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setRequireReauthForReveal: (enabled: boolean) => void;
  setAutoHideSeconds: (s: number) => void;
  setClipboardClearSeconds: (s: number) => void;
  setDisableClipboardCopy: (v: boolean) => void;
  setSidebarWidth: (width: number) => void;
  toggleSidebar: () => void;
  toggleDetailPanel: () => void;
  setSplitRatio: (ratio: number) => void;
  pinVault: (vault: PinnedVault) => void;
  unpinVault: (uri: string) => void;
  clearRecentVaults: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setAuditMaxEntries: (n: number) => void;
  setAuditRefreshInterval: (ms: number) => void;
  signOut: () => void;
}

export const useAppStore = create<AppStoreState>()(
  persist(
    (set) => ({
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
      pinnedVaults: [],
      searchQuery: '',
      environment: 'azurePublic',
      themeMode: 'light',
      requireReauthForReveal: false,
      autoHideSeconds: 30,
      clipboardClearSeconds: 30,
      disableClipboardCopy: false,
      sidebarWidth: 240,
      sidebarCollapsed: false,
      detailPanelOpen: true,
      splitRatio: 0.6,
      auditMaxEntries: 10000,
      auditRefreshInterval: 10000,
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
          };
        }),

      setActiveTab: (tab) => set({ activeTab: tab }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setEnvironment: (environment) => set({ environment }),
      setThemeMode: (themeMode) => set({ themeMode }),
      setRequireReauthForReveal: (requireReauthForReveal) => set({ requireReauthForReveal }),
      setAutoHideSeconds: (autoHideSeconds) => set({ autoHideSeconds }),
      setClipboardClearSeconds: (clipboardClearSeconds) => set({ clipboardClearSeconds }),
      setDisableClipboardCopy: (disableClipboardCopy) => set({ disableClipboardCopy }),

      setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      toggleDetailPanel: () => set((s) => ({ detailPanelOpen: !s.detailPanelOpen })),
      setSplitRatio: (splitRatio) => set({ splitRatio }),

      pinVault: (vault) =>
        set((s) => ({
          pinnedVaults: s.pinnedVaults.some((v) => v.uri === vault.uri)
            ? s.pinnedVaults
            : [...s.pinnedVaults, vault],
        })),

      unpinVault: (uri) =>
        set((s) => ({
          pinnedVaults: s.pinnedVaults.filter((v) => v.uri !== uri),
        })),

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
        pinnedVaults: state.pinnedVaults,
        environment: state.environment,
        themeMode: state.themeMode,
        requireReauthForReveal: state.requireReauthForReveal,
        autoHideSeconds: state.autoHideSeconds,
        clipboardClearSeconds: state.clipboardClearSeconds,
        disableClipboardCopy: state.disableClipboardCopy,
        sidebarWidth: state.sidebarWidth,
        sidebarCollapsed: state.sidebarCollapsed,
        detailPanelOpen: state.detailPanelOpen,
        splitRatio: state.splitRatio,
        auditMaxEntries: state.auditMaxEntries,
        auditRefreshInterval: state.auditRefreshInterval,
      }),
    },
  ),
);
