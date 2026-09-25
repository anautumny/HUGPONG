const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readJson = relativePath => JSON.parse(read(relativePath));

test('web and mobile publish the same privacy, terms, compliance, and storage policy', () => {
  const webPolicy = readJson('web/react-app/src/domain/legalPolicy.json');
  const mobilePolicy = readJson('mobile/src/domain/legalPolicy.json');

  assert.deepEqual(mobilePolicy, webPolicy);
  assert.match(webPolicy.version, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(webPolicy.privacy.sections.length >= 5);
  assert.ok(webPolicy.terms.sections.length >= 4);
  assert.ok(webPolicy.compliance.sections.length >= 4);
});

test('legal surfaces do not publish the removed unsupported claims or fabricated DPO contact', () => {
  const sources = [
    'web/react-app/src/views/LegalViews.jsx',
    'web/react-app/src/views/LoginView.jsx',
    'web/react-app/src/views/LandingView.jsx',
    'mobile/src/screens/ProfileScreen.js',
    'mobile/src/screens/auth/LoginScreen.js',
    'mobile/src/components/LegalPolicyModal.js',
  ].map(read).join('\n');

  assert.doesNotMatch(sources, /dpo@hugpong\.ph|\(034\) 495-0123/i);
  assert.doesNotMatch(sources, /SRA Certified (?:Agricultural )?Gateway/i);
  assert.doesNotMatch(sources, /on-device encrypted storage/i);
  assert.doesNotMatch(sources, /official digital governance/i);
  assert.doesNotMatch(sources, /strict compliance with Republic Act/i);
});

test('both clients expose the current compliance document', () => {
  const app = read('web/react-app/src/App.jsx');
  const legalViews = read('web/react-app/src/views/LegalViews.jsx');
  const mobileModal = read('mobile/src/components/LegalPolicyModal.js');

  assert.match(app, /path="\/compliance"/);
  assert.match(legalViews, /legalPolicy\.compliance/);
  assert.match(mobileModal, /key: 'compliance'/);
  assert.match(mobileModal, /legalPolicy\[activeDocument\]/);
  assert.match(mobileModal, /SafeAreaView \} from 'react-native-safe-area-context'/);
  assert.doesNotMatch(mobileModal, /\{[^}]*SafeAreaView[^}]*\} from 'react-native'/);
});
