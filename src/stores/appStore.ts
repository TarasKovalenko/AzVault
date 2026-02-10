import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Tenant,
  Subscription,
  KeyVaultInfo,
  ItemTab,
  AzureEnvironment,
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

  // Search
  searchQuery: string;
  environment: AzureEnvironment;
  requireReauthForReveal: boolean;

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
  setRequireReauthForReveal: (enabled: boolean) => void;
  addRecentVault: (name: string, uri: string) => void;
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
      searchQuery: '',
      environment: 'azurePublic',
      requireReauthForReveal: false,

      setSignedIn: (signed, userName) =>
        set({ isSignedIn: signed, userName: userName ?? null }),

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
          const recent = [
            { name, uri },
            ...state.recentVaults.filter((v) => v.uri !== uri),
          ].slice(0, 10);
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

      setRequireReauthForReveal: (requireReauthForReveal) => set({ requireReauthForReveal }),

      addRecentVault: (name, uri) =>
        set((state) => ({
          recentVaults: [
            { name, uri },
            ...state.recentVaults.filter((v) => v.uri !== uri),
          ].slice(0, 10),
        })),

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
        environment: state.environment,
        requireReauthForReveal: state.requireReauthForReveal,
      }),
    }
  )
);
