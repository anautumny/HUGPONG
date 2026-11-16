import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { buildSync } from 'esbuild';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://hugpong.test/operations' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { act, createElement: h } = React;
const { createRoot } = await import('react-dom/client');
const directory = path.dirname(fileURLToPath(import.meta.url));
const compiledDirectory = fs.mkdtempSync(path.resolve(directory, '../node_modules/.cache-confirmation-test-'));
const compiled = path.join(compiledDirectory, 'confirmation.mjs');
buildSync({ entryPoints: [path.resolve(directory, '../src/components/ui/useConfirmation.jsx')],
  bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: compiled });
const { default: useConfirmation } = await import(pathToFileURL(compiled));
after(() => {
  dom.window.close();
  delete globalThis.window; delete globalThis.document; delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  assert.equal(path.dirname(compiledDirectory), path.resolve(directory, '../node_modules'));
  fs.rmSync(compiledDirectory, { recursive: true, force: true });
});

const settings = { title: 'Complete Stage 2?',
  message: 'Mark Stage 2 as complete for Field FLD-1 and make Stage 3 available?',
  confirmText: 'Complete Stage', type: 'primary' };
async function scenario(run) {
  let ask;
  const root = createRoot(document.getElementById('root'));
  function Harness({ owner }) {
    const [request, dialog] = useConfirmation(owner);
    ask = request;
    return h(React.Fragment, null, h('button', { id: 'open' }, 'Stage action'), dialog);
  }
  const render = owner => act(async () => root.render(h(Harness, { owner })));
  const owner = { employeeId: 'FM-1', canonicalRole: 'FARM_MANAGER', authVersion: 1 };
  await render(owner);
  try { await run({ request: (...args) => ask(...args), render, owner, root }); }
  finally { await act(async () => root.unmount()); }
}

test('confirm dialog blocks the action until explicit confirmation and cancel preserves the record', async () => {
  await scenario(async ({ request }) => {
    let mutations = 0, task;
    const action = async () => { if (await request(settings)) mutations++; };
    await act(async () => { task = action(); });
    const dialog = document.querySelector('[role="dialog"]');
    assert.ok(dialog); assert.equal(mutations, 0);
    assert.equal(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent, settings.title);
    assert.equal(document.getElementById(dialog.getAttribute('aria-describedby')).textContent, settings.message);
    const buttons = [...dialog.querySelectorAll('button')];
    assert.deepEqual(buttons.map(button => button.textContent.trim()), ['Cancel', 'Complete Stage']);
    await act(async () => buttons[0].click()); await task;
    assert.equal(mutations, 0); assert.equal(document.querySelector('[role="dialog"]'), null);
    await act(async () => { task = action(); });
    const confirm = [...document.querySelectorAll('[role="dialog"] button')].at(-1);
    await act(async () => { confirm.click(); confirm.click(); }); await task;
    assert.equal(mutations, 1, 'double confirmation cannot commit twice');
  });
});

test('Escape cancels and an account or authorization change invalidates an open confirmation', async () => {
  await scenario(async ({ request, render, owner }) => {
    let result;
    await act(async () => { request(settings).then(value => { result = value; }); });
    await act(async () => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(result, false);
    for (const changed of [{ ...owner, employeeId: 'FM-2' }, { ...owner, authVersion: 2 }]) {
      await render(owner); result = undefined;
      await act(async () => { request(settings).then(value => { result = value; }); });
      await render(changed);
      assert.equal(result, false); assert.equal(document.querySelector('[role="dialog"]'), null);
    }
  });
});

test('a replaced confirmation cancels its old action and navigation cancels the pending action', async () => {
  await scenario(async ({ request, root }) => {
    let first, second;
    await act(async () => { request(settings).then(value => { first = value; }); });
    const staleButton = [...document.querySelectorAll('[role="dialog"] button')].at(-1);
    await act(async () => { request({ ...settings, title: 'Different action?' }).then(value => { second = value; }); });
    assert.equal(first, false);
    await act(async () => staleButton.click());
    assert.equal(second, undefined);
    await act(async () => root.render(h('p', null, 'Another page')));
    assert.equal(second, false); assert.equal(document.querySelector('[role="dialog"]'), null);
  });
});

test('web confirmation actions use the shared dialog instead of native browser confirms', () => {
  for (const file of ['views/operations/OperationsView.jsx', 'components/users/RecoveryReviewQueue.jsx', 'components/layout/NotificationBell.jsx']) {
    const source = fs.readFileSync(path.resolve(directory, '../src', file), 'utf8');
    assert.doesNotMatch(source, /window\.confirm\s*\(/);
    assert.match(source, /await requestConfirmation\(/);
    assert.match(source, /\{confirmationDialog\}/);
  }
});
