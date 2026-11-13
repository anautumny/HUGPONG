'use strict';

const OPERATION_UNITS = Object.freeze(['HA', 'ton', 'laksa', 'bag', 'liter', 'pcs', 'strip', 'Sample', 'pass', 'trip']);

const ALIASES = Object.freeze({
  hectare: 'HA', hectares: 'HA', bags: 'bag',
  l: 'liter', liters: 'liter', litre: 'liter', litres: 'liter',
  tons: 'ton', tonne: 'ton', tonnes: 'ton', lac: 'laksa', lacsa: 'laksa',
  pc: 'pcs', 'pcs.': 'pcs', piece: 'pcs', pieces: 'pcs',
  strips: 'strip', samples: 'Sample', passes: 'pass', trips: 'trip'
});

function canonicalOperationUnit(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const direct = OPERATION_UNITS.find(unit => unit.toLowerCase() === raw.toLowerCase());
  const key = raw.toLowerCase();
  return direct || (Object.prototype.hasOwnProperty.call(ALIASES, key) ? ALIASES[key] : null);
}

module.exports = { OPERATION_UNITS, canonicalOperationUnit };
