import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeAuditEntry } from '../../test/fixtures';
import { ActivityTable } from './ActivityTable';

describe('ActivityTable', () => {
  // The badge colour is the only at-a-glance signal that a row was destructive,
  // so the action -> tone mapping is asserted, not just the label.
  const TONED_ACTIONS: Array<[action: string, label: string, toneClass: string]> = [
    ['purge', 'Purge', 'text-red-700'],
    ['delete', 'Delete', 'text-red-700'],
    ['create', 'Create', 'text-green-700'],
    ['set', 'Create or update', 'text-green-700'],
    ['get_value', 'Read value', 'text-orange-700'],
    ['sign', 'Sign', 'text-purple-700'],
    ['list', 'List', 'text-blue-600'],
  ];

  it('tones every kind of action and labels it', () => {
    render(
      <ActivityTable
        entries={TONED_ACTIONS.map(([action], index) =>
          makeAuditEntry({ action, itemName: `item-${index}` }),
        )}
      />,
    );

    for (const [action, label, toneClass] of TONED_ACTIONS) {
      const badge = screen.getByText(label);
      expect(badge.className).toContain(toneClass);
      // A wrong mapping would otherwise show up only as "some badge exists".
      const wrongTones = [
        'text-red-700',
        'text-green-700',
        'text-orange-700',
        'text-purple-700',
        'text-blue-600',
      ].filter((tone) => tone !== toneClass);
      for (const wrong of wrongTones) {
        expect(badge.className, `${action} must not be toned ${wrong}`).not.toContain(wrong);
      }
    }

    expect(screen.getAllByRole('row')).toHaveLength(TONED_ACTIONS.length + 1);
  });

  it('stops the arrow keys at the ends of the table', async () => {
    render(
      <ActivityTable
        entries={[makeAuditEntry({ itemName: 'only' }), makeAuditEntry({ itemName: 'second' })]}
      />,
    );
    const [first, second] = screen.getAllByRole('row').slice(1);
    first.focus();
    const { default: userEvent } = await import('@testing-library/user-event');
    await userEvent.keyboard('{ArrowUp}');
    expect(first).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(second).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(second).toHaveFocus();
  });
});
