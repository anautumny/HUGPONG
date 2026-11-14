import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { transformSync } from 'esbuild';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const dom = new JSDOM('<!doctype html><div id="root"></div>');
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
after(() => { dom.window.close(); delete globalThis.window; delete globalThis.document; delete globalThis.IS_REACT_ACT_ENVIRONMENT; });
const source = fs.readFileSync(new URL('../src/components/audit/QRCodeView.jsx', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace('export default function', 'function');
const compiled = transformSync(source, { loader: 'jsx', format: 'cjs' }).code;

test('QR preview hides the old report immediately and ignores late generation results and failures', async () => {
  const pending = [], diagnostics = [];
  const QRCodeView = vm.runInNewContext(compiled + '\nQRCodeView;', {
    React, useEffect: React.useEffect, useState: React.useState,
    QRCode: { toString: payload => new Promise((resolve, reject) => pending.push({ payload, resolve, reject })) },
    createClientReference: () => 'LOCAL-QR-REFERENCE', reportClientDiagnostic: event => { diagnostics.push(event); return Promise.resolve(); }
  });
  const root = createRoot(document.getElementById('root'));
  const render = async value => act(async () => root.render(React.createElement(QRCodeView, { value })));
  const svg = value => `<svg data-report="${value}"><text>${value}</text></svg>`;
  try {
    await render('REPORT-A'); assert.match(document.body.textContent, /Loading QR/);
    await render('REPORT-B');
    await act(async () => pending[1].resolve(svg('B')));
    assert.equal(document.querySelector('svg').dataset.report, 'B');
    await act(async () => pending[0].resolve(svg('A')));
    assert.equal(document.querySelector('svg').dataset.report, 'B', 'late A cannot replace selected B');
    await render('REPORT-C');
    assert.equal(document.querySelector('svg'), null, 'previous report is hidden while the new QR loads');
    assert.ok(document.querySelector('[role=status]'));
    await render('REPORT-D');
    await act(async () => pending[2].reject(new Error('Old C failed')));
    assert.equal(diagnostics.length, 0, 'old error cannot replace current report or send a misleading diagnostic');
    await act(async () => pending[3].resolve(svg('D')));
    assert.equal(document.querySelector('svg').dataset.report, 'D');
    await render('REPORT-B');
    assert.equal(document.querySelector('svg'), null);
    await act(async () => pending[4].resolve(svg('B-new')));
    assert.equal(document.querySelector('svg').dataset.report, 'B-new');
    await render('REPORT-E');
    await act(async () => pending[5].reject(new Error('Selected QR failed')));
    assert.match(document.body.textContent, /QR could not be generated/); assert.equal(diagnostics.length, 1);
    await render('REPORT-F');
    await act(async () => root.unmount());
    await act(async () => pending[6].reject(new Error('After unmount')));
    assert.equal(diagnostics.length, 1);
  } finally { if (document.getElementById('root')?.firstChild) await act(async () => root.unmount()); }
});
