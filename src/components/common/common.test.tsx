import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DangerConfirmDialog } from './DangerConfirmDialog';
import { DetailField } from './DetailField';
import { EmptyState } from './EmptyState';
import { ErrorMessage, parseAzureError } from './ErrorMessage';
import { ListPager, PAGE_SIZE } from './ListPager';
import { ListToolbar } from './ListToolbar';
import { LoadingSkeleton } from './LoadingSkeleton';
import { SplitPane } from './SplitPane';

describe('ListToolbar', () => {
  const setup = (props: Partial<React.ComponentProps<typeof ListToolbar>> = {}) => {
    const onFilterChange = vi.fn();
    render(<ListToolbar title="Secrets" filter="" onFilterChange={onFilterChange} {...props} />);
    return onFilterChange;
  };

  it('renders the title and a labelled filter box', async () => {
    const onFilterChange = setup();
    expect(screen.getByRole('heading', { name: 'Secrets' })).toBeInTheDocument();
    const box = screen.getByLabelText('Filter secrets');
    expect(box).toHaveAttribute('placeholder', 'Filter by name');
    await userEvent.type(box, 'ab');
    expect(onFilterChange).toHaveBeenCalledTimes(2);
    expect(onFilterChange).toHaveBeenLastCalledWith('b');
  });

  it('shows only the count when no filter is typed', () => {
    setup({ count: 4, total: 9 });
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.queryByText('4 / 9')).not.toBeInTheDocument();
  });

  it('shows count over total while filtering', () => {
    setup({ count: 4, total: 9, filter: 'ab' });
    expect(screen.getByText(/4\s*\/\s*9/)).toBeInTheDocument();
  });

  it('renders the subtitle, status slot, actions and a custom placeholder', () => {
    setup({
      subtitle: 'my-vault',
      status: <span>status slot</span>,
      actions: <button type="button">Action</button>,
      filterPlaceholder: 'Search activity',
    });
    expect(screen.getByText('my-vault')).toBeInTheDocument();
    expect(screen.getByText('status slot')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
    expect(screen.getByLabelText('Filter secrets')).toHaveAttribute(
      'placeholder',
      'Search activity',
    );
  });
});

