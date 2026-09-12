import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listKeys } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import { renderWithProviders } from '../../test/utils';
import type { KeyItem } from '../../types';
import { KeyDetails } from './KeyDetails';
import { KeysList } from './KeysList';

vi.mock('../../services/tauri', () => ({ listKeys: vi.fn() }));

const initialState = useAppStore.getState();

const makeKey = (overrides: Partial<KeyItem> = {}): KeyItem => ({
  id: 'https://vault.vault.azure.net/keys/signing-key/abc123',
  name: 'signing-key',
  enabled: true,
  created: '2026-01-01T10:00:00Z',
  updated: '2026-02-01T10:00:00Z',
  expires: null,
  notBefore: null,
  keyType: 'RSA',
  keyOps: ['sign', 'verify'],
  tags: null,
  managed: null,
  ...overrides,
});

beforeEach(() => {
  useAppStore.setState(initialState, true);
  useAppStore.setState({ selectedVaultUri: 'https://vault/', selectedVaultName: 'vault' });
  vi.mocked(listKeys).mockReset();
});

describe('KeysList', () => {
  it('renders a row per key with its type and operations', async () => {
    vi.mocked(listKeys).mockResolvedValue([
      makeKey(),
      makeKey({ id: 'k2', name: 'wrapping-key', keyType: 'EC', keyOps: ['wrapKey'] }),
    ]);
    renderWithProviders(<KeysList />);

    expect(await screen.findByText('signing-key')).toBeInTheDocument();
    expect(screen.getByText('wrapping-key')).toBeInTheDocument();
    expect(screen.getByText('RSA')).toBeInTheDocument();
    expect(screen.getByText('sign')).toBeInTheDocument();
    expect(screen.getByText('wrapKey')).toBeInTheDocument();
  });

  it('filters by name and offers a way back', async () => {
    vi.mocked(listKeys).mockResolvedValue([makeKey(), makeKey({ id: 'k2', name: 'wrapping-key' })]);
    renderWithProviders(<KeysList />);
    await screen.findByText('signing-key');

    await userEvent.type(screen.getByRole('searchbox', { name: 'Filter keys' }), 'wrap');
    expect(screen.queryByText('signing-key')).not.toBeInTheDocument();

    await userEvent.clear(screen.getByRole('searchbox', { name: 'Filter keys' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Filter keys' }), 'zzz');
    expect(screen.getByText('No matches')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(await screen.findByText('signing-key')).toBeInTheDocument();
  });

  it('shows an empty state for a vault with no keys', async () => {
    vi.mocked(listKeys).mockResolvedValue([]);
    renderWithProviders(<KeysList />);
    expect(await screen.findByText('No keys yet')).toBeInTheDocument();
  });

  it('surfaces a load failure with a retry', async () => {
    vi.mocked(listKeys).mockRejectedValue(new Error('403 Forbidden'));
    renderWithProviders(<KeysList />);
    expect(await screen.findByText('Access denied')).toBeInTheDocument();
  });

  it('opens the detail pane for the clicked key', async () => {
    vi.mocked(listKeys).mockResolvedValue([makeKey()]);
    renderWithProviders(<KeysList />);
    await userEvent.click(await screen.findByText('signing-key'));
    expect(await screen.findByText('abc123')).toBeInTheDocument();
  });
});

describe('KeyDetails', () => {
  it('prompts for a selection when nothing is selected', () => {
    renderWithProviders(<KeyDetails item={null} onClose={vi.fn()} />);
    expect(screen.getByText('No key selected')).toBeInTheDocument();
  });

  it('shows the version parsed from the key id and the never-expires case', () => {
    renderWithProviders(<KeyDetails item={makeKey()} onClose={vi.fn()} />);
    expect(screen.getByText('abc123')).toBeInTheDocument();
    expect(screen.getByText('Never')).toBeInTheDocument();
  });

  it('falls back when the id has no version segment', () => {
    renderWithProviders(<KeyDetails item={makeKey({ id: 'not-a-key-url' })} onClose={vi.fn()} />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('closes from the detail header', async () => {
    const onClose = vi.fn();
    renderWithProviders(<KeyDetails item={makeKey()} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
