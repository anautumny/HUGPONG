const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function requiredText(value, field) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${field} is required.`);
  return text;
}

function requiredNumber(value, field) {
  if (value === '' || value === null || value === undefined) throw new Error(`${field} is required.`);
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${field} must be a finite number.`);
  return number;
}

export function calendarDate(value) {
  const text = requiredText(value, 'effectiveDate');
  if (!DATE_PATTERN.test(text)) throw new Error('effectiveDate must use YYYY-MM-DD.');
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('effectiveDate must be a valid calendar date.');
  return text;
}

export function buildPricePayload(data, previous = null) {
  const sugar = requiredNumber(data.sugarPricePerLkg, 'sugarPricePerLkg');
  const molasses = requiredNumber(data.molassesPricePerMetricTon, 'molassesPricePerMetricTon');
  const previousSugar = previous ? requiredNumber(previous.sugarPricePerLkg, 'previous.sugarPricePerLkg') : sugar;
  const previousMolasses = previous ? requiredNumber(previous.molassesPricePerMetricTon, 'previous.molassesPricePerMetricTon') : molasses;
  return {
    ...(data.id ? { id: requiredText(data.id, 'id') } : {}),
    effectiveDate: calendarDate(data.effectiveDate),
    weekLabel: requiredText(data.weekLabel, 'weekLabel'),
    sugarPricePerLkg: sugar,
    sugarPriceChange: sugar - previousSugar,
    molassesPricePerMetricTon: molasses,
    molassesPriceChange: molasses - previousMolasses,
    circularNumber: requiredText(data.circularNumber, 'circularNumber'),
    source: requiredText(data.source, 'source')
  };
}

export function assertCanonicalPrice(record) {
  const canonical = buildPricePayload(record, {
    sugarPricePerLkg: requiredNumber(record.sugarPricePerLkg, 'sugarPricePerLkg') - requiredNumber(record.sugarPriceChange, 'sugarPriceChange'),
    molassesPricePerMetricTon: requiredNumber(record.molassesPricePerMetricTon, 'molassesPricePerMetricTon') - requiredNumber(record.molassesPriceChange, 'molassesPriceChange')
  });
  return { id: requiredText(record.id, 'id'), ...canonical };
}