describe('ListPager', () => {
  it('renders nothing once everything is shown', () => {
    const { container } = render(<ListPager shown={10} total={10} onShowMore={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers a full page while plenty remains', () => {
    render(<ListPager shown={50} total={500} onShowMore={vi.fn()} />);
    expect(screen.getByRole('button', { name: `Show ${PAGE_SIZE} more` })).toBeInTheDocument();
    expect(screen.getByText('50 of 500')).toBeInTheDocument();
  });

  it('offers only what is left when fewer than a page remains', async () => {
    const onShowMore = vi.fn();
    render(<ListPager shown={50} total={53} onShowMore={onShowMore} />);
    await userEvent.click(screen.getByRole('button', { name: 'Show 3 more' }));
    expect(onShowMore).toHaveBeenCalledTimes(1);
  });

  it('honours a custom step', () => {
    render(<ListPager shown={0} total={100} step={25} onShowMore={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Show 25 more' })).toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('renders the title only by default', () => {
    render(<EmptyState title="Nothing yet" />);
    expect(screen.getByRole('heading', { name: 'Nothing yet' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders an icon, a description and a call to action', async () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        icon={<svg aria-label="icon" />}
        title="No secrets yet"
        description="This vault has no secrets."
        action={{ label: 'New secret', onClick }}
      />,
    );
    expect(screen.getByText('This vault has no secrets.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'New secret' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('LoadingSkeleton', () => {
  it('renders the requested number of rows as a labelled status region', () => {
    const { container } = render(<LoadingSkeleton rows={3} columns={[50, 50]} />);
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
    expect(container.querySelectorAll('output > div')).toHaveLength(3);
  });

  it('defaults to eight rows', () => {
    const { container } = render(<LoadingSkeleton />);
    expect(container.querySelectorAll('output > div')).toHaveLength(8);
  });
});

describe('DetailField', () => {
  it('renders a value', () => {
    render(
      <dl>
        <DetailField label="Name" value="alpha" mono />
      </dl>,
    );
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('alpha')).toBeInTheDocument();
  });

  it('prefers children over the value', () => {
    render(
      <dl>
        <DetailField label="Tags" value="ignored">
          <span>custom</span>
        </DetailField>
      </dl>,
    );
    expect(screen.getByText('custom')).toBeInTheDocument();
    expect(screen.queryByText('ignored')).not.toBeInTheDocument();
  });
});

describe('parseAzureError', () => {
  it.each([
    ['request failed with status 401', 'Session expired', true],
    ['403 Forbidden', 'Access denied', false],
    ['404 SecretNotFound', 'Not found', true],
    ['409 Conflict', 'Conflict', false],
    ['NetworkError when attempting to reach', 'Network error', true],
    ['failed to fetch resource', 'Network error', true],
    ['something odd happened', 'Unexpected error', true],
  ])('maps %s to %s', (message, title, retryable) => {
    const parsed = parseAzureError(message);
    expect(parsed.title).toBe(title);
    expect(parsed.retryable).toBe(retryable);
    expect(parsed.action).not.toBe('');
  });

  it('truncates very long messages', () => {
    const parsed = parseAzureError('x'.repeat(500));
    expect(parsed.description).toHaveLength(203);
    expect(parsed.description.endsWith('...')).toBe(true);
  });

  it('keeps short messages intact', () => {
    expect(parseAzureError('boom').description).toBe('boom');
  });
});

describe('ErrorMessage', () => {
  it('parses a raw string error and offers a retry when retryable', async () => {
    const onRetry = vi.fn();
    render(<ErrorMessage error="401 unauthorized" onRetry={onRetry} />);
    expect(screen.getByText('Session expired')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('hides retry for errors that cannot be retried', () => {
    render(<ErrorMessage error="403 denied" onRetry={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('accepts an already-parsed error and a dismiss handler', async () => {
    const onDismiss = vi.fn();
    render(
      <ErrorMessage
        error={{ title: 'Custom', description: 'desc', action: 'act', retryable: false }}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByText('Custom')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('DangerConfirmDialog', () => {
  const setup = (props: Partial<React.ComponentProps<typeof DangerConfirmDialog>> = {}) => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const result = render(
      <DangerConfirmDialog
        open
        title="Delete Secret"
        description="Delete alpha?"
        confirmText="delete"
        onConfirm={onConfirm}
        onCancel={onCancel}
        {...props}
      />,
    );
    return { onConfirm, onCancel, ...result };
  };

  it('keeps the confirm button disabled until the phrase is typed', async () => {
    const { onConfirm } = setup({ confirmLabel: 'Delete' });
    const confirm = screen.getByRole('button', { name: 'Delete' });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText('delete'), 'delete');
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not accept a different case, so a near miss cannot arm the action', async () => {
    setup({ confirmLabel: 'Delete' });
    await userEvent.type(screen.getByPlaceholderText('delete'), 'DELETE');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('falls back to the title as the confirm label', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Delete Secret' })).toBeInTheDocument();
  });

  it('cancels', async () => {
    const { onCancel } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('warns harder for critical actions and renders extra children', () => {
    setup({ dangerLevel: 'critical', children: <p>extra detail</p> });
    expect(screen.getByText('This action is irreversible.')).toBeInTheDocument();
    expect(screen.getByText('extra detail')).toBeInTheDocument();
  });

  it('locks the dialog down while the action runs', () => {
    setup({ loading: true });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByPlaceholderText('delete')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
  });

  it('clears the typed phrase when it closes', async () => {
    const { rerender } = setup();
    await userEvent.type(screen.getByPlaceholderText('delete'), 'delete');
    rerender(
      <DangerConfirmDialog
        open={false}
        title="Delete Secret"
        description="Delete alpha?"
        confirmText="delete"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    rerender(
      <DangerConfirmDialog
        open
        title="Delete Secret"
        description="Delete alpha?"
        confirmText="delete"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText('delete')).toHaveValue('');
  });
});

describe('SplitPane', () => {
  it('hides the right pane and the separator when asked', () => {
    render(<SplitPane left={<p>left</p>} right={<p>right</p>} rightVisible={false} />);
    expect(screen.getByText('left')).toBeInTheDocument();
    expect(screen.queryByText('right')).not.toBeInTheDocument();
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  it('reports the current ratio on the separator', () => {
    render(<SplitPane left={<p>left</p>} right={<p>right</p>} defaultRatio={0.5} />);
    expect(screen.getByRole('separator', { name: 'Resize panels' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    );
  });

  it('resizes on drag and reports the final ratio once', () => {
    const onRatioChange = vi.fn();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 1000,
      left: 0,
      top: 0,
      right: 1000,
      bottom: 800,
      height: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    render(
      <SplitPane
        left={<p>left</p>}
        right={<p>right</p>}
        defaultRatio={0.6}
        minLeft={200}
        minRight={200}
        onRatioChange={onRatioChange}
      />,
    );
    const separator = screen.getByRole('separator');
    fireEvent.mouseDown(separator);
    fireEvent.mouseMove(document, { clientX: 400 });
    expect(separator).toHaveAttribute('aria-valuenow', '40');

    // The minimums clamp the ratio at both ends.
    fireEvent.mouseMove(document, { clientX: 10 });
    expect(separator).toHaveAttribute('aria-valuenow', '20');
    fireEvent.mouseMove(document, { clientX: 990 });
    expect(separator).toHaveAttribute('aria-valuenow', '80');

    fireEvent.mouseUp(document);
    expect(onRatioChange).toHaveBeenCalledTimes(1);
    expect(onRatioChange).toHaveBeenCalledWith(0.8);
  });

  it('follows a changed defaultRatio', () => {
    const { rerender } = render(
      <SplitPane left={<p>left</p>} right={<p>right</p>} defaultRatio={0.6} />,
    );
    rerender(<SplitPane left={<p>left</p>} right={<p>right</p>} defaultRatio={0.3} />);
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '30');
  });
});
