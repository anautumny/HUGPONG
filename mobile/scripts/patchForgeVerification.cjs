'use strict';

// Temporary mitigation for GHSA-86w9-cpqp-85rv. Remove only after adopting a
// verified upstream fix. npm audit still reports the upstream package version.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const manifest = require(require.resolve('node-forge/package.json', { paths: [root] }));
const filename = require.resolve('node-forge/lib/rsa.js', { paths: [root] });
const before = 'obj.value.length !== 2) {';
const after = `obj.value.length !== 2 ||
            // HUGPONG GHSA-86w9-cpqp-85rv: reject ignored nested elements.
            (obj.value[0].value.length !== 1 && obj.value[0].value.length !== 2) ||
            (obj.value[0].value.length === 2 && obj.value[0].value[1].value !== '')) {`;

function verifyOrPatch(checkOnly = false) {
  if (manifest.version !== '1.4.0') throw new Error('Review the node-forge mitigation against the new dependency version before building.');
  const source = fs.readFileSync(filename, 'utf8');
  if (source.includes(after)) return;
  if (checkOnly || source.split(before).length !== 2) throw new Error('node-forge verification mitigation is missing or its source changed. Run npm install in mobile, then review the security tests.');
  fs.writeFileSync(filename, source.replace(before, after));
}
if (require.main === module) {
  verifyOrPatch(process.argv.includes('--check'));
  process.stdout.write('node-forge nested DigestAlgorithm validation verified.\n');
}
module.exports = { verifyOrPatch };
