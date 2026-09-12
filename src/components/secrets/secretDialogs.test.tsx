import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as tauri from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import { makeSecret } from '../../test/fixtures';
import type { CreateSecretRequest } from '../../types';
import { CreateSecretDialog } from './CreateSecretDialog';
import { DeleteByPrefixDialog } from './DeleteByPrefixDialog';
import { ImportSecretsDialog, type PendingImport } from './ImportSecretsDialog';
import { RevealSecretValue } from './RevealSecretValue';
import { SecretDetails } from './SecretDetails';

vi.mock('../../services/tauri', () => ({
  setSecret: vi.fn(),
  deleteSecret: vi.fn(),
  purgeSecret: vi.fn(),
  getSecretValue: vi.fn(),
}));

const initialState = useAppStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState(initialState, true);
  vi.mocked(tauri.setSecret).mockResolvedValue(makeSecret());
  vi.mocked(tauri.deleteSecret).mockResolvedValue(undefined);
  vi.mocked(tauri.purgeSecret).mockResolvedValue(undefined);
  vi.mocked(tauri.getSecretValue).mockResolvedValue({
    value: 'super-secret',
    id: 'id',
    name: 'alpha',
  });
});

describe('CreateSecretDialog', () => {
  const setup = (props: Partial<React.ComponentProps<typeof CreateSecretDialog>> = {}) => {
    const onClose = vi.fn();
    const onCreated = vi.fn();
    render(
      <CreateSecretDialog
        open
        vaultUri="https://v/"
        onClose={onClose}
        onCreated={onCreated}
        {...props}
      />,
    );
    return { onClose, onCreated };
  };

  it('rejects an empty name', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByText('Name is required.')).toBeInTheDocument();
    expect(tauri.setSecret).not.toHaveBeenCalled();
  });

  it('rejects an empty value', async () => {
    setup();
    await userEvent.type(screen.getByPlaceholderText('my-secret-name'), 'alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByText('Value is required.')).toBeInTheDocument();
  });

  it('rejects names with unsupported characters', async () => {
    setup();
    await userEvent.type(screen.getByPlaceholderText('my-secret-name'), 'not ok!');
    await userEvent.type(screen.getByPlaceholderText('Secret value…'), 'v');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(
      screen.getByText('Name may only contain letters, numbers, and dashes.'),
    ).toBeInTheDocument();
  });

  it('creates a secret with content type, tags and expiration', async () => {
    const { onCreated, onClose } = setup();
    await userEvent.type(screen.getByPlaceholderText('my-secret-name'), 'alpha');
    await userEvent.type(screen.getByPlaceholderText('Secret value…'), 'hunter2');
    await userEvent.type(screen.getByPlaceholderText('text/plain'), 'application/json');
    await userEvent.type(screen.getByPlaceholderText('env=prod, team=backend'), 'env=prod, bad,=x');
    await userEvent.click(screen.getByRole('switch', { name: 'Set expiration' }));
    const expiry = screen.getByDisplayValue('') as HTMLInputElement;
    expect(expiry).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    const request = vi.mocked(tauri.setSecret).mock.calls[0][1] as CreateSecretRequest;
    expect(request).toMatchObject({
      name: 'alpha',
      value: 'hunter2',
      contentType: 'application/json',
      enabled: true,
      tags: { env: 'prod' },
      notBefore: null,
      expires: null,
    });
  });

  it('sends an ISO expiry when a date is picked', async () => {
    setup();
    await userEvent.type(screen.getByPlaceholderText('my-secret-name'), 'alpha');
    await userEvent.type(screen.getByPlaceholderText('Secret value…'), 'v');
    await userEvent.click(screen.getByRole('switch', { name: 'Set expiration' }));
    const expiryInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(expiryInput, { target: { value: '2030-01-02T03:04' } });
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(tauri.setSecret).toHaveBeenCalled());
    const request = vi.mocked(tauri.setSecret).mock.calls[0][1] as CreateSecretRequest;
    expect(request.expires).toBe(new Date('2030-01-02T03:04').toISOString());
  });

  it('surfaces backend failures', async () => {
    vi.mocked(tauri.setSecret).mockRejectedValue(new Error('vault is busy'));
    const { onCreated } = setup();
    await userEvent.type(screen.getByPlaceholderText('my-secret-name'), 'alpha');
    await userEvent.type(screen.getByPlaceholderText('Secret value…'), 'v');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.getByText(/vault is busy/)).toBeInTheDocument());
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('prefills and locks the name in edit mode', async () => {
    setup({
      mode: 'edit',
      initialName: 'alpha',
      initialContentType: 'text/plain',
      initialEnabled: false,
      initialExpires: '2030-05-06T07:08:00.000Z',
      initialTags: { env: 'prod' },
    });
    expect(screen.getByRole('heading', { name: 'Edit secret' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('alpha')).toBeDisabled();
    expect(screen.getByDisplayValue('env=prod')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Set expiration' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Value is required when updating a secret.')).toBeInTheDocument();
  });

  it('ignores an unparseable initial expiry', () => {
    setup({ mode: 'edit', initialName: 'alpha', initialExpires: 'nonsense' });
    expect(screen.getByRole('switch', { name: 'Set expiration' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('cancels', async () => {
    const { onClose } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('DeleteByPrefixDialog', () => {
  const secrets = [
    makeSecret({ id: '1', name: 'staging-a' }),
    makeSecret({ id: '2', name: 'staging-b' }),
    makeSecret({ id: '3', name: 'prod-a' }),
  ];
  const setup = (onDelete = vi.fn().mockResolvedValue(undefined)) => {
    const onClose = vi.fn();
    const onCompleted = vi.fn();
    render(
      <DeleteByPrefixDialog
        open
        allSecrets={secrets}
        vaultUri="https://v/"
        onDelete={onDelete}
        onClose={onClose}
        onCompleted={onCompleted}
      />,
    );
    return { onDelete, onClose, onCompleted };
  };

  it('counts and lists the matching secrets', async () => {
    setup();
    expect(screen.getByRole('button', { name: /Delete 0 Secrets/ })).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText('staging-'), 'staging-');
    expect(screen.getByText('staging-a')).toBeInTheDocument();
    expect(screen.queryByText('prod-a')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete 2 Secrets' })).toBeDisabled();
  });

  it('reports when a prefix matches nothing', async () => {
    setup();
    await userEvent.type(screen.getByPlaceholderText('staging-'), 'zzz');
    expect(screen.getByText('No secrets match this prefix.')).toBeInTheDocument();
  });

  it('deletes every match once the confirmation is typed', async () => {
    const { onDelete, onCompleted, onClose } = setup();
    await userEvent.type(screen.getByPlaceholderText('staging-'), 'staging-a');
    await userEvent.type(screen.getByPlaceholderText('delete'), 'delete');
    const confirm = screen.getByRole('button', { name: 'Delete 1 Secret' });
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await waitFor(() => expect(onCompleted).toHaveBeenCalledWith(['1']));
    expect(onDelete).toHaveBeenCalledWith('staging-a');
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the dialog open and explains partial failures', async () => {
    const onDelete = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('denied'));
    const { onCompleted, onClose } = setup(onDelete);
    await userEvent.type(screen.getByPlaceholderText('staging-'), 'staging-');
    await userEvent.type(screen.getByPlaceholderText('delete'), 'delete');
    await userEvent.click(screen.getByRole('button', { name: 'Delete 2 Secrets' }));
    await waitFor(() =>
      expect(
        screen.getByText('1 secret(s) failed to delete. Check permissions.'),
      ).toBeInTheDocument(),
    );
    expect(onCompleted).toHaveBeenCalledWith(['1']);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('resets when it closes', async () => {
    const { rerender } = render(
      <DeleteByPrefixDialog
        open
        allSecrets={secrets}
        vaultUri="https://v/"
        onDelete={vi.fn()}
        onClose={vi.fn()}
        onCompleted={vi.fn()}
      />,
    );
    await userEvent.type(screen.getByPlaceholderText('staging-'), 'staging-');
    rerender(
      <DeleteByPrefixDialog
        open={false}
        allSecrets={secrets}
        vaultUri="https://v/"
        onDelete={vi.fn()}
        onClose={vi.fn()}
        onCompleted={vi.fn()}
      />,
    );
    rerender(
      <DeleteByPrefixDialog
        open
        allSecrets={secrets}
        vaultUri="https://v/"
        onDelete={vi.fn()}
        onClose={vi.fn()}
        onCompleted={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText('staging-')).toHaveValue('');
  });
});

describe('ImportSecretsDialog', () => {
  const request = (name: string): CreateSecretRequest => ({
    name,
    value: 'v',
    contentType: null,
    enabled: true,
    expires: null,
    notBefore: null,
    tags: null,
  });
  const pending: PendingImport = {
    fileName: 'secrets.json',
    fileSizeBytes: 2048,
    requests: [request('alpha'), request('beta')],
    duplicateNamesInFile: [],
    existingSecretNames: [],
  };

  it('summarises the file and confirms', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ImportSecretsDialog
        pending={pending}
        open
        loading={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByText('secrets.json')).toBeInTheDocument();
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
    expect(screen.getByText('alpha')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Import secrets' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('formats byte and megabyte file sizes', () => {
    const { rerender } = render(
      <ImportSecretsDialog
        pending={{ ...pending, fileSizeBytes: 512 }}
        open
        loading={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText('512 B')).toBeInTheDocument();
    rerender(
      <ImportSecretsDialog
        pending={{ ...pending, fileSizeBytes: 3 * 1024 * 1024 }}
        open
        loading={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText('3.0 MB')).toBeInTheDocument();
  });

  it('warns about duplicates and about secrets that will get a new version', () => {
    render(
      <ImportSecretsDialog
        pending={{
          ...pending,
          duplicateNamesInFile: ['alpha'],
          existingSecretNames: ['a', 'b', 'c', 'd', 'e', 'f'],
        }}
        open
        loading={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText('Duplicate names: alpha')).toBeInTheDocument();
    expect(screen.getByText(/\(\+1 more\)/)).toBeInTheDocument();
  });

  it('truncates a long import list', () => {
    render(
      <ImportSecretsDialog
        pending={{
          ...pending,
          requests: Array.from({ length: 35 }, (_, index) => request(`secret-${index}`)),
        }}
        open
        loading={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText('+5 more')).toBeInTheDocument();
    expect(screen.queryByText('secret-30')).not.toBeInTheDocument();
  });

  it('renders an empty shell without a pending file', () => {
    render(
      <ImportSecretsDialog
        pending={null}
        open
        loading={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Import secrets' })).toBeInTheDocument();
    expect(screen.queryByText('Secrets to import')).not.toBeInTheDocument();
  });
});

describe('RevealSecretValue', () => {
  const renderReveal = () => render(<RevealSecretValue secretName="alpha" vaultUri="https://v/" />); // pragma: allowlist secret

  const fetchValue = async () => {
    await userEvent.click(screen.getByRole('button', { name: /Fetch value/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Fetch' }));
  };

  it('fetches on confirmation and masks the value until revealed', async () => {
    renderReveal();
    await fetchValue();
    await waitFor(() => expect(screen.getByDisplayValue('super-secret')).toBeInTheDocument());
    const field = screen.getByDisplayValue('super-secret');
    expect(field).toHaveAttribute('type', 'password');

    await userEvent.click(screen.getByTitle('Reveal'));
    expect(screen.getByDisplayValue('super-secret')).toHaveAttribute('type', 'text');
    expect(screen.getByText(/Auto-hide in/)).toBeInTheDocument();

    await userEvent.click(screen.getByTitle('Hide'));
    expect(screen.getByDisplayValue('super-secret')).toHaveAttribute('type', 'password');
  });

  it('requires an explicit confirmation when the setting is on', async () => {
    useAppStore.setState({ requireReauthForReveal: true });
    renderReveal();
    await userEvent.click(screen.getByRole('button', { name: /Fetch value/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Fetch' }));
    expect(tauri.getSecretValue).not.toHaveBeenCalled();
    expect(
      screen.getByText('Confirmation required before fetching secret value.'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Confirm that you intend to fetch/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Fetch' }));
    await waitFor(() => expect(tauri.getSecretValue).toHaveBeenCalledWith('https://v/', 'alpha'));
  });

  it('copies the value and warns that the clipboard will be cleared', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    renderReveal();
    await fetchValue();
    await waitFor(() => expect(screen.getByTitle('Copy')).toBeInTheDocument());
    await userEvent.click(screen.getByTitle('Copy'));
    expect(writeText).toHaveBeenCalledWith('super-secret');
    expect(screen.getByText(/Clipboard clears in 30s/)).toBeInTheDocument();
  });

  it('hides the copy button when copying is disabled', async () => {
    useAppStore.setState({ disableClipboardCopy: true });
    renderReveal();
    await fetchValue();
    await waitFor(() => expect(screen.getByDisplayValue('super-secret')).toBeInTheDocument());
    expect(screen.queryByTitle('Copy')).not.toBeInTheDocument();
  });

  it('clears the fetched value', async () => {
    renderReveal();
    await fetchValue();
    await waitFor(() => expect(screen.getByDisplayValue('super-secret')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByRole('button', { name: /Fetch value/ })).toBeInTheDocument();
  });

  it('reports a failed fetch', async () => {
    vi.mocked(tauri.getSecretValue).mockRejectedValue(new Error('403 denied'));
    renderReveal();
    await fetchValue();
    await waitFor(() => expect(screen.getByText(/403 denied/)).toBeInTheDocument());
  });

  it('can be dismissed without fetching', async () => {
    renderReveal();
    await userEvent.click(screen.getByRole('button', { name: /Fetch value/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(tauri.getSecretValue).not.toHaveBeenCalled();
  });
});

// The clipboard wipe is the only thing that gets a copied secret off the
// system pasteboard, so it is driven with fake timers rather than left to a
// label assertion.
describe('RevealSecretValue clipboard auto-clear', () => {
  const CLEAR_MS = 30_000;

  /** A stand-in pasteboard so the test can see what the component wrote. */
  const stubClipboard = (initial = 'something-the-user-had') => {
    const board = { text: initial };
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockImplementation(async (text: string) => {
        board.text = text;
      });
    const readText = vi
      .spyOn(navigator.clipboard, 'readText')
      .mockImplementation(async () => board.text);
    return { board, writeText, readText };
  };

  /**
   * Fetches the value and copies it, switching to fake timers only for the
   * click itself: the wipe timer must be a fake one, but `waitFor` and
   * `userEvent` need the real clock up to that point.
   */
  const fetchAndCopy = async () => {
    const view = render(<RevealSecretValue secretName="alpha" vaultUri="https://v/" />);
    await userEvent.click(screen.getByRole('button', { name: /Fetch value/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Fetch' }));
    await waitFor(() => expect(screen.getByTitle('Copy')).toBeInTheDocument());

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await act(async () => {
      fireEvent.click(screen.getByTitle('Copy'));
    });
    return view;
  };

  /** Advances `ms` and lets the read-then-write promise chain settle. */
  const advance = async (ms: number) => {
    await act(async () => {
      vi.advanceTimersByTime(ms);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it('wipes the clipboard once the configured delay has passed', async () => {
    const { board, writeText } = stubClipboard();
    await fetchAndCopy();

    expect(board.text).toBe('super-secret');
    expect(screen.getByText(/Clipboard clears in 30s/)).toBeInTheDocument();

    // One second short of the deadline the secret is still on the clipboard.
    await advance(CLEAR_MS - 1000);
    expect(board.text).toBe('super-secret');

    await advance(1000);

    expect(board.text).toBe('');
    expect(writeText).toHaveBeenLastCalledWith('');
    expect(screen.queryByText(/Clipboard clears in/)).not.toBeInTheDocument();
  });

  it('honours a shorter clipboardClearSeconds setting', async () => {
    useAppStore.setState({ clipboardClearSeconds: 5 });
    const { board } = stubClipboard();
    await fetchAndCopy();

    expect(screen.getByText(/Clipboard clears in 5s/)).toBeInTheDocument();
    await advance(5000);
    expect(board.text).toBe('');
  });

  it('leaves the clipboard alone when the user has copied something else', async () => {
    const { board, writeText } = stubClipboard();
    await fetchAndCopy();
    expect(board.text).toBe('super-secret');

    // The user copies an unrelated snippet while the wipe is pending.
    board.text = 'a shopping list';

    await advance(CLEAR_MS);

    expect(board.text).toBe('a shopping list');
    expect(writeText).not.toHaveBeenCalledWith('');
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it('does not fire a pending wipe after the component is unmounted', async () => {
    const { board, writeText, readText } = stubClipboard();
    const view = await fetchAndCopy();
    expect(board.text).toBe('super-secret');

    view.unmount();
    await advance(CLEAR_MS);

    // Neither a clipboard read nor a write may happen after unmount: the timer
    // was cancelled, so the pasteboard is untouched (and no state update leaks).
    expect(readText).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(board.text).toBe('super-secret');
  });
});

describe('SecretDetails', () => {
  const setup = (item = makeSecret()) => {
    const onClose = vi.fn();
    const onRefresh = vi.fn();
    render(
      <SecretDetails item={item} vaultUri="https://v/" onClose={onClose} onRefresh={onRefresh} />,
    );
    return { onClose, onRefresh };
  };

  it('prompts for a selection when nothing is selected', () => {
    render(
      <SecretDetails item={null} vaultUri="https://v/" onClose={vi.fn()} onRefresh={vi.fn()} />,
    );
    expect(screen.getByRole('heading', { name: 'No secret selected' })).toBeInTheDocument();
  });

  it('shows metadata, badges and closes', async () => {
    const { onClose } = setup(
      makeSecret({
        enabled: false,
        managed: true,
        expires: '2000-01-01T00:00:00Z',
        tags: { env: 'prod' },
      }),
    );
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    expect(screen.getByText('Managed')).toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.getByText('env=prod')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close details' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders placeholders for missing metadata', () => {
    setup(makeSecret({ contentType: null, created: null, updated: null, notBefore: null }));
    expect(screen.getByText('Never')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('deletes after confirmation and refreshes the list', async () => {
    const { onRefresh, onClose } = setup();
    await userEvent.click(screen.getByRole('button', { name: /^Delete$/ }));
    await userEvent.type(screen.getByPlaceholderText('delete'), 'delete');
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1]);
    await waitFor(() => expect(tauri.deleteSecret).toHaveBeenCalledWith('https://v/', 'alpha'));
    expect(onRefresh).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('purges after the critical confirmation', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Purge permanently' }));
    expect(screen.getByText('This action is irreversible.')).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText('purge'), 'purge');
    await userEvent.click(screen.getAllByRole('button', { name: 'Purge permanently' })[1]);
    await waitFor(() => expect(tauri.purgeSecret).toHaveBeenCalledWith('https://v/', 'alpha'));
  });

  it('surfaces a failed delete', async () => {
    vi.mocked(tauri.deleteSecret).mockRejectedValue(new Error('409 conflict'));
    const { onClose } = setup();
    await userEvent.click(screen.getByRole('button', { name: /^Delete$/ }));
    await userEvent.type(screen.getByPlaceholderText('delete'), 'delete');
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1]);
    await waitFor(() => expect(screen.getByText(/409 conflict/)).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('opens the edit dialog prefilled', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('heading', { name: 'Edit secret' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('alpha')).toBeDisabled();
  });
});
