import test from 'node:test';
import assert from 'node:assert/strict';

import { uniqueRecordsById } from '../src/utils/recordOrdering.js';
import {
  isRecoverableModuleLoadError,
  recoverLatestWebBundle
} from '../src/utils/lazyWithRecovery.js';

test('web block-farm collections keep one newest canonical ID', () => {
  const older = { id: 'BF-CF0B82E817C300A47D7D', updatedAt: '2026-10-01T08:00:00.000Z', name: 'Older' };
  const newer = { id: 'bf-cf0b82e817c300a47d7d', updatedAt: '2026-10-01T09:00:00.000Z', name: 'Current' };
  const distinct = { id: 'BF-OTHER', updatedAt: '2026-10-01T07:00:00.000Z' };

  assert.deepEqual(uniqueRecordsById([older, null, newer, distinct]), [newer, distinct]);
  assert.deepEqual(uniqueRecordsById(null), []);
});

test('web stale module failures reload once instead of immediately opening the fatal screen', () => {
  const values = new Map();
  const replacements = [];
  globalThis.sessionStorage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
  globalThis.window = {
    location: {
      href: 'https://hugpong.test/audit',
      replace: value => replacements.push(value)
    }
  };

  const error = new TypeError('Failed to fetch dynamically imported module');
  assert.equal(isRecoverableModuleLoadError(error), true);
  assert.equal(recoverLatestWebBundle(error, 'audit-center'), true);
  assert.equal(replacements.length, 1);
  assert.match(replacements[0], /_hugpong_refresh=/);
  assert.equal(recoverLatestWebBundle(error, 'audit-center'), false);
  assert.equal(replacements.length, 1);

  delete globalThis.window;
  delete globalThis.sessionStorage;
});

