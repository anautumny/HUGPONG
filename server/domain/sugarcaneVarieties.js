'use strict';

const SUGARCANE_VARIETIES = Object.freeze([
  'PHIL 2006-2289',
  'PHIL 2006-1899',
  'PHIL 2005-1763',
  'PHIL 2005-0483',
  'PHIL 2005-0055',
  'PHIL 2003-1727',
  'PHIL 2003-0021',
  'PHIL 2002-0421',
  'PHIL 2000-2417',
  'PHIL 2000-2155',
  'PHIL 2000-1419',
  'PHIL 99-0925',
  'PHIL 2005-1197',
  'PHIL 2005-0645',
  'PHIL 2004-1011',
  'PHIL 2004-0827',
  'PHIL 2003-1389',
  'PHIL 2002-0359',
  'PHIL 2001-0295',
  'PHIL 2000-2569',
  'PHIL 2000-0791',
  'PHIL 99-2641',
  'PHIL 99-1427',
  'PHIL 99-1793',
  'PHIL 97-2041',
  'PHIL 97-1123',
  'PHIL 97-0693'
]);

const SUGARCANE_VARIETY_BY_NORMALIZED_VALUE = new Map(
  SUGARCANE_VARIETIES.map(value => [value.toUpperCase(), value])
);

function canonicalSugarcaneVariety(value) {
  return SUGARCANE_VARIETY_BY_NORMALIZED_VALUE.get(String(value || '').trim().toUpperCase()) || null;
}

module.exports = {
  SUGARCANE_VARIETIES,
  canonicalSugarcaneVariety
};
