'use strict';

const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
const quoted = (row, product) => {
  const field = product === 'sugar' ? 'sugarPricePerLkg' : 'molassesPricePerMetricTon';
  return (row?.[`${product}PriceStatus`] || 'REPORTED') === 'REPORTED'
    && row?.[field] != null && Number.isFinite(Number(row[field])) && Number(row[field]) > 0
    ? Number(row[field]) : null;
};

function comparableChange(row, previous, product) {
  const current = quoted(row, product), before = quoted(previous, product);
  const days = previous ? (Date.parse(row.effectiveDate) - Date.parse(previous.effectiveDate)) / 86400000 : 0;
  if (current == null || before == null || days !== 7
    || (product === 'molasses' && (row.molassesMarket || '') !== (previous.molassesMarket || ''))) return null;
  return round(current - before);
}

function buildPriceAnalytics(records, asOf = new Date().toISOString().slice(0, 10)) {
  // Only server-validated records enter this projection. No interpolation or carry-forward quotes.
  const sorted = [...records].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  const latest = sorted.at(-1) || null;
  const weekly = sorted.map((row, index) => ({
    date: row.effectiveDate, periodLabel: row.weekLabel, circularNumber: row.circularNumber,
    sugarPrice: quoted(row, 'sugar'), molassesPrice: quoted(row, 'molasses'),
    sugarStatus: row.sugarPriceStatus || 'REPORTED', molassesStatus: row.molassesPriceStatus || 'REPORTED',
    sugarChange: comparableChange(row, sorted[index - 1], 'sugar'),
    molassesChange: comparableChange(row, sorted[index - 1], 'molasses'),
    molassesMarket: row.molassesMarket || null,
    sugarReportedWeeks: quoted(row, 'sugar') == null ? 0 : 1,
    molassesReportedWeeks: quoted(row, 'molasses') == null ? 0 : 1
  }));
  const groups = new Map();
  weekly.forEach(point => {
    const key = point.date.slice(0, 7);
    groups.set(key, [...(groups.get(key) || []), point]);
  });
  const monthly = [...groups.entries()].map(([month, points]) => {
    const mean = product => {
      const values = points.map(p => p[`${product}Price`]).filter(v => v != null);
      return values.length ? round(values.reduce((a, b) => a + b, 0) / values.length) : null;
    };
    const sugarPrice = mean('sugar'), molassesPrice = mean('molasses');
    return {
      ...points.at(-1), periodLabel: month, sugarPrice, molassesPrice,
      sugarStatus: sugarPrice == null ? points.at(-1).sugarStatus : 'REPORTED',
      molassesStatus: molassesPrice == null ? points.at(-1).molassesStatus : 'REPORTED',
      sugarChange: null, molassesChange: null,
      sugarReportedWeeks: points.filter(p => p.sugarPrice != null).length,
      molassesReportedWeeks: points.filter(p => p.molassesPrice != null).length,
      totalWeeks: points.length
    };
  });
  const metrics = points => {
    const sugar = points.map(p => p.sugarPrice).filter(v => v != null);
    const molasses = points.map(p => p.molassesPrice).filter(v => v != null);
    return {
      trendPoints: points,
      minSugar: sugar.length ? Math.min(...sugar) : null, maxSugar: sugar.length ? Math.max(...sugar) : null,
      minMolasses: molasses.length ? Math.min(...molasses) : null, maxMolasses: molasses.length ? Math.max(...molasses) : null,
      currentSugar: quoted(latest, 'sugar'), currentMolasses: quoted(latest, 'molasses'),
      currentSugarStatus: latest?.sugarPriceStatus || 'NOT_REPORTED', currentMolassesStatus: latest?.molassesPriceStatus || 'NOT_REPORTED'
    };
  };
  const lastQuote = product => {
    const record = [...sorted].reverse().find(row => quoted(row, product) != null);
    return record ? { value: quoted(record, product), date: record.effectiveDate, market: product === 'molasses' ? record.molassesMarket || null : null } : null;
  };
  const first = sorted[0];
  const start = quoted(first, 'sugar'), end = quoted(latest, 'sugar');
  return {
    computedAt: new Date().toISOString(), asOf, weekly: metrics(weekly), monthly: metrics(monthly),
    summary: {
      latestDate: latest?.effectiveDate || null,
      isStale: latest ? (Date.parse(asOf) - Date.parse(latest.effectiveDate)) / 86400000 > 7 : true,
      lastReported: { sugar: lastQuote('sugar'), molasses: lastQuote('molasses') },
      latestMonthSugarAverage: monthly.at(-1)?.sugarPrice ?? null,
      sugarPeriodHigh: metrics(weekly).maxSugar,
      sugarPeriodChangePercent: start != null && end != null && weekly.every(point => point.sugarPrice != null)
        ? round((end - start) / start * 100) : null
    }
  };
}

function decoratePriceHistory(records, asOf) {
  const analytics = buildPriceAnalytics(records, asOf);
  return [...records].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate)).map((row, index) => ({
    ...row, sugarPriceChange: analytics.weekly.trendPoints.find(p => p.date === row.effectiveDate)?.sugarChange ?? null,
    molassesPriceChange: analytics.weekly.trendPoints.find(p => p.date === row.effectiveDate)?.molassesChange ?? null,
    ...(index === 0 ? { priceAnalytics: analytics } : {})
  }));
}

module.exports = { buildPriceAnalytics, decoratePriceHistory, comparableChange, quoted };
