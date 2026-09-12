import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as tauri from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import { makeAuditEntry } from '../../test/fixtures';
import { renderWithProviders } from '../../test/utils';
import { AuditLog } from './AuditLog';

vi.mock('../../services/tauri', () => ({
  getAuditLog: vi.fn(),
  exportAuditLog: vi.fn(),
  clearAuditLog: vi.fn(),
  saveExport: vi.fn(),
}));

const initialState = useAppStore.getState();
const entries = [
  makeAuditEntry({ itemName: 'alpha', action: 'get', timestamp: '2024-03-01T10:00:00Z' }),
  makeAuditEntry({
    itemName: 'beta',
    action: 'delete',
    result: 'error',
    itemType: 'key',
    details: 'Forbidden',
    timestamp: '2024-03-01T11:00:00Z',
  }),
];

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState(initialState, true);
  useAppStore.setState({ selectedVaultName: 'my-vault', auditRefreshInterval: 600_000 });
  vi.mocked(tauri.getAuditLog).mockResolvedValue(entries);
  vi.mocked(tauri.exportAuditLog).mockResolvedValue('[]');
  vi.mocked(tauri.clearAuditLog).mockResolvedValue(undefined);
});

describe('AuditLog', () => {
  it('asks for a vault first', () => {
    useAppStore.setState({ selectedVaultName: null });
    renderWithProviders(<AuditLog />);
    expect(screen.getByRole('heading', { name: 'Select a Key Vault' })).toBeInTheDocument();
  });

  it('lists the vault activity newest first', async () => {
    renderWithProviders(<AuditLog />);
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument());
    expect(tauri.getAuditLog).toHaveBeenCalledWith(1000, 'my-vault');
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('beta');
    expect(rows[1]).toHaveTextContent('alpha');
    expect(screen.getByText('Forbidden')).toBeInTheDocument();
  });

  it('shows a loading skeleton like every other list', () => {
    renderWithProviders(<AuditLog />);
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('shows display labels instead of backend enums', async () => {
    renderWithProviders(<AuditLog />);
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument());
    const [newest, oldest] = screen.getAllByRole('row').slice(1);
    expect(oldest).toHaveTextContent('Read');
    expect(oldest).toHaveTextContent('Secret');
    expect(oldest).toHaveTextContent('Success');
    expect(newest).toHaveTextContent('Delete');
    expect(newest).toHaveTextContent('Key');
    expect(newest).toHaveTextContent('Error');
    expect(screen.queryByText('get_value')).not.toBeInTheDocument();
    expect(screen.queryByText('success')).not.toBeInTheDocument();

    // The filters read as labels but still filter on the stored enum values.
    const actionFilter = screen.getByLabelText('Action filter') as HTMLSelectElement;
    expect(Array.from(actionFilter.options).map((option) => option.text)).toContain('Read value');
    expect(Array.from(actionFilter.options).map((option) => option.value)).toContain('get_value');
  });

  it('gives the table headers a scope and lets the arrow keys walk the rows', async () => {
    renderWithProviders(<AuditLog />);
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument());
    for (const header of screen.getAllByRole('columnheader')) {
      expect(header).toHaveAttribute('scope', 'col');
    }
    const rows = screen.getAllByRole('row').slice(1);
    rows[0].focus();
    expect(rows[0]).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(rows[1]).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(rows[0]).toHaveFocus();
  });

  it('does not repeat its own empty-state text in a footer', async () => {
    renderWithProviders(<AuditLog />);
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument());
    expect(screen.queryByText(/Only operation metadata/)).not.toBeInTheDocument();
  });

  it('offers a retry when the log itself cannot be read', async () => {
    vi.mocked(tauri.getAuditLog).mockRejectedValue(new Error('500 boom'));
    renderWithProviders(<AuditLog />);
    await waitFor(() => expect(screen.getByText('Unexpected error')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('filters by search and by each dropdown', async () => {
    renderWithProviders(<AuditLog />);
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText('Filter activity'), 'alpha');
    expect(screen.queryByText('beta')).not.toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Filter activity'));

    await userEvent.selectOptions(screen.getByLabelText('Result filter'), 'error');
    expect(screen.queryByText('alpha')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Item type filter'), 'secret');
    expect(screen.getByText('No matching activity')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('alpha')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Action filter'), 'delete');
    expect(screen.queryByText('alpha')).not.toBeInTheDocument();
  });

  it('explains an empty log', async () => {
    vi.mocked(tauri.getAuditLog).mockResolvedValue([]);
    renderWithProviders(<AuditLog />);
    await waitFor(() => expect(screen.getByText('No activity for this vault')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('copies the export to the clipboard', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    renderWithProviders(<AuditLog />);
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith('[]');
    expect(tauri.exportAuditLog).toHaveBeenCalledWith('my-vault');
    // Every other export path reports itself; so does this one.
    expect(screen.getByText('Activity copied')).toBeInTheDocument();
  });

  it('saves through the backend when the clipboard refuses, and names the file', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    vi.mocked(tauri.saveExport).mockResolvedValue('/Users/op/Downloads/azvault-activity-1.json');
    renderWithProviders(<AuditLog />);
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));

    // A blob download reports nothing back and writes nothing in the desktop
    // webview, so success is only claimed once the backend returns a path.
    await waitFor(() => expect(screen.getByText('Activity saved')).toBeInTheDocument());
    expect(vi.mocked(tauri.saveExport).mock.calls[0][0]).toMatch(/^azvault-activity-\d+\.json$/);
    expect(
      screen.getByText(/\/Users\/op\/Downloads\/azvault-activity-1\.json/),
    ).toBeInTheDocument();
  });

  it('reports a failed save instead of claiming the activity was written', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    vi.mocked(tauri.saveExport).mockRejectedValue(new Error('Could not write the export.'));
    renderWithProviders(<AuditLog />);
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));

    await waitFor(() => expect(screen.getByText('Export failed')).toBeInTheDocument());
    expect(screen.queryByText('Activity saved')).not.toBeInTheDocument();
  });

  it('reports a failed export', async () => {
    vi.mocked(tauri.exportAuditLog).mockRejectedValue(new Error('export exploded'));
    renderWithProviders(<AuditLog />);
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    // Shown twice on purpose: an alert toast and a dismissible banner with a retry.
    await waitFor(() => expect(screen.getAllByText('export exploded').length).toBe(2));
    expect(screen.getByRole('alert')).toHaveTextContent('Export failed');
    expect(screen.getAllByRole('button', { name: 'Retry' }).length).toBe(1);
    expect(screen.getByText('Unexpected error')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Unexpected error')).not.toBeInTheDocument();
  });

  it('exports when the command palette asks', async () => {
    renderWithProviders(<AuditLog />);
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument());
    act(() => {
      window.dispatchEvent(new CustomEvent('azv:export-audit'));
    });
    await waitFor(() => expect(tauri.exportAuditLog).toHaveBeenCalledWith('my-vault'));
  });

  it('clears the activity after confirmation', async () => {
    renderWithProviders(<AuditLog />);
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await userEvent.type(screen.getByPlaceholderText('clear'), 'clear');
    await userEvent.click(screen.getByRole('button', { name: 'Clear activity' }));
    await waitFor(() => expect(tauri.clearAuditLog).toHaveBeenCalledWith('my-vault'));
  });

  it('reports a failed clear', async () => {
    vi.mocked(tauri.clearAuditLog).mockRejectedValue(new Error('clear exploded'));
    renderWithProviders(<AuditLog />);
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await userEvent.type(screen.getByPlaceholderText('clear'), 'clear');
    await userEvent.click(screen.getByRole('button', { name: 'Clear activity' }));
    await waitFor(() => expect(screen.getAllByText('clear exploded').length).toBe(2));
  });

  it('pages through a long log', async () => {
    vi.mocked(tauri.getAuditLog).mockResolvedValue(
      Array.from({ length: 60 }, (_, index) => makeAuditEntry({ itemName: `entry-${index}` })),
    );
    renderWithProviders(<AuditLog />);
    await waitFor(() => expect(screen.getByText('entry-59')).toBeInTheDocument());
    expect(screen.getByText('50 of 60')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show 10 more' }));
    expect(screen.queryByText('50 of 60')).not.toBeInTheDocument();
  });

  it('re-opens the confirmation when a failed clear is retried', async () => {
    vi.mocked(tauri.clearAuditLog).mockRejectedValue(new Error('clear exploded'));
    renderWithProviders(<AuditLog />);
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await userEvent.type(screen.getByPlaceholderText('clear'), 'clear');
    await userEvent.click(screen.getByRole('button', { name: 'Clear activity' }));
    await waitFor(() => expect(screen.getAllByText('clear exploded').length).toBe(2));
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByRole('button', { name: 'Clear activity' })).toBeInTheDocument();
  });

  it('renders an unparseable timestamp and a missing detail verbatim', async () => {
    vi.mocked(tauri.getAuditLog).mockResolvedValue([
      makeAuditEntry({ timestamp: 'not-a-date', itemName: 'odd', details: null }),
    ]);
    renderWithProviders(<AuditLog />);
    await waitFor(() => expect(screen.getByText('odd')).toBeInTheDocument());
    expect(screen.getByText('not-a-date')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
