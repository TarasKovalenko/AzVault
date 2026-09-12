import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as tauri from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import { makeSecret } from '../../test/fixtures';
import { renderWithProviders } from '../../test/utils';
import { SecretsList } from './SecretsList';

vi.mock('../../services/tauri', () => ({
  listSecrets: vi.fn(),
  setSecret: vi.fn(),
  deleteSecret: vi.fn(),
  purgeSecret: vi.fn(),
  getSecretValue: vi.fn(),
  exportItems: vi.fn(),
  saveExport: vi.fn(),
}));

const initialState = useAppStore.getState();
const secrets = [
  makeSecret({ id: '1', name: 'alpha' }),
  makeSecret({ id: '2', name: 'beta', contentType: null, tags: { env: 'prod' } }),
];

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState(initialState, true);
  useAppStore.setState({
    selectedVaultUri: 'https://v/',
    selectedVaultName: 'my-vault',
    detailPanelOpen: false,
  });
  vi.mocked(tauri.listSecrets).mockResolvedValue(secrets);
  vi.mocked(tauri.deleteSecret).mockResolvedValue(undefined);
  vi.mocked(tauri.setSecret).mockResolvedValue(makeSecret());
  vi.mocked(tauri.exportItems).mockResolvedValue('exported');
  vi.mocked(tauri.saveExport).mockResolvedValue('/Users/op/Downloads/azvault-secrets-1.csv');
});

const renderList = () => renderWithProviders(<SecretsList />);
const rowsReady = () => waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument());

