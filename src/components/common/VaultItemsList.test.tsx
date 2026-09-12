import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../stores/appStore';
import { renderWithProviders } from '../../test/utils';
import type { KeyItem } from '../../types';
import type { Column } from './ItemTable';
import { renderName } from './ItemTable';
import { VaultItemsList } from './VaultItemsList';

const initialState = useAppStore.getState();

const makeKey = (id: string, name: string): KeyItem => ({
  id,
  name,
  enabled: true,
  created: '2026-01-01T00:00:00Z',
  updated: '2026-01-01T00:00:00Z',
  expires: null,
  notBefore: null,
  keyType: 'RSA',
  keyOps: [],
  tags: null,
  managed: null,
});

const columns: Column<KeyItem>[] = [
  { key: 'name', label: 'Name', sortValue: (item) => item.name, render: renderName },
];

const items = [makeKey('1', 'alpha'), makeKey('2', 'beta'), makeKey('3', 'gamma')];

function setup(fetchItems = vi.fn().mockResolvedValue(items)) {
  const result = renderWithProviders(
    <VaultItemsList<KeyItem>
      title="Keys"
      noun="keys"
      tab="keys"
      queryKey="keys"
      fetchItems={fetchItems}
      columns={columns}
      renderDetails={(item) => <div>{item ? `detail:${item.name}` : 'no selection'}</div>}
    />,
  );
  return { ...result, fetchItems };
}

beforeEach(() => {
  useAppStore.setState(initialState, true);
  useAppStore.setState({ selectedVaultUri: 'https://vault/', selectedVaultName: 'vault' });
});

describe('VaultItemsList view state', () => {
  it('keeps the filter, sort and selection in the store so a tab switch does not lose them', async () => {
    const { unmount } = setup();
    await screen.findByText('alpha');

    await userEvent.type(screen.getByRole('searchbox', { name: 'Filter keys' }), 'a');
    await userEvent.click(screen.getByRole('button', { name: /Name/ }));
    await userEvent.click(screen.getByText('alpha'));
    await screen.findByText('detail:alpha');

    // Leaving the tab unmounts the view, exactly as MainContent does.
    unmount();
    const view = useAppStore.getState().listViews.keys;
    expect(view).toMatchObject({ filter: 'a', sortKey: 'name', selectedId: '1' });

    setup();
    expect(await screen.findByText('detail:alpha')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Filter keys' })).toHaveValue('a');
  });

  it('drops that state when a different vault is selected', async () => {
    setup();
    await screen.findByText('alpha');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Filter keys' }), 'alp');
    await userEvent.click(screen.getByText('alpha'));

    useAppStore.getState().selectVault('other-vault', 'https://other/');

    const view = useAppStore.getState().listViews.keys;
    expect(view.filter).toBe('');
    expect(view.selectedId).toBeNull();
    await waitFor(() => expect(screen.getByText('no selection')).toBeInTheDocument());
  });

  it('resets paging when the filter changes', async () => {
    setup();
    await screen.findByText('alpha');
    useAppStore.getState().setListView('keys', { visibleCount: 500 });

    await userEvent.type(screen.getByRole('searchbox', { name: 'Filter keys' }), 'b');

    expect(useAppStore.getState().listViews.keys.visibleCount).toBe(50);
  });
});
