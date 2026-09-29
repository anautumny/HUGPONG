const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const webThemePath = path.join(repositoryRoot, 'web', 'react-app', 'src', 'index.css');
const mobileThemePath = path.join(repositoryRoot, 'mobile', 'src', 'theme.js');

const read = filePath => fs.readFileSync(filePath, 'utf8');

function lightWebTokens(source) {
  const rootBlock = source.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] || '';
  return Object.fromEntries(
    [...rootBlock.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)]
      .map(([, name, value]) => [name, value.toUpperCase()])
  );
}

function mobileColorTokens(source) {
  const colorsBlock = source.match(/export const COLORS = \{([\s\S]*?)\n\};/)?.[1] || '';
  return Object.fromEntries(
    [...colorsBlock.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):\s*['"](#[0-9a-f]{6})['"]/gmi)]
      .map(([, name, value]) => [name, value.toUpperCase()])
  );
}

function javascriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.js') ? [entryPath] : [];
  });
}

test('Web light mode and Mobile share the canonical semantic color contract', () => {
  const web = lightWebTokens(read(webThemePath));
  const mobile = mobileColorTokens(read(mobileThemePath));
  const mappings = {
    background: 'background',
    surface: 'surface',
    surfaceSubtle: 'surface-subtle',
    surfaceRaised: 'surface-elevated',
    text: 'foreground',
    textSecondary: 'foreground-secondary',
    textMuted: 'foreground-muted',
    border: 'border',
    borderStrong: 'border-strong',
    primary: 'primary',
    primaryDark: 'primary-hover',
    primaryLight: 'primary-light',
    primaryBg: 'primary-bg',
    success: 'success',
    successBg: 'success-bg',
    warning: 'warning',
    warningBg: 'warning-bg',
    danger: 'danger',
    dangerBg: 'danger-bg',
    info: 'info',
    infoBg: 'info-bg'
  };

  for (const [mobileName, webName] of Object.entries(mappings)) {
    assert.ok(web[webName], `Missing Web light-mode token --${webName}`);
    assert.ok(mobile[mobileName], `Missing Mobile color token COLORS.${mobileName}`);
    assert.equal(mobile[mobileName], web[webName], `${mobileName} must match Web --${webName}`);
  }
});

test('every Mobile COLORS reference resolves to a declared theme token', () => {
  const themeSource = read(mobileThemePath);
  const colorsBlock = themeSource.match(/export const COLORS = \{([\s\S]*?)\n\};/)?.[1] || '';
  const declared = new Set(
    [...colorsBlock.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):/gm)].map(match => match[1])
  );
  const mobileSourceFiles = [
    path.join(repositoryRoot, 'mobile', 'App.js'),
    ...javascriptFiles(path.join(repositoryRoot, 'mobile', 'src'))
  ];
  const referenced = new Set(
    mobileSourceFiles.flatMap(filePath =>
      [...read(filePath).matchAll(/(?<![A-Za-z0-9_])COLORS\.([A-Za-z][A-Za-z0-9]*)/g)].map(match => match[1])
    )
  );
  const missing = [...referenced].filter(name => !declared.has(name)).sort();

  assert.deepEqual(missing, []);
});
