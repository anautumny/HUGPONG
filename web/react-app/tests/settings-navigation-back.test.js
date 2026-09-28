import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('LegalViews Back button returns to previous page and does not force redirect to home', () => {
  const source = fs.readFileSync(new URL('../src/views/LegalViews.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /<Link[^>]*to="\/"[^>]*>[^<]*<ArrowLeft[^>]*>[^<]*<span>Back to Home<\/span>/);
  assert.match(source, /const handleBack/);
  assert.match(source, /location\.state\?\.from/);
  assert.match(source, /navigate\(-1\)/);
});

test('Sidebar profile popover preserves originating location when navigating to privacy or settings', () => {
  const source = fs.readFileSync(new URL('../src/components/layout/Sidebar.jsx', import.meta.url), 'utf8');
  assert.match(source, /navigate\('\/privacy',\s*\{\s*state:\s*\{\s*from:\s*location\.pathname\s*\}\s*\}\)/);
  assert.match(source, /navigate\('\/settings',\s*\{\s*state:\s*\{\s*from:\s*location\.pathname\s*\}\s*\}\)/);
});

test('SettingsView includes responsive desktop grid and matches max-w-7xl container consistency', () => {
  const source = fs.readFileSync(new URL('../src/views/settings/SettingsView.jsx', import.meta.url), 'utf8');
  assert.match(source, /max-w-7xl/);
  assert.match(source, /grid-cols-1 lg:grid-cols-12/);
  assert.match(source, /ProfileSettings/);
  assert.match(source, /SecuritySettings/);
  assert.match(source, /ThemePreferences/);
});
