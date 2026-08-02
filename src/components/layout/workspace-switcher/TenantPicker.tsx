import type { Tenant } from '../../../types';
import { WorkspaceSelect } from './WorkspaceSelect';

export function TenantPicker({
  tenants,
  selectedTenantId,
  isLoading,
  onSelect,
}: {
  tenants: Tenant[];
  selectedTenantId: string | null;
  isLoading: boolean;
  onSelect: (tenantId: string) => void;
}) {
  const current = tenants.find((tenant) => tenant.tenant_id === selectedTenantId);
  return (
    <WorkspaceSelect
      icon="building"
      isLoading={isLoading}
      aria-label="Tenant"
      title={`Tenant: ${current?.display_name || selectedTenantId || 'none selected'}`}
      value={selectedTenantId || ''}
      onChange={(event) => onSelect(event.target.value)}
      className="max-w-36"
    >
      {!selectedTenantId && <option value="">Tenant</option>}
      {tenants.map((tenant) => (
        <option key={tenant.tenant_id} value={tenant.tenant_id}>
          {tenant.display_name || tenant.tenant_id.slice(0, 8)}
        </option>
      ))}
      {tenants.length === 0 && <option disabled>No tenants found</option>}
    </WorkspaceSelect>
  );
}
