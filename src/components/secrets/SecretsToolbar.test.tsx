import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SecretsToolbar } from './SecretsToolbar';

const setup = (props: Partial<React.ComponentProps<typeof SecretsToolbar>> = {}) => {
  const handlers = {
    onFilter: vi.fn(),
    onFile: vi.fn(),
    onImport: vi.fn(),
    onExport: vi.fn(),
    onCreate: vi.fn(),
    onDeleteSelected: vi.fn(),
    onDeletePrefix: vi.fn(),
    onClearSelection: vi.fn(),
  };
  render(
    <SecretsToolbar
      count={2}
      total={5}
      matchCount={2}
      filter=""
      selectedCount={0}
      importing={false}
      deleting={false}
      inputRef={createRef<HTMLInputElement>()}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
};

const openOverflow = () =>
  userEvent.click(screen.getByRole('button', { name: 'More secret actions' }));

describe('SecretsToolbar', () => {
  it('shows the secrets heading, the count and the filter box', async () => {
    const handlers = setup();
    expect(screen.getByRole('heading', { name: 'Secrets' })).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Filter secrets'), 'a');
    expect(handlers.onFilter).toHaveBeenCalledWith('a');
  });

  it('creates a secret from the primary action', async () => {
    const handlers = setup();
    await userEvent.click(screen.getByRole('button', { name: 'New secret' }));
    expect(handlers.onCreate).toHaveBeenCalledTimes(1);
  });

  it('runs import, both exports and delete-by-prefix from the overflow menu', async () => {
    const handlers = setup();
    await openOverflow();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Import from JSON…' }));
    expect(handlers.onImport).toHaveBeenCalledTimes(1);

    await openOverflow();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Export metadata as JSON' }));
    expect(handlers.onExport).toHaveBeenCalledWith('json');

    await openOverflow();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Export metadata as CSV' }));
    expect(handlers.onExport).toHaveBeenCalledWith('csv');

    await openOverflow();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete by prefix…' }));
    expect(handlers.onDeletePrefix).toHaveBeenCalledTimes(1);
  });

  it('disables import while a file is being read and delete while deleting', async () => {
    setup({ importing: true, deleting: true });
    await openOverflow();
    expect(screen.getByRole('menuitem', { name: 'Importing…' })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: 'Delete by prefix…' })).toBeDisabled();
  });

  it('hides the selection bar until rows are checked', () => {
    setup();
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });

  it('offers bulk actions once rows are checked', async () => {
    const handlers = setup({ selectedCount: 3, matchCount: 12 });
    expect(screen.getByText('3 of 12 selected')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
    expect(handlers.onDeleteSelected).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(handlers.onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('locks the bulk actions while a delete is running', () => {
    setup({ selectedCount: 3, deleting: true });
    expect(screen.getByRole('button', { name: 'Delete selected' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear selection' })).toBeDisabled();
  });

  it('exposes a hidden JSON file input wired to onFile', async () => {
    const handlers = setup();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toHaveAttribute('accept', 'application/json,.json');
    await userEvent.upload(input, new File(['[]'], 'secrets.json', { type: 'application/json' }));
    expect(handlers.onFile).toHaveBeenCalledTimes(1);
  });
});
