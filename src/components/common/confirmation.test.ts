import { describe, expect, it } from 'vitest';
import { isConfirmationValid } from './confirmation';

describe('isConfirmationValid', () => {
  it('accepts the exact word', () => {
    expect(isConfirmationValid('delete', 'delete')).toBe(true);
  });

  it('forgives surrounding whitespace', () => {
    expect(isConfirmationValid('  delete  ', 'delete')).toBe(true);
    expect(isConfirmationValid('\tdelete\n', 'delete')).toBe(true);
  });

  it('is case-sensitive, so a near miss does not arm a destructive action', () => {
    expect(isConfirmationValid('Delete', 'delete')).toBe(false);
    expect(isConfirmationValid('DELETE', 'delete')).toBe(false);
  });

  it('rejects empty, partial and padded-with-extra-words input', () => {
    expect(isConfirmationValid('', 'delete')).toBe(false);
    expect(isConfirmationValid('del', 'delete')).toBe(false);
    expect(isConfirmationValid('delete now', 'delete')).toBe(false);
  });

  it('works for confirmation words other than delete', () => {
    expect(isConfirmationValid('purge', 'purge')).toBe(true);
    expect(isConfirmationValid('delete', 'purge')).toBe(false);
  });
});
