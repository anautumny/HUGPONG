'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

test('the web application is one React/Vite/Tailwind SPA', () => {
  const packageJson = JSON.parse(read('web/react-app/package.json'));
  assert.ok(packageJson.dependencies.react);
  assert.ok(packageJson.dependencies['react-router-dom']);
  assert.ok(packageJson.dependencies.firebase);
  assert.ok(packageJson.dependencies['qrcode.react']);
  assert.ok(packageJson.dependencies['html5-qrcode']);
  assert.ok(packageJson.devDependencies.vite);
  assert.ok(packageJson.devDependencies.tailwindcss);
  assert.match(read('web/react-app/src/styles.css'), /@import "tailwindcss"/);
  assert.equal(fs.existsSync(path.join(repositoryRoot, 'web/react-app/index.html')), true);
});

test('React owns public, legal, auth, and guarded role routes', () => {
  const app = read('web/react-app/src/App.jsx');
  for (const route of ['/', '/login', '/privacy', '/terms', '/cookies', '/workspace/:workspace/:section?']) assert.ok(app.includes(`path="${route}"`), route);
  const login = read('web/react-app/src/pages/LoginPage.jsx');
  assert.match(login, /requestFirstLoginOtp/);
  assert.match(login, /verifyFirstLoginOtp/);
  assert.match(login, /completeFirstLoginPassword/);
  assert.doesNotMatch(login, /login\.html/);
  const workspace = read('web/react-app/src/pages/WorkspacePage.jsx');
  for (const section of ['UsersSection', 'FarmsSection', 'FieldsSection', 'OperationsSection', 'CyclesSection', 'PricesSection', 'ReportsSection', 'DiagnosticsSection', 'HistorySection', 'SupportSection', 'SettingsSection']) assert.match(workspace, new RegExp(section));
});

test('React uses focused auth, Firebase-read, replica, API, and role services', () => {
  const adapter = read('web/react-app/src/services/platformAdapter.js');
  const firebase = read('web/react-app/src/services/firebaseClient.js');
  const replica = read('web/react-app/src/services/replicaStore.js');
  const routing = read('web/react-app/src/services/roleRouting.js');
  assert.match(adapter, /apiRequest\('\/auth\/login'/);
  assert.match(adapter, /signInFirebase/);
  assert.match(adapter, /restoreSession/);
  assert.match(firebase, /signInWithCustomToken/);
  assert.match(firebase, /onSnapshot/);
  assert.doesNotMatch(firebase, /\b(?:setDoc|addDoc|updateDoc|deleteDoc|writeBatch)\s*\(/);
  assert.match(replica, /subscribeCollection/);
  assert.doesNotMatch(replica, /localOnly|upload/i);
  assert.match(routing, /\/workspace\/\$\{slug\}/);
  assert.doesNotMatch(routing, /dashboard\.html|DASHBOARD_PATHS|HugpongAuthRouting/);
});

test('React rendering modules do not write to Firestore or call fetch directly', () => {
  const folders = ['components', 'features', 'pages'];
  const renderingSource = folders.flatMap(folder => fs.readdirSync(path.join(repositoryRoot, 'web/react-app/src', folder)).filter(file => /\.jsx$/.test(file)).map(file => read(`web/react-app/src/${folder}/${file}`))).join('\n');
  assert.doesNotMatch(renderingSource, /\bfetch\s*\(/);
  assert.doesNotMatch(renderingSource, /\b(?:setDoc|updateDoc|addDoc|deleteDoc|writeBatch)\s*\(/);
});

test('Express serves the SPA at root after API routes and supports direct refresh', () => {
  const server = read('server/server.js');
  const apiIndex = server.indexOf("app.use('/auth'");
  const staticIndex = server.indexOf('app.use(express.static(reactWebDist))');
  assert.ok(apiIndex >= 0 && staticIndex > apiIndex);
  assert.match(server, /app\.get\('\*'/);
  assert.match(server, /res\.sendFile\(reactWebIndex\)/);
  assert.doesNotMatch(server, /express\.static\(path\.join\(__dirname, '\.\.\/web'\)\)/);
  assert.doesNotMatch(server, /app\.use\('\/app'/);
});
