'use strict';

const path = require('node:path');
const { buildSync } = require('esbuild');
const directory = path.resolve(__dirname, '..');
buildSync({
  entryPoints: [path.join(directory, 'src/entry.mjs')],
  outfile: path.join(directory, 'dist/worker.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'es2022',
  external: ['cloudflare:*'], define: { __dirname: '"/bundle"' },
  // Use Node dependency exports, including iconv-lite streams. Browser shims
  // break Express even when nodejs_compat is enabled.
  banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire("/bundle/worker.mjs");' }
});
