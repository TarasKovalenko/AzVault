/**
 * CertificatesList.tsx – X.509 certificate browser.
 *
 * Displays certificate metadata (subject, thumbprint, dates) in a
 * paginated table. Individual certs open in the metadata drawer.
 */

import { Button, Text, tokens } from '@fluentui/react-components';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { listCertificates } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import type { CertificateItem } from '../../types';
import { ItemMetadataDrawer } from '../common/ItemMetadataDrawer';
import type { Column } from '../common/ItemTable';
import { ItemTable, renderDate, renderEnabled } from '../common/ItemTable';

/** Column definitions for the certificates table. */
const columns: Column<CertificateItem>[] = [
  {
    key: 'name',
    label: 'Name',
    width: '20%',
    render: (item) => (
      <Text weight="semibold" size={200} className="azv-mono">
        {item.name}
      </Text>
    ),
  },
  {
    key: 'enabled',
    label: 'Status',
    width: '10%',
    render: (item) => renderEnabled(item.enabled),
  },
  {
    key: 'subject',
    label: 'Subject',
    width: '20%',
    render: (item) => (
      <Text size={200} className="azv-mono" style={{ opacity: item.subject ? 1 : 0.4 }}>
        {item.subject || '—'}
      </Text>
    ),
  },
  {
    key: 'thumbprint',
    label: 'Thumbprint',
    width: '15%',
    render: (item) => (
      <Text size={200} className="azv-mono" style={{ fontSize: 10, opacity: 0.8 }}>
        {item.thumbprint ? `${item.thumbprint.slice(0, 16)}…` : '—'}
      </Text>
    ),
  },
  {
    key: 'updated',
    label: 'Updated',
    width: '15%',
    render: (item) => renderDate(item.updated),
  },
  {
    key: 'expires',
    label: 'Expires',
    width: '15%',
    render: (item) => {
      if (!item.expires)
        return (
          <Text size={200} style={{ opacity: 0.4 }}>
            Never
          </Text>
        );
      const expired = new Date(item.expires) < new Date();
      return (
        <Text size={200} style={{ color: expired ? 'var(--azv-danger)' : undefined }}>
          {renderDate(item.expires)}
        </Text>
      );
    },
  },
];

export function CertificatesList() {
  const { selectedVaultUri, searchQuery } = useAppStore();
  const [visibleCount, setVisibleCount] = useState(50);
  const [selectedCert, setSelectedCert] = useState<CertificateItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const certsQuery = useQuery({
    queryKey: ['certificates', selectedVaultUri],
    queryFn: () => listCertificates(selectedVaultUri!),
    enabled: !!selectedVaultUri,
  });

  const filteredCerts = (certsQuery.data || []).filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const visibleCerts = filteredCerts.slice(0, visibleCount);

  /** Extract version segment from a certificate ID URL. */
  const extractVersion = (id: string): string => {
    const parts = id.split('/');
    const idx = parts.indexOf('certificates');
    return idx >= 0 ? parts[idx + 2] || '—' : '—';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 16px',
          borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
          background: tokens.colorNeutralBackground2,
        }}
      >
        <Text weight="semibold" size={300}>
          Certificates
        </Text>
        <Text className="azv-title" style={{ marginLeft: 8 }}>
          x509
        </Text>
        {certsQuery.data && (
          <Text
            size={200}
            className="azv-mono"
            style={{ color: tokens.colorNeutralForeground3, marginLeft: 8 }}
          >
            ({filteredCerts.length}
            {searchQuery ? ` / ${certsQuery.data.length}` : ''})
          </Text>
        )}
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 16px' }}>
        <ItemTable
          items={visibleCerts}
          columns={columns}
          loading={certsQuery.isLoading}
          onSelect={(item) => {
            setSelectedCert(item);
            setDrawerOpen(true);
          }}
          getItemId={(c) => c.id}
          emptyMessage={
            certsQuery.isError
              ? `Error: ${certsQuery.error}`
              : 'No certificates found in this vault'
          }
        />
        {filteredCerts.length > visibleCount && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
            <Button
              onClick={() => setVisibleCount((c) => c + 50)}
              appearance="secondary"
              size="small"
            >
              Load 50 more
            </Button>
          </div>
        )}
      </div>

      {/* Metadata Drawer */}
      <ItemMetadataDrawer
        title={selectedCert?.name || 'Certificate'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        enabled={selectedCert?.enabled}
        tags={selectedCert?.tags}
        metadata={{
          Name: selectedCert?.name,
          Version: selectedCert ? extractVersion(selectedCert.id) : '—',
          Subject: selectedCert?.subject,
          Thumbprint: selectedCert?.thumbprint,
          Created: selectedCert?.created,
          Updated: selectedCert?.updated,
          Expires: selectedCert?.expires || 'Never',
          'Not Before': selectedCert?.notBefore,
          ID: selectedCert?.id,
        }}
      />
    </div>
  );
}
