'use strict';

const OPERATION_UNITS = Object.freeze(['ha', 'm²', 'bag', 'kg', 'L', 'ton', 'lac', 'pass', 'day', 'worker', 'trip']);

const ALIASES = Object.freeze({
  hectare: 'ha', hectares: 'ha', bags: 'bag', kilograms: 'kg', kilogram: 'kg',
  liter: 'L', liters: 'L', litre: 'L', litres: 'L', tons: 'ton', tonne: 'ton', tonnes: 'ton',
  sqm: 'm²', 'm2': 'm²', lacsa: 'lac', days: 'day', pax: 'worker', workers: 'worker', trips: 'trip'
});

function canonicalOperationUnit(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const direct = OPERATION_UNITS.find(unit => unit.toLowerCase() === raw.toLowerCase());
  return direct || ALIASES[raw.toLowerCase()] || null;
}

module.exports = { OPERATION_UNITS, canonicalOperationUnit };
