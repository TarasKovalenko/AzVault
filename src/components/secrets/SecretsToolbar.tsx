import type { ChangeEvent, RefObject } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Dropdown, DropdownItem } from '../ui/Dropdown';
import { Input } from '../ui/Field';
import { Icon } from '../ui/Icon';
import type { ExportFormat } from './secretsExport';

export function SecretsToolbar({
  count,
  total,
  filter,
  selectedCount,
  importing,
  deleting,
  inputRef,
  onFilter,
  onFile,
  onImport,
  onExport,
  onCreate,
  onDeleteSelected,
  onDeletePrefix,
}: {
  count?: number;
  total: number;
  filter: string;
  selectedCount: number;
  importing: boolean;
  deleting: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onFilter: (value: string) => void;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onImport: () => void;
  onExport: (format: ExportFormat) => void;
  onCreate: () => void;
  onDeleteSelected: () => void;
  onDeletePrefix: () => void;
}) {
  return (
    <header className="mac-vibrancy flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-[var(--stroke)] px-3">
      <h1 className="text-[14px] font-semibold">Secrets</h1>
      {count !== undefined && (
        <span className="mono text-[11px] text-[var(--text-tertiary)]">
          {count}
          {filter ? ` / ${total}` : ''}
        </span>
      )}
      {selectedCount > 0 && <Badge tone="blue">{selectedCount} selected</Badge>}
      <div className="ml-auto flex items-center gap-1.5">
        <div className="relative">
          <Icon
            name="search"
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
          />
          <Input
            data-azv-list-search
            value={filter}
            onChange={(event) => onFilter(event.target.value)}
            placeholder="Filter"
            className="w-40 pl-8"
          />
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          onChange={onFile}
          className="hidden"
        />
        <Dropdown
          trigger={
            <Button variant="ghost" size="xs" icon={<Icon name="download" />}>
              Export
            </Button>
          }
        >
          <DropdownItem onClick={() => onExport('json')}>Export as JSON</DropdownItem>
          <DropdownItem onClick={() => onExport('csv')}>Export as CSV</DropdownItem>
        </Dropdown>
        <Button size="xs" onClick={onImport} disabled={importing}>
          {importing ? 'Importing…' : 'Import JSON'}
        </Button>
        <Button variant="primary" size="xs" icon={<Icon name="add" />} onClick={onCreate}>
          New
        </Button>
        <Dropdown
          align="end"
          trigger={
            <Button size="xs" icon={<Icon name="delete" />} disabled={deleting}>
              Delete
            </Button>
          }
        >
          <DropdownItem disabled={!selectedCount} onClick={onDeleteSelected}>
            Delete Selected{selectedCount ? ` (${selectedCount})` : ''}
          </DropdownItem>
          <DropdownItem onClick={onDeletePrefix}>Delete by Prefix</DropdownItem>
        </Dropdown>
      </div>
    </header>
  );
}
