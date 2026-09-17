'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

test('React rendering delegates authentication, data access, and mutations to services', () => {
  const workspace = read('web/react-app/src/pages/WorkspacePage.jsx');
  const domainApi = read('web/react-app/src/services/domainApi.js');
  const replica = read('web/react-app/src/services/replicaStore.js');
  const platform = read('web/react-app/src/services/platformAdapter.js');
  assert.match(workspace, /features\/OperationsSections/);
  assert.match(workspace, /features\/RegulatorySections/);
  assert.match(workspace, /features\/RegistrySections/);
  assert.match(workspace, /features\/SystemSections/);
  assert.match(domainApi, /apiRequest/);
  assert.match(replica, /subscribeCollection/);
  assert.match(platform, /activateSession/);
  assert.doesNotMatch(workspace, /\bfetch\s*\(|onSnapshot\s*\(/);
});

test('mobile store delegates pure rules to a domain module', () => {
  const store = read('mobile/src/data/dataStore.js');
  const rules = read('mobile/src/domain/dataRules.js');
  assert.match(store, /from '\.\.\/domain\/dataRules'/);
  assert.match(store, /export const cleanupDuplicateLogs = cleanupDuplicateLogsRule/);
  assert.match(rules, /export function generateNextFieldId/);
  assert.match(rules, /export function findUserByIdOrContact/);
});

test('FieldOps screen composes domain, component, and style modules', () => {
  const screen = read('mobile/src/screens/FieldOpsScreen.js');
  const domain = read('mobile/src/domain/fieldOperations.js');
  assert.match(screen, /from '\.\.\/domain\/fieldOperations'/);
  assert.match(screen, /from '\.\.\/components\/field-ops\/CompactLogItem'/);
  assert.match(screen, /from '\.\/fieldOpsStyles'/);
  assert.doesNotMatch(read('mobile/src/data/dataStore.js'), /export const SRA_OPERATIONS_CATALOGUE\s*=/);
  assert.doesNotMatch(screen, /const CROP_CYCLE_STAGES_BY_TYPE\s*=/);
  assert.doesNotMatch(screen, /const CompactLogItem\s*=/);
  assert.doesNotMatch(screen, /StyleSheet\.create\(/);
  assert.match(domain, /export const CROP_CYCLE_STAGES_BY_TYPE/);
  assert.match(domain, /export const SRA_OPERATIONS_CATALOGUE/);
  assert.match(domain, /export const getFieldStages/);
});
