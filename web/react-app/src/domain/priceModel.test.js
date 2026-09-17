import { describe, expect, it } from 'vitest';
import { assertCanonicalPrice, buildPricePayload } from './priceModel';

const form = { effectiveDate: '2026-09-17', weekLabel: 'Week 3 Sep', sugarPricePerLkg: '2850', molassesPricePerMetricTon: '4200', circularNumber: 'SRA-117', source: 'Official circular' };

describe('canonical SRA price model', () => {
  it('derives changes from persisted values and emits no legacy aliases', () => {
    const result = buildPricePayload(form, { sugarPricePerLkg: 2800, molassesPricePerMetricTon: 4100 });
    expect(result).toEqual({ effectiveDate: '2026-09-17', weekLabel: 'Week 3 Sep', sugarPricePerLkg: 2850, sugarPriceChange: 50, molassesPricePerMetricTon: 4200, molassesPriceChange: 100, circularNumber: 'SRA-117', source: 'Official circular' });
    for (const key of ['date', 'week', 'price', 'molasses', 'change', 'molassesChange']) expect(result).not.toHaveProperty(key);
  });
  it('uses explicit zero changes for the first real publication', () => {
    expect(buildPricePayload(form).sugarPriceChange).toBe(0);
    expect(buildPricePayload(form).molassesPriceChange).toBe(0);
  });
  it('rejects missing required values and non-calendar dates', () => {
    expect(() => buildPricePayload({ ...form, effectiveDate: '09/17/2026' })).toThrow(/YYYY-MM-DD/);
    expect(() => buildPricePayload({ ...form, effectiveDate: '2026-02-30' })).toThrow(/valid calendar/);
    expect(() => buildPricePayload({ ...form, sugarPricePerLkg: '' })).toThrow(/required/);
  });
  it('validates records consumed by renderers', () => {
    expect(assertCanonicalPrice({ id: 'PRC-1', ...buildPricePayload(form) }).weekLabel).toBe('Week 3 Sep');
  });
});
