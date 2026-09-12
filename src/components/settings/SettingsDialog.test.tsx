import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../stores/appStore';
import { SettingsDialog } from './SettingsDialog';

const initialState = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(initialState, true);
});

const open = () => {
  useAppStore.setState({ settingsOpen: true });
  render(<SettingsDialog />);
};

describe('SettingsDialog', () => {
  it('stays closed until asked', () => {
    render(<SettingsDialog />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('changes the theme', async () => {
    open();
    await userEvent.selectOptions(screen.getByDisplayValue('Light'), 'dark');
    expect(useAppStore.getState().themeMode).toBe('dark');
  });

  it('toggles the security switches', async () => {
    open();
    await userEvent.click(screen.getByRole('switch', { name: 'Confirm before fetching values' }));
    expect(useAppStore.getState().requireReauthForReveal).toBe(true);
    await userEvent.click(screen.getByRole('switch', { name: 'Disable clipboard copy' }));
    expect(useAppStore.getState().disableClipboardCopy).toBe(true);
  });

  it('changes the numeric durations', async () => {
    open();
    const [autoHide, clipboard] = screen.getAllByDisplayValue('30 seconds');
    await userEvent.selectOptions(autoHide, '60');
    expect(useAppStore.getState().autoHideSeconds).toBe(60);
    await userEvent.selectOptions(clipboard, '15');
    expect(useAppStore.getState().clipboardClearSeconds).toBe(15);
    await userEvent.selectOptions(screen.getByDisplayValue('10 seconds'), '5000');
    expect(useAppStore.getState().auditRefreshInterval).toBe(5000);
  });

  it('changes the Azure environment', async () => {
    open();
    await userEvent.selectOptions(screen.getByDisplayValue('Azure Public'), 'azureChina');
    expect(useAppStore.getState().environment).toBe('azureChina');
  });

  it('documents the shortcuts and the version', () => {
    open();
    expect(screen.getByText('Command palette')).toBeInTheDocument();
    expect(screen.getByText('Ctrl+K')).toBeInTheDocument();
    expect(screen.getByText('Ctrl+Shift+D')).toBeInTheDocument();
    expect(screen.getByText(/AzVault v/)).toBeInTheDocument();
  });

  it('closes from the footer', async () => {
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(useAppStore.getState().settingsOpen).toBe(false);
  });
});
