'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const mobileDomainPath = path.join(root, 'mobile', 'src', 'domain', 'plannerNotifications.js');

test('planner reminder rules remain Mobile-only', () => {
  const mobileSource = fs.readFileSync(mobileDomainPath, 'utf8');
  const topbar = fs.readFileSync(path.join(root, 'web', 'react-app', 'src', 'components', 'layout', 'Topbar.jsx'), 'utf8');
  assert.match(mobileSource, /today:/);
  assert.match(mobileSource, /tomorrow:/);
  assert.match(mobileSource, /overdue:/);
  assert.doesNotMatch(topbar, /Planning reminders|plannerNotifications|plannerReminder/);
});

test('native planner reminders are local, grouped, navigable, and automatically replace stale schedules', () => {
  const service = fs.readFileSync(path.join(root, 'mobile', 'src', 'services', 'plannerNotificationService.js'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'mobile', 'App.js'), 'utf8');
  assert.match(service, /getAllScheduledNotificationsAsync/);
  assert.match(service, /cancelScheduledNotificationAsync/);
  assert.match(service, /Farm work planned tomorrow/);
  assert.match(service, /Farm work scheduled today/);
  assert.match(app, /selectedDate: data\.plannedDate/);
});

test('Expo Go skips notification module initialization while native builds retain reminders', () => {
  const service = fs.readFileSync(path.join(root, 'mobile', 'src', 'services', 'plannerNotificationService.js'), 'utf8');
  assert.doesNotMatch(service, /import \* as Notifications from 'expo-notifications'/);
  assert.match(service, /Constants\.appOwnership === 'expo'/);
  assert.match(service, /if \(isExpoGo\) return null/);
  assert.match(service, /require\('expo-notifications'\)/);
  assert.match(service, /reason: 'EXPO_GO'/);
});
