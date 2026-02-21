import {
  Button,
  Combobox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Divider,
  Option,
  Switch,
  Text,
  tokens,
} from '@fluentui/react-components';
import { Dismiss24Regular } from '@fluentui/react-icons';
import { useAppStore } from '../../stores/appStore';

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

interface ShortcutRowProps {
  label: string;
  keys: string;
}

function ShortcutRow({ label, keys }: ShortcutRowProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
      <Text size={200}>{label}</Text>
      <span className="azv-kbd">{keys}</span>
    </div>
  );
}

export function SettingsDialog() {
  const {
    settingsOpen,
    setSettingsOpen,
    themeMode,
    setThemeMode,
    requireReauthForReveal,
    setRequireReauthForReveal,
    autoHideSeconds,
    setAutoHideSeconds,
    clipboardClearSeconds,
    setClipboardClearSeconds,
    disableClipboardCopy,
    setDisableClipboardCopy,
    auditRefreshInterval,
    setAuditRefreshInterval,
    environment,
    setEnvironment,
  } = useAppStore();

  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
  const mod = isMac ? '⌘' : 'Ctrl+';

  return (
    <Dialog open={settingsOpen} onOpenChange={(_, d) => setSettingsOpen(d.open)}>
      <DialogSurface style={{ maxWidth: 520 }}>
        <DialogBody>
          <DialogTitle
            action={
              <Button
                appearance="subtle"
                icon={<Dismiss24Regular />}
                onClick={() => setSettingsOpen(false)}
              />
            }
          >
            Settings
          </DialogTitle>
          <DialogContent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '8px 0' }}>
              {/* Appearance */}
              <section>
                <Text weight="semibold" size={300} block style={{ marginBottom: 8 }}>
                  Appearance
                </Text>
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Text size={200}>Theme</Text>
                  <Combobox
                    value={themeMode === 'dark' ? 'Dark' : 'Light'}
                    selectedOptions={[themeMode]}
                    onOptionSelect={(_, d) => setThemeMode(d.optionValue as 'light' | 'dark')}
                    style={{ minWidth: 120 }}
                  >
                    <Option value="light">Light</Option>
                    <Option value="dark">Dark</Option>
                  </Combobox>
                </div>
              </section>

              <Divider />

              {/* Security */}
              <section>
                <Text weight="semibold" size={300} block style={{ marginBottom: 8 }}>
                  Security
                </Text>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text size={200}>Require re-auth before fetching values</Text>
                      <Switch
                        checked={requireReauthForReveal}
                        onChange={(_, d) => setRequireReauthForReveal(d.checked)}
                      />
                    </div>
                    <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
                      Re-verify your Azure CLI session before any secret value is retrieved.
                    </Text>
                  </div>

                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text size={200}>Auto-hide secret values after</Text>
                      <Combobox
                        value={
                          AUTO_HIDE_OPTIONS.find((o) => o.value === autoHideSeconds)?.label ||
                          `${autoHideSeconds}s`
                        }
                        selectedOptions={[String(autoHideSeconds)]}
                        onOptionSelect={(_, d) => setAutoHideSeconds(Number(d.optionValue))}
                        style={{ minWidth: 130 }}
                      >
                        {AUTO_HIDE_OPTIONS.map((o) => (
                          <Option key={o.value} value={String(o.value)}>
                            {o.label}
                          </Option>
                        ))}
                      </Combobox>
                    </div>
                    <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
                      Revealed values revert to masked after this duration.
                    </Text>
                  </div>

                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text size={200}>Clipboard auto-clear after copy</Text>
                      <Combobox
                        value={
                          CLIPBOARD_OPTIONS.find((o) => o.value === clipboardClearSeconds)?.label ||
                          `${clipboardClearSeconds}s`
                        }
                        selectedOptions={[String(clipboardClearSeconds)]}
                        onOptionSelect={(_, d) => setClipboardClearSeconds(Number(d.optionValue))}
                        style={{ minWidth: 130 }}
                      >
                        {CLIPBOARD_OPTIONS.map((o) => (
                          <Option key={o.value} value={String(o.value)}>
                            {o.label}
                          </Option>
                        ))}
                      </Combobox>
                    </div>
                    <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
                      Copied secret values are cleared from clipboard automatically.
                    </Text>
                  </div>

                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text size={200}>Disable clipboard copy for values</Text>
                      <Switch
                        checked={disableClipboardCopy}
                        onChange={(_, d) => setDisableClipboardCopy(d.checked)}
                      />
                    </div>
                    <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
                      Removes the Copy button. Values can only be viewed, not copied.
                    </Text>
                  </div>
                </div>
              </section>

              <Divider />

              {/* Keyboard Shortcuts */}
              <section>
                <Text weight="semibold" size={300} block style={{ marginBottom: 8 }}>
                  Keyboard Shortcuts
                </Text>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <ShortcutRow label="Command palette" keys={`${mod}K`} />
                  <ShortcutRow label="Settings" keys={`${mod},`} />
                  <ShortcutRow label="Toggle sidebar" keys={`${mod}B`} />
                  <ShortcutRow label="Toggle detail panel" keys={`${mod}\\`} />
                  <ShortcutRow label="Secrets tab" keys={`${mod}1`} />
                  <ShortcutRow label="Keys tab" keys={`${mod}2`} />
                  <ShortcutRow label="Certificates tab" keys={`${mod}3`} />
                  <ShortcutRow label="Dashboard" keys={`${mod}4`} />
                  <ShortcutRow label="Audit Log" keys={`${mod}5`} />
                </div>
              </section>

              <Divider />

              {/* Audit Log */}
              <section>
                <Text weight="semibold" size={300} block style={{ marginBottom: 8 }}>
                  Audit Log
                </Text>
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Text size={200}>Auto-refresh interval</Text>
                  <Combobox
                    value={
                      REFRESH_OPTIONS.find((o) => o.value === auditRefreshInterval)?.label ||
                      `${auditRefreshInterval}ms`
                    }
                    selectedOptions={[String(auditRefreshInterval)]}
                    onOptionSelect={(_, d) => setAuditRefreshInterval(Number(d.optionValue))}
                    style={{ minWidth: 130 }}
                  >
                    {REFRESH_OPTIONS.map((o) => (
                      <Option key={o.value} value={String(o.value)}>
                        {o.label}
                      </Option>
                    ))}
                  </Combobox>
                </div>
              </section>

              <Divider />

              {/* Advanced */}
              <section>
                <Text weight="semibold" size={300} block style={{ marginBottom: 8 }}>
                  Advanced
                </Text>
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Text size={200}>Azure environment</Text>
                  <Combobox
                    value={
                      environment === 'azurePublic'
                        ? 'Azure Public'
                        : environment === 'azureUsGovernment'
                          ? 'US Government'
                          : 'China'
                    }
                    selectedOptions={[environment]}
                    onOptionSelect={(_, d) => setEnvironment(d.optionValue as typeof environment)}
                    style={{ minWidth: 150 }}
                  >
                    <Option value="azurePublic">Azure Public</Option>
                    <Option value="azureUsGovernment">US Government</Option>
                    <Option value="azureChina">Azure China</Option>
                  </Combobox>
                </div>
              </section>

              <Divider />

              {/* About */}
              <section>
                <Text weight="semibold" size={300} block style={{ marginBottom: 4 }}>
                  About
                </Text>
                <Text size={200} block className="azv-mono">
                  AzVault v0.1.0
                </Text>
                <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
                  Tauri v2 · React · Fluent UI
                </Text>
                <Text
                  size={100}
                  block
                  style={{ color: tokens.colorNeutralForeground3, marginTop: 4 }}
                >
                  No telemetry. No data leaves your machine except Azure API calls.
                </Text>
              </section>
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={() => setSettingsOpen(false)}>
              Done
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
