import {
  Badge,
  Button,
  Input,
  makeStyles,
  mergeClasses,
  Text,
  Tooltip,
  tokens,
} from '@fluentui/react-components';
import {
  Search24Regular,
  ShieldLock24Regular,
  Star24Filled,
  Star24Regular,
} from '@fluentui/react-icons';
import { useMemo, useState } from 'react';
import { useAppStore } from '../../stores/appStore';

const useStyles = makeStyles({
  root: {
    width: '240px',
    minWidth: '240px',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: 'hidden',
  },
  collapsed: {
    width: '48px',
    minWidth: '48px',
    alignItems: 'center',
    padding: '8px 0',
    gap: '4px',
  },
  collapsedBtn: {
    width: '36px',
    height: '36px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 10px 4px',
  },
  headerTitle: {
    flex: 1,
  },
  filterWrap: {
    padding: '0 10px 6px',
  },
  filterInput: {
    width: '100%',
  },
  scroll: {
    flex: 1,
    overflowY: 'auto',
    minHeight: 0,
    padding: '0 10px 10px',
  },
  section: {
    marginTop: '6px',
  },
  sectionLabel: {
    padding: '2px 4px',
    marginBottom: '2px',
  },
  vaultRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    marginBottom: '2px',
  },
  vaultSelect: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 8px',
    borderRadius: '4px',
    cursor: 'pointer',
    width: '100%',
    backgroundColor: 'transparent',
    color: 'inherit',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    textAlign: 'left',
  },
  vaultSelectSelected: {
    backgroundColor: tokens.colorBrandBackground2,
  },
  vaultIcon: {
    fontSize: '14px',
    opacity: 0.6,
    flexShrink: 0,
  },
  starIcon: {
    fontSize: '14px',
    color: tokens.colorPaletteYellowForeground1,
    flexShrink: 0,
  },
  vaultName: {
    flex: 1,
    minWidth: 0,
  },
  pinBtn: {
    width: '24px',
    height: '24px',
    minWidth: '24px',
    flexShrink: 0,
  },
  emptyState: {
    padding: '24px 16px',
    textAlign: 'center' as const,
  },
  emptyIcon: {
    fontSize: '30px',
    opacity: 0.4,
  },
  emptyText: {
    color: tokens.colorNeutralForeground2,
    marginTop: '8px',
    lineHeight: 1.5,
  },
});

export function Sidebar() {
  const {
    selectedVaultUri,
    keyvaults,
    pinnedVaults,
    selectedSubscriptionId,
    selectedTenantId,
    selectVault,
    pinVault,
    unpinVault,
    sidebarCollapsed,
  } = useAppStore();
  const classes = useStyles();
  const [filter, setFilter] = useState('');

  const isPinned = (uri: string) => pinnedVaults.some((v) => v.uri === uri);

  const togglePin = (name: string, uri: string) => {
    if (isPinned(uri)) {
      unpinVault(uri);
    } else if (selectedTenantId && selectedSubscriptionId) {
      pinVault({ name, uri, tenantId: selectedTenantId, subscriptionId: selectedSubscriptionId });
    }
  };

  const q = filter.trim().toLowerCase();
  const subVaults = useMemo(
    () => keyvaults.filter((v) => !q || v.name.toLowerCase().includes(q)),
    [keyvaults, q],
  );
  const pinnedFiltered = useMemo(
    () => pinnedVaults.filter((v) => !q || v.name.toLowerCase().includes(q)),
    [pinnedVaults, q],
  );

  if (sidebarCollapsed) {
    return (
      <nav className={mergeClasses(classes.root, classes.collapsed)} aria-label="Pinned vaults">
        {pinnedVaults.map((v) => (
          <Tooltip key={v.uri} content={v.name} relationship="label" positioning="after">
            <Button
              appearance={v.uri === selectedVaultUri ? 'primary' : 'subtle'}
              size="small"
              icon={<Star24Filled />}
              onClick={() => selectVault(v.name, v.uri)}
              className={classes.collapsedBtn}
              aria-label={`Open vault ${v.name}`}
            />
          </Tooltip>
        ))}
      </nav>
    );
  }

  const renderVaultRow = (name: string, uri: string, key: string) => {
    const pinned = isPinned(uri);
    const selected = uri === selectedVaultUri;
    return (
      <div key={key} className={`azv-vault-row ${classes.vaultRow}`}>
        <button
          type="button"
          aria-pressed={selected}
          onClick={() => selectVault(name, uri)}
          className={mergeClasses(
            'azv-list-item',
            classes.vaultSelect,
            selected && classes.vaultSelectSelected,
          )}
        >
          {pinned ? (
            <Star24Filled className={classes.starIcon} />
          ) : (
            <ShieldLock24Regular className={classes.vaultIcon} />
          )}
          <Text size={200} truncate wrap={false} className={`azv-mono ${classes.vaultName}`}>
            {name}
          </Text>
        </button>
        <Tooltip content={pinned ? 'Unpin' : 'Pin'} relationship="label">
          <Button
            appearance="subtle"
            size="small"
            className={`azv-pin ${classes.pinBtn}`}
            aria-label={pinned ? `Unpin ${name}` : `Pin ${name}`}
            icon={
              pinned ? (
                <Star24Filled style={{ color: tokens.colorPaletteYellowForeground1 }} />
              ) : (
                <Star24Regular />
              )
            }
            onClick={() => togglePin(name, uri)}
          />
        </Tooltip>
      </div>
    );
  };

  const hasAnything = pinnedVaults.length > 0 || keyvaults.length > 0;

  return (
    <nav className={classes.root} aria-label="Vaults">
      <div className={classes.header}>
        <Text size={100} className={`azv-title ${classes.headerTitle}`}>
          Vaults
        </Text>
        {keyvaults.length > 0 && (
          <Badge size="small" appearance="outline">
            {keyvaults.length}
          </Badge>
        )}
      </div>

      {hasAnything && (keyvaults.length > 6 || pinnedVaults.length > 6) && (
        <div className={classes.filterWrap}>
          <Input
            value={filter}
            onChange={(_, d) => setFilter(d.value)}
            placeholder="Filter vaults..."
            size="small"
            contentBefore={<Search24Regular style={{ fontSize: 14 }} />}
            className={classes.filterInput}
          />
        </div>
      )}

      <div className={classes.scroll}>
        {pinnedFiltered.length > 0 && (
          <div className={classes.section}>
            <Text size={100} className={`azv-title ${classes.sectionLabel}`} block>
              Pinned
            </Text>
            {pinnedFiltered.map((v) => renderVaultRow(v.name, v.uri, `pin-${v.uri}`))}
          </div>
        )}

        {subVaults.length > 0 && (
          <div className={classes.section}>
            <Text size={100} className={`azv-title ${classes.sectionLabel}`} block>
              This Subscription
            </Text>
            {subVaults.map((v) => renderVaultRow(v.name, v.vaultUri, v.id))}
          </div>
        )}

        {q && pinnedFiltered.length === 0 && subVaults.length === 0 && (
          <div className={classes.emptyState}>
            <Text block size={200} className={classes.emptyText}>
              No vaults match “{filter}”.
            </Text>
          </div>
        )}

        {!hasAnything && (
          <div className={classes.emptyState}>
            <ShieldLock24Regular className={classes.emptyIcon} />
            <Text block size={200} className={classes.emptyText}>
              {selectedSubscriptionId
                ? 'No Key Vaults in this subscription.'
                : 'Pick a tenant and subscription in the top bar to list its vaults here.'}
            </Text>
          </div>
        )}
      </div>
    </nav>
  );
}
