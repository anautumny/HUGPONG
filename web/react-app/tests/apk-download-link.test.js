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
  assert.match(landingSource, /href="https:\/\/github\.com\/anautumny\/HUGPONG\/releases"/);
  assert.match(landingSource, /GitHub Releases \(APK\)/);
});

test('main Android button downloads the exact verified release artifact directly', () => {
  const release = JSON.parse(fs.readFileSync(path.resolve(testDir, '../src/config/androidRelease.json'), 'utf8'));
  assert.match(release.downloadUrl, /^https:\/\/github\.com\/anautumny\/HUGPONG\/releases\/download\/[^/]+\/[^/]+\.apk$/);
  const declaration = landingSource.match(/^const ANDROID_APK_URL = .*;$/m)?.[0];
  assert.ok(declaration);
  const resolve = new Function('androidRelease', `${declaration}; return ANDROID_APK_URL;`);
  assert.equal(resolve(release), release.downloadUrl);
  assert.equal(resolve({ ...release, downloadUrl: '' }), '');
  const artifact = new URL(resolve(release));
  assert.equal(artifact.pathname, `/anautumny/HUGPONG/releases/download/v${release.version}/HUGPONG-${release.version}.apk`);
  assert.match(landingSource, /href=\{ANDROID_APK_URL\}/);
  assert.match(landingSource, /download=\{`HUGPONG-\$\{androidRelease\.version\}\.apk`\}/);
  assert.doesNotMatch(
    landingSource,
    /href="https:\/\/github\.com\/Mattaeeee\/HUGPONG\/releases"[\s\S]{0,300}Download Android APK/
  );
});
