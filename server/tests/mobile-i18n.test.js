'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

function translationDictionaries() {
  const source = read('mobile/src/services/i18n.js');
  const marker = 'export const TRANSLATIONS = ';
  const start = source.indexOf(marker) + marker.length;
  const initializationDocs = source.indexOf('/**', start);
  const end = source.lastIndexOf('};', initializationDocs) + 1;
  assert.ok(start >= marker.length && end > start, 'translation object must be extractable');
  return vm.runInNewContext(`(${source.slice(start, end)})`, Object.create(null));
}

function mobileJavaScriptFiles(directory = path.join(root, 'mobile', 'src')) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return mobileJavaScriptFiles(target);
    return /\.[jt]sx?$/.test(entry.name) ? [target] : [];
  });
}

test('mobile English, Filipino, and Hiligaynon dictionaries have exact key parity', () => {
  const dictionaries = translationDictionaries();
  const englishKeys = Object.keys(dictionaries.en).sort();

  assert.ok(englishKeys.length >= 1000, 'the production mobile surfaces should have broad translation coverage');
  assert.deepEqual(Object.keys(dictionaries.tl).sort(), englishKeys);
  assert.deepEqual(Object.keys(dictionaries.hil).sort(), englishKeys);

  for (const language of ['en', 'tl', 'hil']) {
    for (const key of englishKeys) {
      assert.equal(typeof dictionaries[language][key], 'string', `${language}.${key} must be text`);
      assert.notEqual(dictionaries[language][key].trim(), '', `${language}.${key} must not be blank`);
    }
  }
});

test('every literal mobile translation lookup resolves in all languages', () => {
  const dictionaries = translationDictionaries();
  const lookupPattern = /\bt\(\s*['"]([^'"]+)['"]/g;
  const missing = [];

  for (const filename of mobileJavaScriptFiles()) {
    const source = fs.readFileSync(filename, 'utf8');
    for (const match of source.matchAll(lookupPattern)) {
      for (const language of ['en', 'tl', 'hil']) {
        if (!Object.hasOwn(dictionaries[language], match[1])) {
          missing.push(`${path.relative(root, filename)}: ${language}.${match[1]}`);
        }
      }
    }
  }

  assert.deepEqual(missing, []);
});

test('language persistence and long-label layouts are guarded against regressions', () => {
  const service = read('mobile/src/services/i18n.js');
  const selector = read('mobile/src/screens/auth/LanguageSelectScreen.js');
  const bottomTabs = read('mobile/src/components/CustomBottomTabBar.js');
  const planner = read('mobile/src/screens/PlannerScreen.js');
  const syncMonitor = read('mobile/src/screens/SyncMonitorScreen.js');
  const profile = read('mobile/src/screens/ProfileScreen.js');
  const liveQrScanner = read('mobile/src/components/LiveQRScanner.js');
  const home = read('mobile/src/screens/HomeScreen.js');
  const sraHome = read('mobile/src/screens/sra/SRAHomeView.js');
  const memberHome = read('mobile/src/screens/member/MemberHomeView.js');
  const managerHome = read('mobile/src/screens/manager/ManagerHomeView.js');
  const login = read('mobile/src/screens/auth/LoginScreen.js');

  assert.match(service, /initializeLanguage\(\)\.then\(setLang\)/);
  assert.match(service, /tab_profile:\s*'Profayl'/);
  assert.match(selector, /await setLanguage\(selected\)/);
  assert.match(selector, /flexWrap:\s*'wrap'/);
  assert.match(selector, /minWidth:\s*0/);
  assert.match(bottomTabs, /numberOfLines=\{2\}/);
  assert.match(bottomTabs, /minHeight:\s*26/);
  assert.match(planner, /useTranslation\(\)/);
  assert.match(syncMonitor, /useTranslation\(\)/);
  assert.match(profile, /t\('ticket_tab_history',\s*'History'\)/);
  assert.match(profile, /numberOfLines=\{2\}[\s\S]*?minimumFontScale=\{0\.78\}/);
  assert.match(profile, /ticketTabBtn:\s*\{[^}]*minWidth:\s*0/);
  assert.doesNotMatch(profile, />\s*History\s*</);
  assert.match(liveQrScanner, /useTranslation\(\)/);
  assert.match(liveQrScanner, /t\('qr_upload_image',\s*'Upload QR Image'\)/);
  assert.doesNotMatch(liveQrScanner, />\s*Upload QR Image\s*</);
  assert.match(home, /t\('cloud_device_sync',\s*'Cloud & Device Sync'\)/);
  assert.match(home, /t\('post_official_price'/);
  assert.match(sraHome, /sectionTitleWrap:\s*\{\s*flex:\s*1\s*\}/);
  assert.match(sraHome, /adjustsFontSizeToFit[\s\S]*?minimumFontScale=\{0\.75\}/);
  assert.match(sraHome, /t\('sra_admin',\s*'SRA Admin'\)/);
  assert.match(memberHome, /t\('no_plot_allocated'/);
  assert.match(memberHome, /t\('awaiting_plot_assignment'/);
  assert.match(memberHome, /fieldCardLeft:\s*\{[^}]*flex:\s*1/);
  assert.match(memberHome, /fieldTitleRow:\s*\{[^}]*flexWrap:\s*'wrap'/);
  assert.match(memberHome, /haBadge:\s*\{[^}]*flexShrink:\s*0/);
  assert.match(memberHome, /formatStageName/);
  assert.match(managerHome, /t\('manager_workspace_eyebrow'/);
  assert.match(managerHome, /formatOperationName/);
  assert.match(managerHome, /t\('manager_no_active_cycles'/);
  assert.match(managerHome, /t\('member_activity_status'/);
  assert.match(login, /flexWrap:\s*'wrap'/);
});

