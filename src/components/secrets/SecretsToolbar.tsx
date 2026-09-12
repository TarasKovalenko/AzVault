import type { ChangeEvent, RefObject } from 'react';
import { ListToolbar } from '../common/ListToolbar';
import { Button } from '../ui/Button';
import { Dropdown, DropdownItem } from '../ui/Dropdown';
import { Icon } from '../ui/Icon';
import type { ExportFormat } from './secretsExport';

/**
 * Secrets header. Only the primary action ("New secret") is a standing button;
 * import/export/bulk-delete live in one overflow menu, and destructive bulk
 * actions surface in a selection bar that appears only when rows are checked.
 */
export function SecretsToolbar({
  count,
  total,
  matchCount,
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
  onClearSelection,
}: {
  count?: number;
  total: number;
  /** How many rows the current filter matches, for the selection bar. */
  matchCount: number;
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
  onClearSelection: () => void;
}) {
  return (
    <>
      <ListToolbar
        title="Secrets"
        count={count}
        total={total}
        filter={filter}
        onFilterChange={onFilter}
        actions={
          <>
            <input
              ref={inputRef}
              type="file"
              accept="application/json,.json"
              onChange={onFile}
              className="hidden"
            />
            <Button variant="primary" size="xs" icon={<Icon name="add" />} onClick={onCreate}>
              New secret
            </Button>
            <Dropdown
              align="end"
              trigger={
                <Button
                  variant="ghost"
                  size="xs"
                  aria-label="More secret actions"
                  icon={<Icon name="more" />}
                />
              }
            >
              <DropdownItem icon={<Icon name="download" />} onClick={onImport} disabled={importing}>
                {importing ? 'Importing…' : 'Import from JSON…'}
              </DropdownItem>
              <DropdownItem icon={<Icon name="external" />} onClick={() => onExport('json')}>
                {selectedCount
                  ? `Export ${selectedCount} selected as JSON`
                  : 'Export metadata as JSON'}
              </DropdownItem>
              <DropdownItem icon={<Icon name="external" />} onClick={() => onExport('csv')}>
                {selectedCount
                  ? `Export ${selectedCount} selected as CSV`
                  : 'Export metadata as CSV'}
              </DropdownItem>
              <div className="my-1 border-t border-[var(--stroke)]" />
              <DropdownItem
                icon={<Icon name="delete" />}
                onClick={onDeletePrefix}
                disabled={deleting}
              >
                Delete by prefix…
              </DropdownItem>
            </Dropdown>
          </>
        }
      />
      {selectedCount > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--stroke)] bg-[var(--accent-soft)] px-3 py-1.5 text-xs">
          <span className="font-medium">
            {selectedCount} of {matchCount} selected
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="ghost" size="xs" onClick={onClearSelection} disabled={deleting}>
              Clear selection
            </Button>
            <Button
              variant="danger"
              size="xs"
              icon={<Icon name="delete" />}
              onClick={onDeleteSelected}
              disabled={deleting}
            >
              Delete selected
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
