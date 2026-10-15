import React, { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { priceText } from '../../utils/pricePresentation';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const axisLabel = (date, timeframe) => {
  const [year, month, day] = date.split('-');
  return { label: `${months[Number(month) - 1]}${timeframe === 'weekly' ? ` ${Number(day)}` : ''}`, year };
};

export default function PriceTrendsSection({ trendsData = null, timeframe = 'weekly', onTimeframeChange, isLoading = false, className = '' }) {
  const [activeSeries, setActiveSeries] = useState('sugar');
  const [selectedDate, setSelectedDate] = useState(null);
  const { trendPoints = [] } = trendsData || {};
  const isSugar = activeSeries === 'sugar';
  const product = isSugar ? 'Raw Sugar' : 'Molasses';
  const unit = isSugar ? 'Lkg (50 kg)' : 'MT';
  const min = isSugar ? trendsData?.minSugar : trendsData?.minMolasses;
  const max = isSugar ? trendsData?.maxSugar : trendsData?.maxMolasses;
  const current = isSugar ? trendsData?.currentSugar : trendsData?.currentMolasses;
  const currentStatus = isSugar ? trendsData?.currentSugarStatus : trendsData?.currentMolassesStatus;
  const seriesColor = isSugar ? 'text-[#2D5016] dark:text-[#A3D977]' : 'text-amber-800 dark:text-amber-300';

  // These coordinates only present the server-computed trend projection.
  const W = 800, H = 250, padL = 105, padR = 35, padT = 25, padB = 75;
  const svgW = W + padL + padR, svgH = H + padT + padB;
  const lower = (min ?? 0) * 0.95, upper = (max ?? 0) * 1.05;
  const range = upper - lower || 1;
  const points = trendPoints.map((point, index) => {
    const value = isSugar ? point.sugarPrice : point.molassesPrice;
    return { ...point, value, x: padL + (trendPoints.length > 1 ? index / (trendPoints.length - 1) : 0.5) * W,
      y: value == null ? null : padT + H - (value - lower) / range * H };
  });
  let path = '', connected = false;
  points.forEach(point => {
    if (point.y == null) { connected = false; return; }
    path += `${connected ? ' L' : ' M'} ${point.x} ${point.y}`;
    connected = true;
  });
  // Space a maximum of eight labels across the entire period, including unquoted weeks.
  const tickCount = Math.min(8, points.length);
  const tickIndexes = Array.from({ length: tickCount }, (_, i) => tickCount === 1 ? 0 : Math.round(i * (points.length - 1) / (tickCount - 1)));
  const selected = points.find(point => point.date === selectedDate);
  const chooseTimeframe = next => { setSelectedDate(null); onTimeframeChange?.(next); };

  if (isLoading) return <div className={`bg-surface rounded-2xl border border-border p-6 animate-pulse ${className}`} aria-busy="true"><div className="h-5 w-48 bg-bg rounded mb-4" /><div className="h-64 bg-bg rounded-xl" /></div>;

  return <section className={`bg-surface rounded-2xl border border-border p-5 sm:p-6 shadow-xs space-y-4 ${className}`}>
    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-border pb-4">
      <div><h2 className="text-lg sm:text-xl font-bold text-hug-text">Price trends</h2><p className="text-sm text-hug-text2 mt-1">Weekly prices and monthly averages of reported weeks.</p></div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 p-1 rounded-xl border border-border bg-bg" role="group" aria-label="Price product">
          {[['sugar', 'Raw Sugar'], ['molasses', 'Molasses']].map(([key, label]) => <button key={key} type="button" aria-pressed={activeSeries === key} onClick={() => setActiveSeries(key)} className={`px-3 py-2 text-sm rounded-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${activeSeries === key ? 'bg-surface text-hug-text shadow-sm border border-border' : 'text-hug-text2 hover:text-hug-text'}`}>{label}</button>)}
        </div>
        <div className="flex flex-wrap gap-1 p-1 rounded-xl border border-border bg-bg" role="group" aria-label="Price timeframe">
          {[['weekly', 'Weekly'], ['monthly', 'Monthly average']].map(([key, label]) => <button key={key} type="button" aria-pressed={timeframe === key} onClick={() => chooseTimeframe(key)} className={`px-3 py-2 text-sm rounded-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${timeframe === key ? 'bg-surface text-hug-text shadow-sm border border-border' : 'text-hug-text2 hover:text-hug-text'}`}>{label}</button>)}
        </div>
      </div>
    </div>

    <p className="text-sm text-hug-text2 leading-relaxed">Gaps mean no quoted price. Monthly averages include reported weeks only.</p>
    {points.length === 0 ? <div className="py-10 text-center text-hug-text2"><TrendingUp className="w-8 h-8 mx-auto mb-3" /><p className="font-semibold text-hug-text">No historical prices recorded</p><p className="text-sm mt-1">Price trends will appear once prices are published.</p></div> : <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Latest status / price', priceText(current, currentStatus), current != null && currentStatus === 'REPORTED' ? `PHP / ${unit}` : 'Latest published week'],
          ['Period low', priceText(min, min == null ? 'NOT_REPORTED' : 'REPORTED'), `PHP / ${unit}`],
          ['Period high', priceText(max, max == null ? 'NOT_REPORTED' : 'REPORTED'), `PHP / ${unit}`],
          ['Price range', priceText(max != null && min != null ? max - min : null, max == null ? 'NOT_REPORTED' : 'REPORTED'), 'Highest minus lowest']
        ].map(([label, value, note]) => <div key={label} className="bg-bg rounded-xl p-4 border border-border min-w-0"><p className="text-sm font-medium text-hug-text2">{label}</p><p className="text-lg sm:text-xl font-bold text-hug-text mt-1 break-words">{value}</p><p className="text-xs text-hug-text2 mt-1">{note}</p></div>)}
      </div>

      <figure className="space-y-2">
        <figcaption className="text-sm font-semibold text-hug-text">{product} · PHP / {unit}</figcaption>
        {path ? <div className="overflow-x-auto rounded-xl border border-border bg-bg/30 p-3 focus-visible:outline-2 focus-visible:outline-primary" tabIndex={0} role="region" aria-label={`${product} price chart; scroll horizontally on smaller screens`}>
          <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full min-w-[900px] select-none" role="group" aria-label={`${product} prices by ${timeframe === 'weekly' ? 'week' : 'month'}`}>
            {[0, 1 / 3, 2 / 3, 1].map(fraction => {
              const y = padT + H - fraction * H;
              return <g key={fraction}><line x1={padL} x2={padL + W} y1={y} y2={y} stroke="currentColor" className="text-border-strong" strokeDasharray="4 4" /><text x={padL - 14} y={y + 5} textAnchor="end" fontSize="14" fontWeight="600" className="fill-hug-text2">₱{Math.round(lower + fraction * range).toLocaleString('en-PH')}</text></g>;
            })}
            <path d={path} fill="none" stroke="currentColor" className={seriesColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            {points.filter(point => point.y != null).map(point => <g key={point.date} role="button" tabIndex={0} aria-label={`${point.periodLabel}, ${point.date}: ${priceText(point.value, 'REPORTED', unit)}`} aria-pressed={selectedDate === point.date} className={`cursor-pointer outline-none group ${seriesColor}`} onMouseEnter={() => setSelectedDate(point.date)} onFocus={() => setSelectedDate(point.date)} onClick={() => setSelectedDate(point.date)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedDate(point.date); } }}>
              <circle cx={point.x} cy={point.y} r="12" fill="transparent" stroke="currentColor" className="opacity-0 group-focus-visible:opacity-100" strokeWidth="2" />
              <circle cx={point.x} cy={point.y} r={selectedDate === point.date ? 6 : 4} fill="currentColor" className="stroke-surface" strokeWidth="2" />
              <title>{`${point.periodLabel}: ${priceText(point.value, 'REPORTED', unit)}`}</title>
            </g>)}
            {tickIndexes.map(index => {
              const point = points[index], { label, year } = axisLabel(point.date, timeframe);
              return <g key={point.date}><line x1={point.x} x2={point.x} y1={padT + H} y2={padT + H + 6} stroke="currentColor" className="text-hug-text2" /><text x={point.x} y={padT + H + 28} textAnchor="middle" fontSize="14" fontWeight="600" className="fill-hug-text2"><tspan x={point.x}>{label}</tspan><tspan x={point.x} dy="20" fontSize="12">{year}</tspan></text></g>;
            })}
          </svg>
        </div> : <div className="py-10 px-4 text-center rounded-xl border border-border text-hug-text2">No quoted {product} prices for this period.</div>}
        <p className="text-sm text-hug-text2">{path ? 'Select a point for its full date and price. Scroll the chart sideways on smaller screens.' : 'See the weekly statuses below for availability.'}</p>
      </figure>

      {selected && <div className="p-4 bg-bg rounded-xl border border-border space-y-2 text-sm" aria-live="polite"><p className="font-semibold text-hug-text">{selected.periodLabel} · {selected.date}</p><div className="flex flex-wrap gap-x-6 gap-y-2 text-hug-text"><span>Raw Sugar: <strong>{priceText(selected.sugarPrice, selected.sugarStatus, 'Lkg')}</strong></span><span>Molasses: <strong>{priceText(selected.molassesPrice, selected.molassesStatus, 'MT')}</strong></span></div></div>}

      <details className="rounded-xl border border-border"><summary className="p-4 cursor-pointer text-sm font-semibold text-hug-text">View all {timeframe === 'weekly' ? 'weekly prices' : 'monthly averages'} ({points.length})</summary><div className="max-h-80 overflow-auto border-t border-border"><table className="w-full text-left text-sm text-hug-text"><thead className="sticky top-0 bg-surface"><tr><th scope="col" className="p-3">Period</th><th scope="col" className="p-3">Raw Sugar / Lkg</th><th scope="col" className="p-3">Molasses / MT</th></tr></thead><tbody className="divide-y divide-border">{points.map(point => <tr key={point.date}><th scope="row" className="p-3 font-medium">{point.periodLabel}</th><td className="p-3">{priceText(point.sugarPrice, point.sugarStatus)}{timeframe === 'monthly' && <span className="block text-xs text-hug-text2 mt-1">{point.sugarReportedWeeks}/{point.totalWeeks} reported weeks</span>}</td><td className="p-3">{priceText(point.molassesPrice, point.molassesStatus)}{timeframe === 'monthly' && <span className="block text-xs text-hug-text2 mt-1">{point.molassesReportedWeeks}/{point.totalWeeks} reported weeks</span>}</td></tr>)}</tbody></table></div></details>
    </>}
  </section>;
}
