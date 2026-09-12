import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeKey } from '../../test/fixtures';
import { KeyDetails } from './KeyDetails';

describe('KeyDetails', () => {
  it('prompts for a selection when nothing is selected', () => {
    render(<KeyDetails item={null} onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'No key selected' })).toBeInTheDocument();
  });

  it('shares the detail-pane header with the other resources and closes', async () => {
    const onClose = vi.fn();
    render(<KeyDetails item={makeKey({ managed: true })} onClose={onClose} />);
    expect(screen.getByRole('heading', { name: 'signing-key' })).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Managed')).toBeInTheDocument();
    expect(screen.getByText('abc123')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close details' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('writes tags the way the lists do', () => {
    render(<KeyDetails item={makeKey({ tags: { env: 'prod' } })} onClose={vi.fn()} />);
    const tag = screen.getByText('env=prod');
    expect(tag).toBeInTheDocument();
    expect(tag).toHaveAttribute('title', 'env=prod');
  });

  it('uses sentence case for its field labels and copes with missing metadata', () => {
    render(
      <KeyDetails
        item={makeKey({
          id: 'no-version-here',
          enabled: false,
          keyType: null,
          keyOps: null,
          created: null,
          updated: null,
          notBefore: null,
        })}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    expect(screen.getByText('Key type')).toBeInTheDocument();
    expect(screen.getByText('Not before')).toBeInTheDocument();
    expect(screen.queryByText('Key Type')).not.toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});
