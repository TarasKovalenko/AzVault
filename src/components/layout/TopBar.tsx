import {
  Button,
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
  WeatherMoon24Regular,
  WeatherSunny24Regular,
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
    themeMode,
    setThemeMode,
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

  const envLabel =
    environment === 'azurePublic'
      ? 'Azure Public'
      : environment === 'azureUsGovernment'
        ? 'Azure US Government'
        : 'Azure China';

  return (
    <div
      className="azv-pane"
      style={{
        borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
        background: tokens.colorNeutralBackground2,
        margin: 0,
        borderRadius: 0,
        borderLeft: 'none',
        borderRight: 'none',
        borderTop: 'none',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        minHeight: 50,
        gap: 10,
      }}
    >
      <div style={{ minWidth: 210 }}>
        <Text weight="semibold" size={400} style={{ color: tokens.colorBrandForeground1 }}>
          AZVAULT
        </Text>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text className="azv-title">
            {selectedVaultName ? `Vault: ${selectedVaultName}` : 'No vault selected'}
          </Text>
          <span className="azv-kbd">Ctrl+K</span>
        </div>
      </div>

      <div style={{ flex: 1, maxWidth: 520, margin: '0 8px' }}>
        <Input
          placeholder="Search secrets/keys/certs by prefix or contains..."
          contentBefore={<Search24Regular style={{ fontSize: 16 }} />}
          size="small"
          value={searchQuery}
          onChange={(_, d) => setSearchQuery(d.value)}
          style={{
            width: '100%',
            borderRadius: 4,
            background: tokens.colorNeutralBackground1,
          }}
        />
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Dropdown
          size="small"
          value={envLabel}
          onOptionSelect={(_, data) => {
            const value = data.optionValue;
            if (value === 'azurePublic' || value === 'azureUsGovernment' || value === 'azureChina') {
              setEnvironment(value);
            }
          }}
          style={{ minWidth: 170, borderRadius: 4 }}
        >
          <Option value="azurePublic">Azure Public</Option>
          <Option value="azureUsGovernment">Azure US Government</Option>
          <Option value="azureChina">Azure China</Option>
        </Dropdown>

        {mockMode && (
          <Badge appearance="filled" color="danger" size="small">
            MOCK DATA
          </Badge>
        )}

        <Button
          icon={themeMode === 'dark' ? <WeatherSunny24Regular /> : <WeatherMoon24Regular />}
          appearance="subtle"
          onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
          title={themeMode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        />
        <Button icon={<ArrowSync24Regular />} appearance="subtle" onClick={handleRefresh}>
          Refresh
        </Button>

        <Menu>
          <MenuTrigger>
            <Button
              appearance="subtle"
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
