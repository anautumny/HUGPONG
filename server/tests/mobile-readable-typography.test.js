'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../mobile/src');
const mobileRequire = createRequire(path.resolve(root, '../package.json'));
const babel = mobileRequire('@babel/core');
const flatten = value => Array.isArray(value) ? Object.assign({}, ...value.filter(Boolean).map(flatten)) : value || {};

function typography(fontsLoaded = true) {
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename);
    const code = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, configFile: false, babelrc: false,
      plugins: [mobileRequire.resolve('@babel/plugin-transform-react-jsx'), mobileRequire.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
    const module = { exports: {} };
    const requireMock = name => {
      if (name === 'react') return { forwardRef: render => render, createElement: (type, props) => ({ type, props }) };
      if (name === 'expo-font') return { isLoaded: () => fontsLoaded };
      if (name === 'react-native') return { Text: 'NativeText', TextInput: 'NativeTextInput', StyleSheet: { flatten, create: value => value } };
      return load(path.resolve(path.dirname(filename), `${name}.js`));
    };
    new Function('require', 'module', 'exports', code)(requireMock, module, module.exports);
    cache.set(filename, module.exports);
    return module.exports;
  }
  return { ...load(path.join(root, 'components/Typography.js')), theme: load(path.join(root, 'theme.js')) };
}

test('all app captions use a readable minimum, supporting contrast and consistent font weight', () => {
  const { AppText, theme } = typography();
  for (const size of [9.5, 10, 10.5, 11, 12, 13, 14]) {
    const original = { fontSize: size, lineHeight: 12, color: theme.COLORS.textMuted, fontWeight: '700' };
    const result = AppText({ style: original });
    const style = flatten(result.props.style);
    assert.equal(style.fontSize, 14);
    assert.equal(style.lineHeight, 20);
    assert.equal(style.color, theme.COLORS.textSecondary);
    assert.equal(style.fontFamily, 'Inter_700Bold');
    assert.equal(original.fontSize, size, 'shared styles are never mutated');
    assert.equal(result.props.allowFontScaling, true);
  }
});

test('larger headings, nested inheritance, technical identifiers and icon fonts retain their roles', () => {
  const { AppText, theme } = typography();
  const heading = flatten(AppText({ family: theme.FONT_FAMILY.display, style: { fontSize: 24, fontWeight: '800' } }).props.style);
  assert.equal(heading.fontSize, 24);
  assert.equal(heading.fontFamily, 'PlusJakartaSans_800ExtraBold');
  assert.equal(flatten(AppText({ style: { fontWeight: '700' } }).props.style).fontSize, undefined, 'nested text inherits its parent size');
  const mono = flatten(AppText({ style: { fontFamily: 'monospace', fontSize: 10 } }).props.style);
  assert.equal(mono.fontSize, 14);
  assert.equal(mono.fontFamily, 'monospace');
  const icon = flatten(AppText({ style: { fontFamily: 'Ionicons', fontSize: 10, lineHeight: 12 } }).props.style);
  assert.equal(icon.fontSize, 10);
  assert.equal(icon.lineHeight, 12);
});

test('inputs and native fallback remain readable and system font scaling stays enabled', () => {
  const { AppText, AppTextInput } = typography(false);
  const text = AppText({ style: { fontSize: 11, fontWeight: '600' }, maxFontSizeMultiplier: 2 });
  assert.equal(flatten(text.props.style).fontSize, 14);
  assert.equal(text.props.maxFontSizeMultiplier, 2);
  const input = AppTextInput({ style: { fontSize: 12 }, multiline: true });
  assert.equal(flatten(input.props.style).fontSize, 14);
  assert.equal(input.props.allowFontScaling, true);
  assert.equal(input.props.textAlignVertical, 'top');
});

test('automatic fit cannot shrink app text below the readable minimum', () => {
  const { AppText } = typography();
  const caption = AppText({ style: { fontSize: 11 }, adjustsFontSizeToFit: true, minimumFontScale: 0.5 });
  assert.equal(caption.props.adjustsFontSizeToFit, false);
  const heading = AppText({ style: { fontSize: 20 }, adjustsFontSizeToFit: true, minimumFontScale: 0.5 });
  assert.equal(heading.props.adjustsFontSizeToFit, true);
  assert.equal(heading.props.minimumFontScale, 0.7);
});

test('compact counter badges retain their old metrics without reducing ordinary subtext', () => {
  for (const loaded of [true, false]) {
    const { AppText } = typography(loaded);
    for (const original of [{ fontSize: 9, fontWeight: '800' }, { fontSize: 10, lineHeight: 12, fontWeight: '900' }]) {
      const badge = AppText({ variant: 'badge', style: original, children: '99+' });
      const style = flatten(badge.props.style);
      assert.equal(style.fontSize, original.fontSize);
      assert.equal(style.lineHeight, original.lineHeight);
      assert.equal(badge.props.children, '99+');
      assert.equal(badge.props.allowFontScaling, true);
      assert.equal(badge.props.variant, undefined, 'the variant is not passed to native Text');
      assert.equal(flatten(AppText({ style: original }).props.style).fontSize, 14);
    }
  }
});

test('every Mobile screen and tab uses the shared text components', () => {
  for (const relative of fs.readdirSync(root, { recursive: true })) {
    if (!/\.(js|jsx)$/.test(relative) || relative === path.join('components', 'Typography.js')) continue;
    const ast = babel.parseSync(fs.readFileSync(path.join(root, relative), 'utf8'), {
      configFile: false, babelrc: false, parserOpts: { sourceType: 'module', plugins: ['jsx'] }
    });
    for (const node of ast.program.body) {
      if (node.type !== 'ImportDeclaration' || node.source.value !== 'react-native') continue;
      assert.equal(node.specifiers.some(item => ['Text', 'TextInput'].includes(item.imported?.name)), false, relative);
    }
  }
});
