'use strict';

const stageDefinitions = require('./cropStages.json');

const SUGARCANE_STAGES = Object.freeze(
  stageDefinitions.map(stage => Object.freeze({ ...stage }))
);
const CROP_STAGE_MIN = SUGARCANE_STAGES[0].stageNumber;
const CROP_STAGE_MAX = SUGARCANE_STAGES[SUGARCANE_STAGES.length - 1].stageNumber;

module.exports = {
  SUGARCANE_STAGES,
  CROP_STAGE_MIN,
  CROP_STAGE_MAX
};
