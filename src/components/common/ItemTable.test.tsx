import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Column } from './ItemTable';
import {
  ItemTable,
  renderDate,
  renderEnabled,
  renderExpiry,
  renderName,
  renderTags,
} from './ItemTable';

interface Row {
  id: string;
  name: string;
  size: number;
}

const rows: Row[] = [
  { id: '1', name: 'alpha', size: 3 },
  { id: '2', name: 'beta', size: 1 },
];

const columns: Column<Row>[] = [
  { key: 'name', label: 'Name', sortValue: (row) => row.name, render: (row) => row.name },
  { key: 'size', label: 'Size', render: (row) => String(row.size) },
];

const setup = (props: Partial<React.ComponentProps<typeof ItemTable<Row>>> = {}) =>
  render(<ItemTable items={rows} columns={columns} getItemId={(row) => row.id} {...props} />);

describe('ItemTable', () => {
  it('renders one row per item with a numbered first cell', () => {
    setup();
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + 2
    expect(screen.getByText('alpha')).toBeInTheDocument();
    const rowNumbers = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.querySelectorAll('td')[0]?.textContent);
    expect(rowNumbers).toEqual(['1', '2']);
  });

  it('shows a spinner while loading', () => {
    setup({ loading: true });
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the empty message when there are no items', () => {
    setup({ items: [], emptyMessage: 'Nothing here' });
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('falls back to a default empty message', () => {
    setup({ items: [] });
    expect(screen.getByText('No items found')).toBeInTheDocument();
  });

  it('selects a row on click and marks it selected', async () => {
    const onSelect = vi.fn();
    setup({ onSelect, selectedId: '2' });
    await userEvent.click(screen.getByText('alpha'));
    expect(onSelect).toHaveBeenCalledWith(rows[0]);
    const selected = screen.getByText('beta').closest('tr');
    expect(selected).toHaveAttribute('aria-selected', 'true');
  });

  it('selects a row with Enter and with Space', async () => {
    const onSelect = vi.fn();
    setup({ onSelect });
    const firstRow = screen.getByText('alpha').closest('tr') as HTMLElement;
    firstRow.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('walks rows with the arrow keys', async () => {
    setup({ onSelect: vi.fn() });
    const [first, second] = screen.getAllByRole('row').slice(1);
    first.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(second).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(first).toHaveFocus();
    // Moving past the ends keeps focus where it is.
    await userEvent.keyboard('{ArrowUp}');
    expect(first).toHaveFocus();
  });

  it('leaves rows unfocusable when rows are not selectable', () => {
    setup();
    const row = screen.getByText('alpha').closest('tr') as HTMLElement;
    expect(row).not.toHaveAttribute('tabindex');
    expect(row).not.toHaveAttribute('aria-selected');
  });

  it('exposes sorting state through aria-sort and the sort button', async () => {
    const onSort = vi.fn();
    const { rerender } = render(
      <ItemTable
        items={rows}
        columns={columns}
        getItemId={(row) => row.id}
        sort={null}
        onSort={onSort}
      />,
    );
    const nameHeader = screen.getByRole('columnheader', { name: /Name/ });
    expect(nameHeader).toHaveAttribute('aria-sort', 'none');
    expect(screen.getByRole('columnheader', { name: 'Size' })).not.toHaveAttribute('aria-sort');

    await userEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(onSort).toHaveBeenCalledWith('name');

    rerender(
      <ItemTable
        items={rows}
        columns={columns}
        getItemId={(row) => row.id}
        sort={{ key: 'name', direction: 'asc' }}
        onSort={onSort}
      />,
    );
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );

    rerender(
      <ItemTable
        items={rows}
        columns={columns}
        getItemId={(row) => row.id}
        sort={{ key: 'name', direction: 'desc' }}
        onSort={onSort}
      />,
    );
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  });

  it('does not offer sorting when no onSort handler is given', () => {
    setup({ sort: { key: 'name', direction: 'asc' } });
    expect(screen.queryByRole('button', { name: /Name/ })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Name' })).not.toHaveAttribute('aria-sort');
  });

  it('toggles a single row checkbox without selecting the row', async () => {
    const onToggleSelect = vi.fn();
    const onSelect = vi.fn();
    setup({ selectable: true, selectedIds: new Set(['1']), onToggleSelect, onSelect });
    const rowCheckbox = screen.getByRole('checkbox', { name: 'Select row 1' });
    expect(rowCheckbox).toBeChecked();
    await userEvent.click(rowCheckbox);
    expect(onToggleSelect).toHaveBeenCalledWith('1', false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('reflects the select-all state, including indeterminate', async () => {
    const onToggleSelectAll = vi.fn();
    const { rerender } = render(
      <ItemTable
        items={rows}
        columns={columns}
        getItemId={(row) => row.id}
        selectable
        selectedIds={new Set(['1'])}
        selectAllState="mixed"
        onToggleSelectAll={onToggleSelectAll}
      />,
    );
    const selectAll = screen.getByRole('checkbox', { name: 'Select all rows' }) as HTMLInputElement;
    expect(selectAll.indeterminate).toBe(true);
    expect(selectAll).not.toBeChecked();

    await userEvent.click(selectAll);
    expect(onToggleSelectAll).toHaveBeenCalledWith(true);

    rerender(
      <ItemTable
        items={rows}
        columns={columns}
        getItemId={(row) => row.id}
        selectable
        selectedIds={new Set(['1', '2'])}
        selectAllState={true}
        onToggleSelectAll={onToggleSelectAll}
      />,
    );
    const checked = screen.getByRole('checkbox', { name: 'Select all rows' }) as HTMLInputElement;
    expect(checked).toBeChecked();
    expect(checked.indeterminate).toBe(false);
  });
});

describe('ItemTable cell renderers', () => {
  it('renders the name in bold monospace', () => {
    render(
      <table>
        <tbody>
          <tr>
            <td>{renderName({ name: 'alpha' })}</td>
          </tr>
        </tbody>
      </table>,
    );
    expect(screen.getByText('alpha')).toBeInTheDocument();
  });

  it('renders the enabled state as words', () => {
    const { rerender } = render(<div>{renderEnabled(true)}</div>);
    expect(screen.getByText('Active')).toBeInTheDocument();
    rerender(<div>{renderEnabled(false)}</div>);
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('renders dates, blanks and unparseable values', () => {
    const { container, rerender } = render(<div>{renderDate('2024-03-01T10:00:00Z')}</div>);
    expect(container.textContent).toMatch(/Mar 1, 2024/);
    rerender(<div>{renderDate(null)}</div>);
    expect(screen.getByText('—')).toBeInTheDocument();
    rerender(<div>{renderDate('garbage')}</div>);
    expect(screen.getByText('garbage')).toBeInTheDocument();
  });

  it('marks past expiry dates as expired and no expiry as never', () => {
    const { container, rerender } = render(<div>{renderExpiry(null)}</div>);
    expect(screen.getByText('Never')).toBeInTheDocument();
    rerender(<div>{renderExpiry('2000-01-01T00:00:00Z')}</div>);
    expect(container.querySelector('[title="Expired"]')).not.toBeNull();
    rerender(<div>{renderExpiry('2999-01-01T00:00:00Z')}</div>);
    expect(container.querySelector('[title="Expired"]')).toBeNull();
  });

  it('renders up to three tags plus an overflow badge', () => {
    const { container, rerender } = render(<div>{renderTags(null)}</div>);
    expect(screen.getByText('—')).toBeInTheDocument();
    rerender(<div>{renderTags({})}</div>);
    expect(screen.getByText('—')).toBeInTheDocument();
    rerender(<div>{renderTags({ a: '1', b: '2', c: '3', d: '4' })}</div>);
    expect(within(container).getByText('+1')).toBeInTheDocument();
    expect(within(container).getByText('a=1')).toBeInTheDocument();
    expect(within(container).queryByText('d=4')).not.toBeInTheDocument();
  });
});
