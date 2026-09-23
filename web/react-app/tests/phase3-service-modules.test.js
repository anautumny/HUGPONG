import test from 'node:test';
import assert from 'node:assert/strict';

import { SRA_OPERATIONS_CATALOGUE } from '../src/domain/operationCatalogue.js';

test('web operation templates preserve the 14 existing identifiers and stage assignments', () => {
  assert.deepEqual(
    SRA_OPERATIONS_CATALOGUE.map(operation => operation.id),
    Array.from({ length: 14 }, (_, index) => `SRA-${String(index + 1).padStart(2, '0')}`)
  );
  assert.ok(SRA_OPERATIONS_CATALOGUE.every(operation => operation.stageNumber >= 1 && operation.stageNumber <= 6));
});

test('web template line-item totals preserve each existing cost-per-hectare value', () => {
  for (const operation of SRA_OPERATIONS_CATALOGUE) {
    const lineTotal = operation.subItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    assert.ok(Math.abs(lineTotal - operation.costPerHa) < 0.01, operation.id);
  }
});
