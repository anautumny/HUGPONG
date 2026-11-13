import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { buildSync } from 'esbuild';

// Execute the real React DOM/router and page boundary with a deliberately
// unresolved module. No API, account, or business records are involved.
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://hugpong.test/prices' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
after(() => { dom.window.close(); delete globalThis.window; delete globalThis.document; delete globalThis.IS_REACT_ACT_ENVIRONMENT; });
const React = await import('react');
const { act, createElement: h, useEffect } = React;
const { createRoot } = await import('react-dom/client');
const { BrowserRouter, Routes, Route, Link, Outlet } = await import('react-router-dom');
const { lazyWithRecovery, preloadRouteModule } = await import('../src/utils/lazyWithRecovery.js');
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const buildDirectory = fs.mkdtempSync(path.resolve(testDirectory, '../node_modules/.cache-route-test-'));
const compiled = path.join(buildDirectory, 'route-content.mjs');
buildSync({ entryPoints: [path.resolve(testDirectory, '../src/components/layout/RouteContent.jsx')],
  bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: compiled });
const { default: RouteContent } = await import(pathToFileURL(compiled));
after(() => {
  assert.equal(path.dirname(buildDirectory), path.resolve(testDirectory, '../node_modules'));
  fs.rmSync(buildDirectory, { recursive: true, force: true });
});

async function navigationScenario(run) {
  window.history.replaceState(null, '', '/prices');
  const root = createRoot(document.getElementById('root'));
  let resolveFields, loads = 0, shellMounts = 0, fieldMounts = 0;
  const fieldsReady = new Promise(resolve => { resolveFields = resolve; });
  const Fields = lazyWithRecovery(() => { loads++; return fieldsReady; }, 'navigation-test', ['/navigation-test-fields']);
  function FieldPage() {
    useEffect(() => { fieldMounts++; }, []);
    return h('section', { 'data-page': 'fields' }, 'Field registry');
  }
  function Shell() {
    useEffect(() => { shellMounts++; }, []);
    return h(React.Fragment, null,
      h('aside', null,
        h(Link, { to: '/fields', id: 'fields-link' }, 'Fields'),
        h(Link, { to: '/prices', id: 'prices-link' }, 'Prices'),
        h(Link, { to: '/settings', id: 'settings-link' }, 'Settings'),
        h(Link, { to: '/fields?tab=blocks', id: 'filter-link' }, 'Change registry tab')),
      h('main', null, h(RouteContent, null, h(Outlet))));
  }
  const click = async id => act(async () => document.getElementById(id).dispatchEvent(new window.MouseEvent('click', { bubbles: true, button: 0 })));
  try {
    await act(async () => root.render(h(BrowserRouter, null, h(Routes, null,
      h(Route, { element: h(Shell) },
        h(Route, { path: '/prices', element: h('section', { 'data-page': 'prices' }, 'Price monitor') }),
        h(Route, { path: '/fields', element: h(Fields) }),
        h(Route, { path: '/settings', element: h('section', { 'data-page': 'settings' }, 'Settings page') }))))));
    await run({ click, finish: async () => act(async () => resolveFields({ default: FieldPage })),
      loads: () => loads, shellMounts: () => shellMounts, fieldMounts: () => fieldMounts });
  } finally { await act(async () => root.unmount()); }
}

test('cold route navigation immediately displays a loading state, replaces the old page, and preserves the shell', async () => {
  await navigationScenario(async ({ click, finish, loads, shellMounts, fieldMounts }) => {
    const sidebar = document.querySelector('aside');
    await click('fields-link');
    assert.equal(window.location.pathname, '/fields');
    assert.match(document.querySelector('[role="status"]').textContent, /Loading page/);
    assert.equal(document.querySelector('[data-page="prices"]'), null, 'old page must not remain under the new URL');
    assert.equal(document.querySelector('aside'), sidebar);
    assert.equal(shellMounts(), 1, 'navigation listeners and shell remain mounted');
    await finish();
    assert.ok(document.querySelector('[data-page="fields"]'));
    assert.equal(document.querySelector('[role="status"]'), null);
    await click('filter-link');
    assert.equal(fieldMounts(), 1, 'query/filter updates do not reset the page');
    await click('prices-link');
    await click('fields-link');
    assert.ok(document.querySelector('[data-page="fields"]'));
    assert.equal(document.querySelector('[role="status"]'), null, 'a cached route opens without an artificial delay');
    assert.equal(loads(), 1);
  });
});

test('a late route module cannot replace a more recent navigation', async () => {
  await navigationScenario(async ({ click, finish }) => {
    await click('fields-link');
    await click('settings-link');
    assert.equal(window.location.pathname, '/settings');
    await finish();
    assert.ok(document.querySelector('[data-page="settings"]'));
    assert.equal(document.querySelector('[data-page="fields"]'), null);
  });
});

test('hover/focus preload shares the navigation module promise instead of loading it twice', async () => {
  await navigationScenario(async ({ click, finish, loads }) => {
    const first = preloadRouteModule('/navigation-test-fields');
    const second = preloadRouteModule('/navigation-test-fields?tab=fields');
    await Promise.resolve();
    assert.equal(loads(), 1);
    await click('fields-link');
    await finish();
    await Promise.all([first, second]);
    assert.equal(loads(), 1);
    assert.ok(document.querySelector('[data-page="fields"]'));
  });
});

test('speculative import errors do not reload the page and can be retried', async () => {
  let attempts = 0;
  const previousUrl = window.location.href;
  lazyWithRecovery(async () => {
    if (++attempts === 1) throw new TypeError('Failed to fetch dynamically imported module');
    return { default: () => null };
  }, 'preload-error', ['/preload-error']);
  await preloadRouteModule('/preload-error');
  assert.equal(window.location.href, previousUrl);
  await preloadRouteModule('/preload-error');
  assert.equal(attempts, 2);
});

test('intent preloads respect offline, data-saver and slow connections', async () => {
  let loads = 0;
  lazyWithRecovery(async () => { loads++; return { default: () => null }; }, 'restricted-preload', ['/restricted-preload']);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    for (const network of [{ onLine: false }, { onLine: true, connection: { saveData: true } }, { onLine: true, connection: { effectiveType: '2g' } }]) {
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: network });
      await preloadRouteModule('/restricted-preload');
    }
    assert.equal(loads, 0);
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
    await preloadRouteModule('/restricted-preload');
    assert.equal(loads, 1);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else delete globalThis.navigator;
  }
});
