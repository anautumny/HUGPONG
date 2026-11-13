export const OPERATION_UNITS = Object.freeze(['HA', 'ton', 'laksa', 'bag', 'liter', 'pcs', 'strip', 'Sample', 'pass', 'trip']);

const ALIASES = Object.freeze({
  hectare: 'HA', hectares: 'HA', bags: 'bag',
  l: 'liter', liters: 'liter', litre: 'liter', litres: 'liter',
  tons: 'ton', tonne: 'ton', tonnes: 'ton', lac: 'laksa', lacsa: 'laksa',
  pc: 'pcs', 'pcs.': 'pcs', piece: 'pcs', pieces: 'pcs',
  strips: 'strip', samples: 'Sample', passes: 'pass', trips: 'trip'
});

export const canonicalOperationUnit = value => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const key = raw.toLowerCase();
  return OPERATION_UNITS.find(unit => unit.toLowerCase() === key)
    || (Object.prototype.hasOwnProperty.call(ALIASES, key) ? ALIASES[key] : null);
};

// Keep a saved retired value visible instead of silently displaying HA.
export const operationUnitOptions = selected => {
  const options = OPERATION_UNITS.map(unit => ({ value: unit, label: unit }));
  const raw = String(selected || '').trim();
  return raw && !canonicalOperationUnit(raw)
    ? [{ value: raw, label: `${raw} (previous unit)`, disabled: true }, ...options]
    : options;
};
