'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('mobile bottom navigation bar uses CustomBottomTabBar with badges and accessibility', () => {
  const rootNav = read('mobile/src/navigation/RootNavigator.js');
  const customBar = read('mobile/src/components/CustomBottomTabBar.js');

  // RootNavigator integrates CustomBottomTabBar
  assert.match(rootNav, /import CustomBottomTabBar from '\.\.\/components\/CustomBottomTabBar'/);
  assert.match(rootNav, /tabBar=\{\(props\) => \(/);
  assert.match(rootNav, /<CustomBottomTabBar/);

  // CustomBottomTabBar provides agricultural iconography & localized labels
  assert.match(customBar, /activeIcon:\s*'leaf'/);
  assert.match(customBar, /activeIcon:\s*'calculator'/);
  assert.match(customBar, /translationKey:\s*'tab_field_ops'/);
  assert.match(customBar, /fallbackLabel:\s*'Operation'/);
  assert.match(customBar, /translationKey:\s*'tab_home'/);

  // Outbox pending sync badge
  assert.match(customBar, /getPendingSyncCount/);
  assert.match(customBar, /hasPendingSync/);
  assert.match(customBar, /syncBadge/);

  // Offline mode indicator and educational alert
  assert.match(customBar, /cloud-offline/);
  assert.match(customBar, /safeAlert/);

  // WCAG Accessibility
  assert.match(customBar, /accessibilityRole="tab"/);
  assert.match(customBar, /accessibilityState=\{\{ selected: isFocused, disabled: isTabDisabled \}\}/);
  assert.match(customBar, /accessibilityLabel=/);
});

test('web and mobile navigation maintain synchronous parity on mobile viewports', () => {
  const appShell = read('web/react-app/src/components/layout/AppShell.jsx');
  const webBottomNav = read('web/react-app/src/components/layout/MobileBottomNav.jsx');

  // AppShell integrates MobileBottomNav with safe padding
  assert.match(appShell, /import MobileBottomNav from '\.\/MobileBottomNav'/);
  assert.match(appShell, /<MobileBottomNav onOpenMobileDrawer=/);
  assert.match(appShell, /pb-20 lg:pb-6/);

  // Web mobile nav implements role-specific navigation and drawer launcher
  assert.match(webBottomNav, /ROLE_KEYS\.FARM_MANAGER/);
  assert.match(webBottomNav, /ROLE_KEYS\.SRA_ADMIN/);
  assert.match(webBottomNav, /label:\s*'Operation'/);
  assert.match(webBottomNav, /to: '\/operations'/);
  assert.match(webBottomNav, /to: '\/dashboard'/);
  assert.match(webBottomNav, /onOpenMobileDrawer/);
  assert.match(webBottomNav, /aria-label="Mobile Bottom Navigation"/);
});
