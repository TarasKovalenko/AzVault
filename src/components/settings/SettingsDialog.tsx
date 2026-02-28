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
  makeStyles,
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

const useStyles = makeStyles({
  shortcutRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '3px 0',
  },
  dialogSurface: {
    maxWidth: '520px',
  },
  contentWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    padding: '8px 0',
  },
  sectionTitle: {
    marginBottom: '8px',
  },
  rowBetween: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  columnGap12: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  comboboxMinWidth120: {
    minWidth: '120px',
  },
  comboboxMinWidth130: {
    minWidth: '130px',
  },
  comboboxMinWidth150: {
    minWidth: '150px',
  },
  descriptionText: {
    color: tokens.colorNeutralForeground3,
  },
  shortcutsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  aboutTitle: {
    marginBottom: '4px',
  },
  aboutBody: {
    color: tokens.colorNeutralForeground3,
  },
  aboutBodyWithMargin: {
    color: tokens.colorNeutralForeground3,
    marginTop: '4px',
  },
});

interface ShortcutRowProps {
  label: string;
  keys: string;
  className?: string;
}

function ShortcutRow({ label, keys, className }: ShortcutRowProps) {
  return (
    <div className={className}>
      <Text size={200}>{label}</Text>
      <span className="azv-kbd">{keys}</span>
    </div>
  );
}

export function SettingsDialog() {
  const classes = useStyles();
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
      <DialogSurface className={classes.dialogSurface}>
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
            <div className={classes.contentWrapper}>
              {/* Appearance */}
              <section>
                <Text weight="semibold" size={300} block className={classes.sectionTitle}>
                  Appearance
                </Text>
                <div className={classes.rowBetween}>
                  <Text size={200}>Theme</Text>
                  <Combobox
                    value={themeMode === 'dark' ? 'Dark' : 'Light'}
                    selectedOptions={[themeMode]}
                    onOptionSelect={(_, d) => setThemeMode(d.optionValue as 'light' | 'dark')}
                    className={classes.comboboxMinWidth120}
                  >
                    <Option value="light">Light</Option>
                    <Option value="dark">Dark</Option>
                  </Combobox>
                </div>
              </section>

              <Divider />

              {/* Security */}
              <section>
                <Text weight="semibold" size={300} block className={classes.sectionTitle}>
                  Security
                </Text>

                <div className={classes.columnGap12}>
                  <div>
                    <div className={classes.rowBetween}>
                      <Text size={200}>Require confirmation before fetching values</Text>
                      <Switch
                        checked={requireReauthForReveal}
                        onChange={(_, d) => setRequireReauthForReveal(d.checked)}
                      />
                    </div>
                    <Text size={100} className={classes.descriptionText}>
                      Adds an in-app confirmation step before retrieving any secret value.
                    </Text>
                  </div>

                  <div>
                    <div className={classes.rowBetween}>
                      <Text size={200}>Auto-hide secret values after</Text>
                      <Combobox
                        value={
                          AUTO_HIDE_OPTIONS.find((o) => o.value === autoHideSeconds)?.label ||
                          `${autoHideSeconds}s`
                        }
                        selectedOptions={[String(autoHideSeconds)]}
                        onOptionSelect={(_, d) => setAutoHideSeconds(Number(d.optionValue))}
                        className={classes.comboboxMinWidth130}
                      >
                        {AUTO_HIDE_OPTIONS.map((o) => (
                          <Option key={o.value} value={String(o.value)}>
                            {o.label}
                          </Option>
                        ))}
                      </Combobox>
                    </div>
                    <Text size={100} className={classes.descriptionText}>
                      Revealed values revert to masked after this duration.
                    </Text>
                  </div>

                  <div>
                    <div className={classes.rowBetween}>
                      <Text size={200}>Clipboard auto-clear after copy</Text>
                      <Combobox
                        value={
                          CLIPBOARD_OPTIONS.find((o) => o.value === clipboardClearSeconds)?.label ||
                          `${clipboardClearSeconds}s`
                        }
                        selectedOptions={[String(clipboardClearSeconds)]}
                        onOptionSelect={(_, d) => setClipboardClearSeconds(Number(d.optionValue))}
                        className={classes.comboboxMinWidth130}
                      >
                        {CLIPBOARD_OPTIONS.map((o) => (
                          <Option key={o.value} value={String(o.value)}>
                            {o.label}
                          </Option>
                        ))}
                      </Combobox>
                    </div>
                    <Text size={100} className={classes.descriptionText}>
                      Copied secret values are cleared from clipboard automatically.
                    </Text>
                  </div>

                  <div>
                    <div className={classes.rowBetween}>
                      <Text size={200}>Disable clipboard copy for values</Text>
                      <Switch
                        checked={disableClipboardCopy}
                        onChange={(_, d) => setDisableClipboardCopy(d.checked)}
                      />
                    </div>
                    <Text size={100} className={classes.descriptionText}>
                      Removes the Copy button. Values can only be viewed, not copied.
                    </Text>
                  </div>
                </div>
              </section>

              <Divider />

              {/* Keyboard Shortcuts */}
              <section>
                <Text weight="semibold" size={300} block className={classes.sectionTitle}>
                  Keyboard Shortcuts
                </Text>
                <div className={classes.shortcutsList}>
                  <ShortcutRow
                    label="Command palette"
                    keys={`${mod}K`}
                    className={classes.shortcutRow}
                  />
                  <ShortcutRow label="Settings" keys={`${mod},`} className={classes.shortcutRow} />
                  <ShortcutRow
                    label="Toggle sidebar"
                    keys={`${mod}B`}
                    className={classes.shortcutRow}
                  />
                  <ShortcutRow
                    label="Toggle detail panel"
                    keys={`${mod}\\`}
                    className={classes.shortcutRow}
                  />
                  <ShortcutRow
                    label="Secrets tab"
                    keys={`${mod}1`}
                    className={classes.shortcutRow}
                  />
                  <ShortcutRow label="Keys tab" keys={`${mod}2`} className={classes.shortcutRow} />
                  <ShortcutRow
                    label="Certificates tab"
                    keys={`${mod}3`}
                    className={classes.shortcutRow}
                  />
                  <ShortcutRow label="Dashboard" keys={`${mod}4`} className={classes.shortcutRow} />
                  <ShortcutRow label="Audit Log" keys={`${mod}5`} className={classes.shortcutRow} />
                </div>
              </section>

              <Divider />

              {/* Audit Log */}
              <section>
                <Text weight="semibold" size={300} block className={classes.sectionTitle}>
                  Audit Log
                </Text>
                <div className={classes.rowBetween}>
                  <Text size={200}>Auto-refresh interval</Text>
                  <Combobox
                    value={
                      REFRESH_OPTIONS.find((o) => o.value === auditRefreshInterval)?.label ||
                      `${auditRefreshInterval}ms`
                    }
                    selectedOptions={[String(auditRefreshInterval)]}
                    onOptionSelect={(_, d) => setAuditRefreshInterval(Number(d.optionValue))}
                    className={classes.comboboxMinWidth130}
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
                <Text weight="semibold" size={300} block className={classes.sectionTitle}>
                  Advanced
                </Text>
                <div className={classes.rowBetween}>
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
                    className={classes.comboboxMinWidth150}
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
                <Text weight="semibold" size={300} block className={classes.aboutTitle}>
                  About
                </Text>
                <Text size={200} block className="azv-mono">
                  AzVault v1.0.0
                </Text>
                <Text size={100} className={classes.aboutBody}>
                  Tauri v2 · React · Fluent UI
                </Text>
                <Text size={100} block className={classes.aboutBodyWithMargin}>
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