describe('SecretsList', () => {
  it('shows a skeleton, then the secrets', async () => {
    renderList();
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
    await rowsReady();
    expect(tauri.listSecrets).toHaveBeenCalledWith('https://v/');
    expect(screen.getByText('beta')).toBeInTheDocument();
  });

  it('offers a retry when the listing fails', async () => {
    vi.mocked(tauri.listSecrets).mockRejectedValueOnce(new Error('403 denied'));
    renderList();
    await waitFor(() => expect(screen.getByText('Access denied')).toBeInTheDocument());
  });

  it('invites the first secret when the vault is empty', async () => {
    vi.mocked(tauri.listSecrets).mockResolvedValue([]);
    renderList();
    await waitFor(() => expect(screen.getByText('No secrets yet')).toBeInTheDocument());
    await userEvent.click(screen.getAllByRole('button', { name: 'New secret' })[1]);
    expect(screen.getByRole('heading', { name: 'Create secret' })).toBeInTheDocument();
  });

  it('filters by name and offers a way back', async () => {
    renderList();
    await rowsReady();
    await userEvent.type(screen.getByLabelText('Filter secrets'), 'alph');
    expect(screen.queryByText('beta')).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Filter secrets'));
    await userEvent.type(screen.getByLabelText('Filter secrets'), 'zzz');
    expect(screen.getByText('No matches')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(screen.getByText('alpha')).toBeInTheDocument();
  });

  it('sorts by a column header', async () => {
    renderList();
    await rowsReady();
    await userEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    const [firstRow] = screen.getAllByRole('row').slice(1);
    expect(within(firstRow).getByText('alpha')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Name/ }));
    const [firstAfter] = screen.getAllByRole('row').slice(1);
    expect(within(firstAfter).getByText('beta')).toBeInTheDocument();
  });

  it('bulk-deletes the checked secrets', async () => {
    renderList();
    await rowsReady();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select row 1' }));
    expect(screen.getByText('1 of 2 selected')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
    expect(screen.getByRole('heading', { name: 'Delete 1 secret' })).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText('delete'), 'delete');
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete selected' })[1]);
    await waitFor(() => expect(tauri.deleteSecret).toHaveBeenCalledWith('https://v/', 'alpha'));
  });

  it('reports a bulk delete that partly fails', async () => {
    vi.mocked(tauri.deleteSecret).mockRejectedValue(new Error('denied'));
    renderList();
    await rowsReady();
    await userEvent.click(
      screen.getByRole('checkbox', { name: /Select all \d+ matching secrets/ }),
    );
    expect(screen.getByText('2 of 2 selected')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
    await userEvent.type(screen.getByPlaceholderText('delete'), 'delete');
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete selected' })[1]);
    await waitFor(() =>
      expect(screen.getByText('2 secret(s) failed to delete.')).toBeInTheDocument(),
    );
  });

  it('clears the selection from the selection bar', async () => {
    renderList();
    await rowsReady();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select row 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.queryByText('1 of 2 selected')).not.toBeInTheDocument();
  });

  it('exports the filtered metadata', async () => {
    renderList();
    await rowsReady();
    await userEvent.click(screen.getByRole('button', { name: 'More secret actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Export metadata as CSV' }));
    await waitFor(() => expect(tauri.exportItems).toHaveBeenCalled());
    const [payload, format] = vi.mocked(tauri.exportItems).mock.calls[0];
    expect(format).toBe('csv');
    expect(JSON.parse(payload)).toHaveLength(2);
    await waitFor(() => expect(screen.getByText('CSV saved')).toBeInTheDocument());
    // The toast names the file the backend actually wrote.
    expect(screen.getByText('/Users/op/Downloads/azvault-secrets-1.csv')).toBeInTheDocument();
  });

  it('reviews an import file before writing anything', async () => {
    renderList();
    await rowsReady();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(
      [
        JSON.stringify([
          { name: 'alpha', value: 'x' },
          { name: 'gamma', value: 'y' },
        ]),
      ],
      'import.json',
      { type: 'application/json' },
    );
    await userEvent.upload(input, file);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Import secrets' })).toBeInTheDocument(),
    );
    expect(screen.getByText('import.json')).toBeInTheDocument();
    expect(screen.getByText(/New versions will be created for: alpha/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Import secrets' }));
    await waitFor(() => expect(tauri.setSecret).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('Import complete')).toBeInTheDocument());
  });

  it('rejects a malformed import file', async () => {
    renderList();
    await rowsReady();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(['not json'], 'bad.json', { type: 'application/json' }));
    await waitFor(() => expect(screen.getByText('Import failed')).toBeInTheDocument());
    expect(tauri.setSecret).not.toHaveBeenCalled();
  });

  it('reports partly failed imports', async () => {
    vi.mocked(tauri.setSecret).mockRejectedValue(new Error('denied'));
    renderList();
    await rowsReady();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(
      input,
      new File([JSON.stringify([{ name: 'gamma', value: 'y' }])], 'import.json', {
        type: 'application/json',
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Import secrets' })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Import secrets' }));
    await waitFor(() => expect(screen.getByText('Imported 0/1')).toBeInTheDocument());
  });

  it('responds to the global command events', async () => {
    renderList();
    await rowsReady();

    act(() => {
      window.dispatchEvent(new CustomEvent('azv:new-secret'));
    });
    expect(screen.getByRole('heading', { name: 'Create secret' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    act(() => {
      window.dispatchEvent(new CustomEvent('azv:select-all'));
    });
    expect(screen.getByText('2 of 2 selected')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new CustomEvent('azv:delete-selected'));
    });
    expect(screen.getByRole('heading', { name: 'Delete 2 secrets' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    act(() => {
      window.dispatchEvent(new CustomEvent('azv:deselect-all'));
    });
    expect(screen.queryByText('2 of 2 selected')).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new CustomEvent('azv:delete-by-prefix'));
    });
    expect(screen.getByRole('heading', { name: 'Delete Secrets by Prefix' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    act(() => {
      window.dispatchEvent(new CustomEvent('azv:focus-search'));
    });
    expect(screen.getByLabelText('Filter secrets')).toHaveFocus();

    act(() => {
      window.dispatchEvent(new CustomEvent('azv:export', { detail: 'json' }));
    });
    await waitFor(() => expect(tauri.exportItems).toHaveBeenCalledWith(expect.any(String), 'json'));
  });

  it('ignores an export event with an unknown format', async () => {
    renderList();
    await rowsReady();
    act(() => {
      window.dispatchEvent(new CustomEvent('azv:export', { detail: 'xml' }));
    });
    expect(tauri.exportItems).not.toHaveBeenCalled();
  });

  it('opens the details pane for the clicked secret', async () => {
    useAppStore.setState({ detailPanelOpen: true });
    renderList();
    await rowsReady();
    await userEvent.click(screen.getByText('alpha'));
    expect(screen.getByRole('heading', { name: 'alpha' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close details' }));
    expect(screen.getByRole('heading', { name: 'No secret selected' })).toBeInTheDocument();
  });
});
