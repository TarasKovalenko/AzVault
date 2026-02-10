import {
  Toolbar,
  ToolbarButton,
  ToolbarDivider,
  Input,
  Avatar,
  Dropdown,
  Option,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  Text,
  Badge,
  tokens,
} from '@fluentui/react-components';
import {
  Search24Regular,
  ArrowSync24Regular,
  PersonCircle24Regular,
  SignOut24Regular,
  Settings24Regular,
  Info24Regular,
  ShieldKeyhole24Regular,
} from '@fluentui/react-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../stores/appStore';
import { useMockStore } from '../../stores/mockStore';
import { authSignOut } from '../../services/tauri';

export function TopBar() {
  const {
    userName,
    selectedVaultName,
    searchQuery,
    setSearchQuery,
    environment,
    setEnvironment,
    requireReauthForReveal,
    setRequireReauthForReveal,
    signOut: storeSignOut,
  } = useAppStore();
  const queryClient = useQueryClient();
  const mockMode = useMockStore((s) => s.mockMode);
  const mockAvailable = useMockStore((s) => s.mockAvailable);
  const setMockMode = useMockStore((s) => s.setMockMode);

  const handleSignOut = async () => {
    try {
      await authSignOut();
    } catch {
      // Ignore errors during sign out
    }
    storeSignOut();
    queryClient.clear();
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries();
  };

  return (
    <div
      style={{
        borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
        background: tokens.colorNeutralBackground1,
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        height: 48,
        gap: 12,
      }}
    >
      <Text weight="semibold" size={400} style={{ color: tokens.colorBrandForeground1 }}>
        AzVault
      </Text>

      {selectedVaultName && (
        <>
          <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
            /
          </Text>
          <Text size={300} weight="semibold">
            {selectedVaultName}
          </Text>
        </>
      )}

      <div style={{ flex: 1, maxWidth: 400, margin: '0 16px' }}>
        <Input
          placeholder="Search items..."
          contentBefore={<Search24Regular style={{ fontSize: 16 }} />}
          size="small"
          value={searchQuery}
          onChange={(_, d) => setSearchQuery(d.value)}
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
        <Dropdown
          size="small"
          value={
            environment === 'azurePublic'
              ? 'Azure Public'
              : environment === 'azureUsGovernment'
                ? 'Azure US Government'
                : 'Azure China'
          }
          onOptionSelect={(_, data) => {
            const value = data.optionValue;
            if (value === 'azurePublic' || value === 'azureUsGovernment' || value === 'azureChina') {
              setEnvironment(value);
            }
          }}
          style={{ minWidth: 170 }}
        >
          <Option value="azurePublic">Azure Public</Option>
          <Option value="azureUsGovernment">Azure US Government</Option>
          <Option value="azureChina">Azure China</Option>
        </Dropdown>

        {mockMode && (
          <Badge appearance="filled" color="success" size="small">
            MOCK
          </Badge>
        )}

        <Toolbar size="small">
          <ToolbarButton
            icon={<ArrowSync24Regular />}
            onClick={handleRefresh}
            title="Refresh all"
          />
          <ToolbarDivider />
        </Toolbar>

        <Menu>
          <MenuTrigger>
            <ToolbarButton
              icon={
                <Avatar
                  name={userName || 'User'}
                  size={24}
                  color="brand"
                />
              }
            />
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem icon={<PersonCircle24Regular />} disabled>
                {userName || 'Azure User'}
              </MenuItem>
              {mockAvailable && (
                <MenuItem
                  icon={<Settings24Regular />}
                  onClick={() => setMockMode(!mockMode)}
                >
                  {mockMode ? 'Disable Mock Mode' : 'Enable Mock Mode'}
                </MenuItem>
              )}
              <MenuItem icon={<Info24Regular />} disabled>
                AzVault v0.1.0
              </MenuItem>
              <MenuItem
                icon={<ShieldKeyhole24Regular />}
                onClick={() => setRequireReauthForReveal(!requireReauthForReveal)}
              >
                {requireReauthForReveal ? 'Disable re-auth on reveal' : 'Enable re-auth on reveal'}
              </MenuItem>
              <MenuItem icon={<SignOut24Regular />} onClick={handleSignOut}>
                Sign Out
              </MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      </div>
    </div>
  );
}
