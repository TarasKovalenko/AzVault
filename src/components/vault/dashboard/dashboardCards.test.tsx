import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeAuditEntry, makeVault } from '../../../test/fixtures';
import { AttentionCard } from './AttentionCard';
import { RecentActivityCard } from './RecentActivityCard';
import { VaultCountCard } from './VaultCountCard';
import { VaultPropertiesCard } from './VaultPropertiesCard';

describe('VaultPropertiesCard', () => {
  const setup = (softDeleteEnabled: boolean | null) =>
    render(
      <VaultPropertiesCard
        vault={makeVault({ softDeleteEnabled })}
        vaultUri="https://my-vault.vault.azure.net/"
        onCopy={vi.fn()}
      />,
    );

  it('separates soft delete being off from it being unknown', () => {
    const { unmount } = setup(false);
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    // The warning talks about soft delete, which is what the label promises.
    expect(screen.getByText(/Soft delete is off/)).toBeInTheDocument();
    expect(screen.queryByText(/Purge protection/)).not.toBeInTheDocument();
    unmount();

    setup(null);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByText(/could not be read/)).toBeInTheDocument();
  });

  it('says nothing extra when soft delete is on', async () => {
    const onCopy = vi.fn();
    render(
      <VaultPropertiesCard
        vault={makeVault({ softDeleteEnabled: true })}
        vaultUri="https://my-vault.vault.azure.net/"
        onCopy={onCopy}
      />,
    );
    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(screen.queryByText(/Soft delete is off/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Copy vault URI' }));
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it('falls back to placeholders without a vault', () => {
    render(<VaultPropertiesCard vaultUri={null} onCopy={vi.fn()} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

describe('RecentActivityCard', () => {
  it('labels actions for readers and tones them by kind', () => {
    render(
      <RecentActivityCard
        entries={[
          makeAuditEntry({ action: 'get_value', itemName: 'alpha' }),
          makeAuditEntry({ action: 'delete', itemName: 'beta', result: 'error' }),
          makeAuditEntry({ action: 'set', itemName: 'gamma' }),
          makeAuditEntry({ action: 'list', itemName: '' }),
          makeAuditEntry({ action: 'get', timestamp: 'not-a-date', itemName: 'delta' }),
        ]}
      />,
    );
    expect(screen.getByText('Read value')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(screen.getByText('Create or update')).toBeInTheDocument();
    expect(screen.queryByText('get_value')).not.toBeInTheDocument();
    expect(screen.getByText('not-a-date')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('reports an empty log', () => {
    render(<RecentActivityCard entries={[]} />);
    expect(screen.getByText('No activity recorded for this vault.')).toBeInTheDocument();
  });
});

describe('AttentionCard', () => {
  it('celebrates an empty list and opens the tab of a flagged item', async () => {
    const onOpen = vi.fn();
    const { unmount } = render(<AttentionCard items={[]} onOpen={onOpen} />);
    expect(screen.getByText(/Everything looks healthy/)).toBeInTheDocument();
    unmount();

    render(
      <AttentionCard
        items={[
          { id: '1', name: 'alpha', type: 'Secret', tab: 'secrets', reason: 'Expired', days: -2 },
          { id: '2', name: 'beta', type: 'Key', tab: 'keys', reason: 'Expiring', days: 5 },
        ]}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByText('2 items need review')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /alpha/ }));
    expect(onOpen).toHaveBeenCalledWith('secrets');
  });

  it('counts a single item in the singular', () => {
    render(
      <AttentionCard
        items={[
          { id: '1', name: 'alpha', type: 'Secret', tab: 'secrets', reason: 'Expiring', days: 3 },
        ]}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText('1 item needs review')).toBeInTheDocument();
  });
});

describe('VaultCountCard', () => {
  it('shows a placeholder while loading and the count once it lands', async () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <VaultCountCard icon="lock" label="Secrets" loading onClick={onClick} />,
    );
    expect(screen.getByText('…')).toBeInTheDocument();

    rerender(
      <VaultCountCard icon="lock" label="Secrets" count={7} loading={false} onClick={onClick} />,
    );
    expect(screen.getByText('7')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<VaultCountCard icon="lock" label="Secrets" loading={false} onClick={onClick} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
