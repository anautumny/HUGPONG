import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('the React application shell rejects unauthenticated route access', () => {
  const source = fs.readFileSync(new URL('../src/components/layout/AppShell.jsx', import.meta.url), 'utf8');
  assert.match(source, /if \(!isAuthenticated\)/);
  assert.match(source, /<Navigate to="\/login" replace state=\{\{ from: location \}\} \/>/);
});

test('all Web roles require a live connection and cannot restore authority from cached browser profiles', () => {
  const shellSource = fs.readFileSync(new URL('../src/components/layout/AppShell.jsx', import.meta.url), 'utf8');
  const authSource = fs.readFileSync(new URL('../src/context/AuthContext.jsx', import.meta.url), 'utf8');

  assert.match(shellSource, /const connectionBlocked = !isOnline \|\| sessionUnavailable/);
  assert.match(shellSource, /connectionBlocked && connectionPrompt/);
  assert.match(authSource, /response\.status === 401 \|\| response\.status === 403 \|\| response\.ok/);
  assert.doesNotMatch(authSource, /retaining cached session|localStorage\.getItem\('hugpong_user'\)/);
  assert.match(authSource, /setSessionUnavailable\(true\)/);
});

test('legacy compatibility routing remains outside the React component tree', () => {
  const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(appSource, /dashboard\.html/);
  assert.doesNotMatch(appSource, /core\.js/);
});
