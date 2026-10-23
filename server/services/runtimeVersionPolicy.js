'use strict';

function assertSupportedNodeVersion(version = process.versions.node) {
  const match = String(version).match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  const [major, minor, patch] = match ? match.slice(1).map(Number) : [];
  if (major !== 24 || minor < 22 || minor === 22 && patch < 1) {
    throw new Error('HUGPONG requires Node.js >=24.22.1 <25. Update the hosting NODE_VERSION override or use the repository .node-version.');
  }
}
module.exports = { assertSupportedNodeVersion };
