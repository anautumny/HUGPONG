'use strict';
const fs = require('node:fs');
const path = require('node:path');
const parser = require('../../mobile/node_modules/@babel/parser');
const traverse = require('../../mobile/node_modules/@babel/traverse').default;
const browserGlobals = new Set(('undefined NaN Infinity console process module exports require __dirname __filename global globalThis __DEV__ window document navigator location localStorage sessionStorage fetch Headers Request Response URL URLSearchParams AbortController AbortSignal FormData Blob File FileReader Image ImageData HTMLElement HTMLInputElement MutationObserver IntersectionObserver ResizeObserver performance crypto alert confirm prompt atob btoa requestAnimationFrame cancelAnimationFrame queueMicrotask setImmediate clearImmediate setTimeout clearTimeout setInterval clearInterval structuredClone Buffer Intl TextEncoder TextDecoder Event CustomEvent DOMException CSS history self caches indexedDB matchMedia').split(' '));

function auditClientBindings(root) {
  const findings = [];
  function inspect(file) {
    if (!fs.existsSync(file)) return;
    if (fs.statSync(file).isDirectory()) { fs.readdirSync(file).forEach(name => inspect(path.join(file, name))); return; }
    if (!/\.[cm]?[jt]sx?$/.test(file)) return;
    const source = fs.readFileSync(file, 'utf8');
    try {
      const ast = parser.parse(source, { sourceType: 'unambiguous', plugins: ['jsx'] });
      const seen = new Set();
      traverse(ast, { ReferencedIdentifier(node) {
        const name = node.node.name;
        if (node.scope.hasBinding(name) || browserGlobals.has(name) || seen.has(name)) return;
        seen.add(name); findings.push({ file: path.relative(root, file).replaceAll('\\', '/'), line: node.node.loc.start.line, name });
      } });
    } catch (error) { findings.push({ file: path.relative(root, file), line: error.loc?.line, error: error.message }); }
  }
  ['mobile/src', 'mobile/App.js', 'web/react-app/src'].forEach(target => inspect(path.join(root, target)));
  return findings;
}
if (require.main === module) {
  const findings = auditClientBindings(path.resolve(__dirname, '../..'));
  process.stdout.write(JSON.stringify({ findingCount: findings.length, findings }, null, 2) + '\n');
  if (findings.length) process.exitCode = 1;
}
module.exports = { auditClientBindings };
