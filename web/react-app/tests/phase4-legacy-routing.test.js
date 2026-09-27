import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('the React application shell rejects unauthenticated route access', () => {
  const source = fs.readFileSync(new URL('../src/components/layout/AppShell.jsx', import.meta.url), 'utf8');
  assert.match(source, /if \(!isAuthenticated\)/);
  assert.match(source, /<Navigate to="\/login" replace state=\{\{ from: location \}\} \/>/);
});

test('SRA web sessions degrade offline without being treated as logged out', () => {
  const shellSource = fs.readFileSync(new URL('../src/components/layout/AppShell.jsx', import.meta.url), 'utf8');
  const authSource = fs.readFileSync(new URL('../src/context/AuthContext.jsx', import.meta.url), 'utf8');

  assert.match(shellSource, /!isOnline && roleKey === ROLE_KEYS\.SRA_ADMIN/);
  assert.match(shellSource, /No internet connection\. You remain signed in/);
  assert.match(authSource, /response\.status === 401 \|\| response\.status === 403 \|\| response\.ok/);
  assert.match(authSource, /retaining cached session/);
});

test('legacy compatibility routing remains outside the React component tree', () => {
  const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(appSource, /dashboard\.html/);
  assert.doesNotMatch(appSource, /core\.js/);
});
