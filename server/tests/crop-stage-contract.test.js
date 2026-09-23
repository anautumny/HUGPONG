'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const serverStages = require('../domain/cropStages.json');
const webStages = require('../../web/react-app/src/constants/cropStages.json');
const mobileStages = require('../../mobile/src/constants/cropStages.json');
const {
  SUGARCANE_STAGES,
  CROP_STAGE_MIN,
  CROP_STAGE_MAX
} = require('../domain/cropStages');

test('web, Android mobile, and server expose the same six-stage contract', () => {
  assert.deepEqual(webStages, serverStages);
  assert.deepEqual(mobileStages, serverStages);
  assert.equal(serverStages.length, 6);
  assert.deepEqual(serverStages.map(stage => stage.stageNumber), [1, 2, 3, 4, 5, 6]);
});

test('server stage bounds are derived from the canonical stage definitions', () => {
  assert.equal(CROP_STAGE_MIN, 1);
  assert.equal(CROP_STAGE_MAX, 6);
  assert.equal(SUGARCANE_STAGES.length, CROP_STAGE_MAX - CROP_STAGE_MIN + 1);
  assert.ok(Object.isFrozen(SUGARCANE_STAGES));
  assert.ok(SUGARCANE_STAGES.every(Object.isFrozen));
});
