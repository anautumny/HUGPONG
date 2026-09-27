const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('mobile block-farm lists use canonical IDs for React keys and selection', () => {
  const sraHome = read('mobile/src/screens/sra/SRAHomeView.js');
  const fieldOps = read('mobile/src/screens/FieldOpsScreen.js');
  const registration = read('mobile/src/screens/auth/RegisterScreen.js');

  assert.match(sraHome, /key=\{farm\.id\}/);
  assert.doesNotMatch(sraHome, /key=\{farm\.name\}/);

  assert.match(fieldOps, /key=\{farm\.id\}/);
  assert.match(fieldOps, /onPress=\{\(\) => setSelectedFarm\(farm\.id\)\}/);

  assert.match(registration, /key=\{farm\.id\}/);
  assert.match(registration, /blockFarmId: farm\.id/);
});

test('web block-farm selectors already use canonical IDs', () => {
  const registry = read('web/react-app/src/views/fields/FarmFieldRegistryView.jsx');
  const analytics = read('web/react-app/src/components/analytics/AnalyticsFilters.jsx');

  assert.match(registry, /value: bf\.id/);
  assert.match(analytics, /value: f\.id/);
});
