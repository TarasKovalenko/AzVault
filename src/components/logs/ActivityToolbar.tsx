import { ListToolbar } from '../common/ListToolbar';
import { Button } from '../ui/Button';
import { Select } from '../ui/Field';
import { Icon } from '../ui/Icon';
import { ALL, type AuditFilterState } from './auditFilter';
import { actionLabel, itemTypeLabel, resultLabel } from './auditLabels';

/**
 * Filter values stay the backend enums the audit log stores; only the option
 * text is translated for the reader.
 */
const FILTERS: Array<{
  key: keyof Omit<AuditFilterState, 'search'>;
  label: string;
  options: string[];
  optionLabel: (value: string) => string;
  width: string;
}> = [
  {
    key: 'action',
    label: 'Action',
    options: [ALL, 'list', 'get', 'get_value', 'set', 'delete', 'recover', 'purge'],
    optionLabel: actionLabel,
    width: 'w-36',
  },
  {
    key: 'result',
    label: 'Result',
    options: [ALL, 'success', 'error'],
    optionLabel: resultLabel,
    width: 'w-24',
  },
  {
    key: 'itemType',
    label: 'Item type',
    options: [ALL, 'secret', 'key', 'certificate'],
    optionLabel: itemTypeLabel,
    width: 'w-28',
  },
];

export function ActivityToolbar({
  vaultName,
  count,
  total,
  filter,
  onFilterChange,
  exporting,
  copied,
  clearing,
  onExport,
  onClear,
}: {
  vaultName: string;
  count: number;
  total: number;
  filter: AuditFilterState;
  onFilterChange: (filter: AuditFilterState) => void;
  exporting: boolean;
  copied: boolean;
  clearing: boolean;
  onExport: () => void;
  onClear: () => void;
}) {
  return (
    <ListToolbar
      title="Activity"
      subtitle={vaultName}
      count={count}
      total={total}
      filter={filter.search}
      filterPlaceholder="Search activity"
      onFilterChange={(search) => onFilterChange({ ...filter, search })}
      status={
        <div className="flex items-center gap-1.5">
          {FILTERS.map((field) => (
            <Select
              key={field.key}
              aria-label={`${field.label} filter`}
              value={filter[field.key]}
              onChange={(event) => onFilterChange({ ...filter, [field.key]: event.target.value })}
              className={field.width}
            >
              {field.options.map((value) => (
                <option key={value} value={value}>
                  {value === ALL ? ALL : field.optionLabel(value)}
                </option>
              ))}
            </Select>
          ))}
        </div>
      }
      actions={
        <>
          <Button
            variant="ghost"
            size="xs"
            loading={exporting}
            icon={<Icon name={copied ? 'check' : 'download'} />}
            onClick={onExport}
          >
            {copied ? 'Copied' : 'Export'}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            icon={<Icon name="delete" />}
            disabled={clearing}
            onClick={onClear}
          >
            Clear
          </Button>
        </>
      }
    />
  );
}
