const stageDefinitions = require('./cropStages.json');

export const SUGARCANE_STAGES = Object.freeze(
  stageDefinitions.map(stage => Object.freeze({ ...stage }))
);
export const CROP_STAGE_MIN = SUGARCANE_STAGES[0].stageNumber;
export const CROP_STAGE_MAX = SUGARCANE_STAGES[SUGARCANE_STAGES.length - 1].stageNumber;

export const INITIAL_CROP_STAGES = Object.freeze(
  SUGARCANE_STAGES.map(stage => Object.freeze({
    number: stage.stageNumber,
    name: stage.name.replace(/^Stage \d+:\s*/, ''),
    label: stage.name
  }))
);
