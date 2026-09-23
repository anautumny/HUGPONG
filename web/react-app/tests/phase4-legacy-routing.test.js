import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('the React application shell rejects unauthenticated route access', () => {
  const source = fs.readFileSync(new URL('../src/components/layout/AppShell.jsx', import.meta.url), 'utf8');
  assert.match(source, /if \(!isAuthenticated\)/);
  assert.match(source, /<Navigate to="\/login" replace state=\{\{ from: location \}\} \/>/);
});

test('legacy compatibility routing remains outside the React component tree', () => {
  const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(appSource, /dashboard\.html/);
  assert.doesNotMatch(appSource, /core\.js/);
});
