'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function resolver(blockFarms) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../mobile/src/data/dataStore.js'), 'utf8');
  const start = source.indexOf('export const resolveFieldBlockFarm =');
  const end = source.indexOf('\nexport const ', start + 1);
  return new Function('blockFarms', `${source.slice(start, end).replace('export const ', 'const ')}; return resolveFieldBlockFarm;`)(blockFarms);
}

test('Mobile takeover resolves the field farm by canonical ID without legacy or session name aliases', () => {
  const farms = [{ id: 'BF-NACAYAO', name: 'NACAYAO SMALL FARMERS ASSOCIATION' }, { id: 'BF-OTHER', name: 'Other Farm' }];
  const resolve = resolver(farms);
  const field = { id: 'FLD-1', blockFarmId: 'BF-NACAYAO', areaHa: 1.75 };
  assert.equal(resolve(field), 'NACAYAO SMALL FARMERS ASSOCIATION');
  assert.equal(resolve({ ...field, blockFarm: 'Stale farm name' }), farms[0].name);
  assert.equal(resolve({ ...field, blockFarmId: 'BF-OTHER' }), 'Other Farm');
  farms[0].name = 'Updated NACAYAO name';
  assert.equal(resolve(field), 'Updated NACAYAO name', 'later server replica updates remain visible');

  const screen = fs.readFileSync(path.resolve(__dirname, '../../mobile/src/screens/FieldOpsScreen.js'), 'utf8');
  const summary = screen.slice(screen.indexOf('{/* Target Field Summary Card */}'), screen.indexOf('{/* Security Notice */}', screen.indexOf('{/* Target Field Summary Card */}')));
  assert.match(summary, /resolveFieldBlockFarm\(safeField\)/);
  assert.doesNotMatch(summary, /session\?\.(farm|blockFarm)|No block farm assigned/);
});

test('an unloaded farm name preserves the assigned ID and only an absent relation is unassigned', () => {
  const resolve = resolver([]);
  assert.equal(resolve({ blockFarmId: 'BF-NACAYAO' }), 'BF-NACAYAO');
  assert.equal(resolve({ blockFarm: 'An obsolete display alias' }), 'Unassigned');
  assert.equal(resolve(null), 'Unassigned');
});
