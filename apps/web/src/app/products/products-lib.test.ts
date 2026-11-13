import { describe, expect, it } from 'vitest';
import {
  IMPORT_BATCH_STATUS_LABEL,
  IMPORT_CATEGORY_LABEL,
  IMPORT_OUTCOME_LABEL,
  IMPORT_STATUS_LABEL,
  importLabel,
  importToneCls,
} from './products-lib';

describe('import reliability labels (persian RTL vocabulary)', () => {
  it('maps every documented status, outcome, category and batch status', () => {
    expect(Object.keys(IMPORT_STATUS_LABEL).sort()).toEqual(['completed', 'failed', 'processing']);
    expect(Object.keys(IMPORT_OUTCOME_LABEL).sort()).toEqual([
      'committed', 'not_started', 'partial', 'rolled_back', 'unknown',
    ]);
    expect(Object.keys(IMPORT_CATEGORY_LABEL).sort()).toEqual([
      'business', 'concurrency', 'infrastructure', 'none', 'permission', 'validation',
    ]);
    expect(Object.keys(IMPORT_BATCH_STATUS_LABEL).sort()).toEqual([
      'committed', 'failed', 'rejected', 'rolled_back',
    ]);
  });

  it('keeps unknown outcomes visibly unsafe instead of rendering them as success', () => {
    expect(importLabel(IMPORT_OUTCOME_LABEL, 'unknown')).toContain('بررسی اپراتور');
    expect(importToneCls('unknown')).toBe('text-danger-ink');
    expect(importToneCls('committed')).toBe('text-success-ink');
    expect(importToneCls('partial')).toBe('text-warning-ink');
  });

  it('does not invent a label for absent or unknown vocabulary', () => {
    expect(importLabel(IMPORT_STATUS_LABEL)).toBe('—');
    expect(importLabel(IMPORT_STATUS_LABEL, 'legacy_value')).toBe('legacy_value');
    expect(importToneCls()).toBe('text-info-ink');
  });
});
