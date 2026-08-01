import { Button, makeStyles, mergeClasses, Tooltip, tokens } from '@fluentui/react-components';
import {
  Certificate24Regular,
  ClipboardTextLtr24Regular,
  Home24Regular,
  Key24Regular,
  LockClosed24Regular,
  PanelLeftContract24Regular,
  PanelLeftExpand24Regular,
  Settings24Regular,
  ShieldLock24Regular,
} from '@fluentui/react-icons';
import { useAppStore } from '../../stores/appStore';
import type { ItemTab } from '../../types';

const useStyles = makeStyles({
  root: {
    width: '56px',
    minWidth: '56px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '10px 0 8px',
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  brand: {
    width: '34px',
    height: '34px',
    display: 'grid',
    placeItems: 'center',
    borderRadius: '10px',
    color: tokens.colorNeutralForegroundOnBrand,
    background: `linear-gradient(145deg, ${tokens.colorBrandBackground}, ${tokens.colorBrandBackgroundHover})`,
    boxShadow: '0 5px 14px rgba(0, 94, 166, .25)',
    marginBottom: '16px',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '5px',
  },
  button: {
    width: '38px',
    height: '38px',
    minWidth: '38px',
    borderRadius: '9px',
    color: tokens.colorNeutralForeground2,
  },
  selected: {
    color: tokens.colorBrandForeground1,
    backgroundColor: tokens.colorBrandBackground2,
    boxShadow: `inset 3px 0 0 ${tokens.colorBrandForeground1}`,
  },
  spacer: { flex: 1 },
});

const navItems: { value: ItemTab; label: string; icon: React.ReactElement }[] = [
  { value: 'dashboard', label: 'Overview', icon: <Home24Regular /> },
  { value: 'secrets', label: 'Secrets', icon: <LockClosed24Regular /> },
  { value: 'keys', label: 'Keys', icon: <Key24Regular /> },
  { value: 'certificates', label: 'Certificates', icon: <Certificate24Regular /> },
  { value: 'logs', label: 'Activity', icon: <ClipboardTextLtr24Regular /> },
];

export function NavigationRail() {
  const {
    activeTab,
    setActiveTab,
    selectedVaultName,
    sidebarCollapsed,
    toggleSidebar,
    setSettingsOpen,
  } = useAppStore();
  const classes = useStyles();

  return (
    <nav className={classes.root} aria-label="Primary navigation">
      <div className={classes.brand} title="AzVault">
        <ShieldLock24Regular />
      </div>
      <div className={classes.nav}>
        {navItems.map((item) => (
          <Tooltip key={item.value} content={item.label} relationship="label" positioning="after">
            <Button
              appearance="subtle"
              icon={item.icon}
              disabled={!selectedVaultName}
              aria-current={activeTab === item.value ? 'page' : undefined}
              aria-label={item.label}
              className={mergeClasses(classes.button, activeTab === item.value && classes.selected)}
              onClick={() => setActiveTab(item.value)}
            />
          </Tooltip>
        ))}
      </div>
      <div className={classes.spacer} />
      <div className={classes.nav}>
        <Tooltip
          content={sidebarCollapsed ? 'Show vaults' : 'Hide vaults'}
          relationship="label"
          positioning="after"
        >
          <Button
            appearance="subtle"
            icon={sidebarCollapsed ? <PanelLeftExpand24Regular /> : <PanelLeftContract24Regular />}
            className={classes.button}
            aria-label={sidebarCollapsed ? 'Show vaults' : 'Hide vaults'}
            onClick={toggleSidebar}
          />
        </Tooltip>
        <Tooltip content="Settings" relationship="label" positioning="after">
          <Button
            appearance="subtle"
            icon={<Settings24Regular />}
            className={classes.button}
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
          />
        </Tooltip>
      </div>
    </nav>
  );
}
