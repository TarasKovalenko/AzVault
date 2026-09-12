import { describe, expect, it } from 'vitest';
import { actionLabel, itemTypeLabel, resultLabel } from './auditLabels';

describe('audit labels', () => {
  it('translates the enums the backend stores', () => {
    expect(actionLabel('get_value')).toBe('Read value');
    expect(actionLabel('set')).toBe('Create or update');
    expect(itemTypeLabel('secret')).toBe('Secret');
    expect(itemTypeLabel('certificate')).toBe('Certificate');
    expect(resultLabel('success')).toBe('Success');
    expect(resultLabel('error')).toBe('Error');
  });

  it('falls back to a sentence-cased version of anything it has not seen', () => {
    expect(actionLabel('restore_backup')).toBe('Restore backup');
    expect(itemTypeLabel('managed-storage')).toBe('Managed storage');
    expect(resultLabel('partial')).toBe('Partial');
    expect(actionLabel('')).toBe('—');
  });
});
