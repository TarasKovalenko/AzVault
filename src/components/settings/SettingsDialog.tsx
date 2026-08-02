import { useAppStore } from '../../stores/appStore';
import { Button } from '../ui/Button';
import { Select, Switch } from '../ui/Field';
import { Modal } from '../ui/Modal';

const AUTO_HIDE_OPTIONS = [
  { value: 15, label: '15 seconds' },
  { value: 30, label: '30 seconds' },
  { value: 60, label: '60 seconds' },
  { value: 120, label: '2 minutes' },
];
const CLIPBOARD_OPTIONS = [
  { value: 15, label: '15 seconds' },
  { value: 30, label: '30 seconds' },
  { value: 60, label: '60 seconds' },
];
const REFRESH_OPTIONS = [
  { value: 5000, label: '5 seconds' },
  { value: 10000, label: '10 seconds' },
  { value: 30000, label: '30 seconds' },
  { value: 60000, label: '1 minute' },
];

function SettingRow({
  title,
  description,
  control,
}: {
  title: string;
  description?: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-5 py-2">
      <div>
        <p className="text-[13px]">{title}</p>
        {description && (
          <p className="mt-0.5 max-w-xs text-[11px] leading-4 text-[var(--text-tertiary)]">
            {description}
          </p>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--text-tertiary)]">
        {title}
      </h3>
      <div className="rounded-xl border border-[var(--stroke)] bg-[var(--surface-muted)] px-3 divide-y divide-[var(--stroke)]">
        {children}
      </div>
    </section>
  );
}

function Shortcut({ label, keys }: { label: string; keys: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-xs">
      <span>{label}</span>
      <kbd className="rounded-md border border-[var(--stroke)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)] shadow-sm">
        {keys}
      </kbd>
    </div>
  );
}

export function SettingsDialog() {
  const settingsOpen = useAppStore((state) => state.settingsOpen);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const themeMode = useAppStore((state) => state.themeMode);
  const setThemeMode = useAppStore((state) => state.setThemeMode);
  const requireReauthForReveal = useAppStore((state) => state.requireReauthForReveal);
  const setRequireReauthForReveal = useAppStore((state) => state.setRequireReauthForReveal);
  const autoHideSeconds = useAppStore((state) => state.autoHideSeconds);
  const setAutoHideSeconds = useAppStore((state) => state.setAutoHideSeconds);
  const clipboardClearSeconds = useAppStore((state) => state.clipboardClearSeconds);
  const setClipboardClearSeconds = useAppStore((state) => state.setClipboardClearSeconds);
  const disableClipboardCopy = useAppStore((state) => state.disableClipboardCopy);
  const setDisableClipboardCopy = useAppStore((state) => state.setDisableClipboardCopy);
  const auditRefreshInterval = useAppStore((state) => state.auditRefreshInterval);
  const setAuditRefreshInterval = useAppStore((state) => state.setAuditRefreshInterval);
  const environment = useAppStore((state) => state.environment);
  const setEnvironment = useAppStore((state) => state.setEnvironment);
  const mod = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl+';

  return (
    <Modal
      open={settingsOpen}
      onClose={() => setSettingsOpen(false)}
      title="Settings"
      size="lg"
      footer={
        <Button variant="primary" onClick={() => setSettingsOpen(false)}>
          Done
        </Button>
      }
    >
      <div className="grid gap-5">
        <Section title="Appearance">
          <SettingRow
            title="Appearance"
            control={
              <Select
                value={themeMode}
                onChange={(event) => setThemeMode(event.target.value as 'light' | 'dark')}
                className="w-32"
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </Select>
            }
          />
        </Section>
        <Section title="Security">
          <SettingRow
            title="Confirm before fetching values"
            description="Adds an in-app confirmation before retrieving a secret value."
            control={
              <Switch
                checked={requireReauthForReveal}
                onChange={setRequireReauthForReveal}
                label="Confirm before fetching values"
              />
            }
          />
          <SettingRow
            title="Auto-hide secret values"
            description="Revealed values return to masked after this duration."
            control={
              <Select
                value={autoHideSeconds}
                onChange={(event) => setAutoHideSeconds(Number(event.target.value))}
                className="w-32"
              >
                {AUTO_HIDE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            }
          />
          <SettingRow
            title="Clear clipboard after copy"
            description="Copied secret values are removed automatically."
            control={
              <Select
                value={clipboardClearSeconds}
                onChange={(event) => setClipboardClearSeconds(Number(event.target.value))}
                className="w-32"
              >
                {CLIPBOARD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            }
          />
          <SettingRow
            title="Disable clipboard copy"
            description="Values may be viewed but not copied."
            control={
              <Switch
                checked={disableClipboardCopy}
                onChange={setDisableClipboardCopy}
                label="Disable clipboard copy"
              />
            }
          />
        </Section>
        <Section title="Activity">
          <SettingRow
            title="Refresh interval"
            control={
              <Select
                value={auditRefreshInterval}
                onChange={(event) => setAuditRefreshInterval(Number(event.target.value))}
                className="w-32"
              >
                {REFRESH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            }
          />
        </Section>
        <Section title="Azure">
          <SettingRow
            title="Environment"
            control={
              <Select
                value={environment}
                onChange={(event) => setEnvironment(event.target.value as typeof environment)}
                className="w-40"
              >
                <option value="azurePublic">Azure Public</option>
                <option value="azureUsGovernment">US Government</option>
                <option value="azureChina">Azure China</option>
              </Select>
            }
          />
        </Section>
        <Section title="Keyboard Shortcuts">
          <Shortcut label="Command palette" keys={`${mod}K`} />
          <Shortcut label="Settings" keys={`${mod},`} />
          <Shortcut label="Toggle detail panel" keys={`${mod}\\`} />
          <Shortcut label="Secrets / Keys / Certificates" keys={`${mod}1 / 2 / 3`} />
          <Shortcut label="Overview / Activity" keys={`${mod}4 / 5`} />
        </Section>
        <Section title="About">
          <div className="py-2">
            <p className="mono text-xs font-medium">AzVault v1.0.1</p>
            <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
              Tauri v2 · React · Tailwind CSS · No telemetry
            </p>
          </div>
        </Section>
      </div>
    </Modal>
  );
}
