import { Button } from '../ui/Button';
import { Select } from '../ui/Field';
import { Icon } from '../ui/Icon';

export function ActivityToolbar({
  vaultName,
  count,
  action,
  result,
  type,
  actions,
  results,
  types,
  exporting,
  copied,
  clearing,
  onAction,
  onResult,
  onType,
  onExport,
  onClear,
}: {
  vaultName: string;
  count: number;
  action: string;
  result: string;
  type: string;
  actions: string[];
  results: string[];
  types: string[];
  exporting: boolean;
  copied: boolean;
  clearing: boolean;
  onAction: (value: string) => void;
  onResult: (value: string) => void;
  onType: (value: string) => void;
  onExport: () => void;
  onClear: () => void;
}) {
  return (
    <header className="mac-vibrancy flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-[var(--stroke)] px-3">
      <div className="mr-2 min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-[14px] font-semibold">Activity</h1>
          <span className="mono text-[11px] text-[var(--text-tertiary)]">{count}</span>
        </div>
        <p className="mono max-w-56 truncate text-[10px] text-[var(--text-tertiary)]">
          {vaultName}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <Select
          aria-label="Action filter"
          value={action}
          onChange={(event) => onAction(event.target.value)}
          className="w-28"
        >
          {actions.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </Select>
        <Select
          aria-label="Result filter"
          value={result}
          onChange={(event) => onResult(event.target.value)}
          className="w-24"
        >
          {results.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </Select>
        <Select
          aria-label="Type filter"
          value={type}
          onChange={(event) => onType(event.target.value)}
          className="w-28"
        >
          {types.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </Select>
      </div>
      <div className="ml-auto flex gap-1.5">
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
      </div>
    </header>
  );
}
