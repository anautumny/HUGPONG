import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const landingSource = fs.readFileSync(
  path.resolve(testDir, '../src/views/LandingView.jsx'),
  'utf8'
);

test('landing header keeps the GitHub Releases link', () => {
  assert.match(landingSource, /href="https:\/\/github\.com\/Mattaeeee\/HUGPONG\/releases"/);
  assert.match(landingSource, /GitHub Releases \(APK\)/);
});

test('main Android button uses the separately configured APK artifact URL', () => {
  assert.match(landingSource, /VITE_ANDROID_APK_URL/);
  assert.match(landingSource, /href=\{ANDROID_APK_URL\}/);
  assert.match(landingSource, /download="HUGPONG-Beta\.apk"/);
  assert.doesNotMatch(
    landingSource,
    /href="https:\/\/github\.com\/Mattaeeee\/HUGPONG\/releases"[\s\S]{0,300}Download Android APK/
  );
});
