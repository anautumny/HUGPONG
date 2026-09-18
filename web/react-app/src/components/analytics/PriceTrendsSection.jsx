import React, { useState } from 'react';
import { TrendingUp, Calendar, FileText, ArrowUpRight, ArrowDownRight, Info } from 'lucide-react';
import Button from '../ui/Button';

export default function PriceTrendsSection({
  trendsData = null,
  timeframe = 'weekly',
  onTimeframeChange,
  isLoading = false,
  className = ''
}) {
  const [activeSeries, setActiveSeries] = useState('sugar'); // 'sugar' | 'molasses' | 'both'
  const [hoveredPoint, setHoveredPoint] = useState(null);

  if (isLoading) {
    return (
      <div className={`bg-white dark:bg-surface rounded-2xl border border-border p-6 shadow-xs animate-pulse ${className}`}>
        <div className="h-5 w-48 bg-gray-200 dark:bg-gray-800 rounded mb-4" />
        <div className="h-56 bg-gray-200 dark:bg-gray-800 rounded-xl mb-4" />
      </div>
    );
  }

  const {
    trendPoints = [],
    minSugar = 0,
    maxSugar = 0,
    minMolasses = 0,
    maxMolasses = 0,
    currentSugar = 0,
    currentMolasses = 0
  } = trendsData || {};

  // Dimensions for SVG Chart
  const W = 620;
  const H = 200;
  const padL = 60;
  const padR = 25;
  const padT = 25;
  const padB = 40;
  const svgW = W + padL + padR;
  const svgH = H + padT + padB;
  const n = trendPoints.length;

  // Scales
  const sugarMinP = minSugar * 0.95;
  const sugarMaxP = maxSugar * 1.05;
  const sugarRange = (sugarMaxP - sugarMinP) || 1;

  const molMinP = minMolasses * 0.95;
  const molMaxP = maxMolasses * 1.05;
  const molRange = (molMaxP - molMinP) || 1;

  // Compute coordinates
  const pointsWithCoords = trendPoints.map((pt, i) => {
    const x = n > 1 ? padL + (i / (n - 1)) * W : padL + W / 2;
    const ySugar = padT + H - ((pt.sugarPrice - sugarMinP) / sugarRange) * H;
    const yMol = padT + H - ((pt.molassesPrice - molMinP) / molRange) * H;
    return { ...pt, x, ySugar, yMol };
  });

  // Build SVG Paths
  const buildPath = (coordKey) => {
    if (pointsWithCoords.length === 0) return '';
    let d = `M ${pointsWithCoords[0].x} ${pointsWithCoords[0][coordKey]}`;
    for (let i = 0; i < pointsWithCoords.length - 1; i++) {
      const p0 = pointsWithCoords[i];
      const p1 = pointsWithCoords[i + 1];
      const mx = (p0.x + p1.x) / 2;
      d += ` C ${mx} ${p0[coordKey]}, ${mx} ${p1[coordKey]}, ${p1.x} ${p1[coordKey]}`;
    }
    return d;
  };

  const sugarPathD = buildPath('ySugar');
  const molassesPathD = buildPath('yMol');

  const sugarAreaD = sugarPathD && pointsWithCoords.length > 1
    ? `${sugarPathD} L ${pointsWithCoords[pointsWithCoords.length - 1].x} ${padT + H} L ${pointsWithCoords[0].x} ${padT + H} Z`
    : '';

  // Y-axis grid ticks for sugar or molasses
  const yTicks = [0, 0.33, 0.66, 1].map(frac => {
    const y = padT + H - frac * H;
    const sugarVal = Math.round(sugarMinP + frac * sugarRange);
    const molVal = Math.round(molMinP + frac * molRange);
    return { y, sugarVal, molVal };
  });

  return (
    <div className={`bg-surface rounded-2xl border border-border p-5 sm:p-6 shadow-xs ${className}`}>
      {/* Section Header & Toggles */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-hug-muted block">
            Price Trajectory
          </span>
          <h2 className="text-lg sm:text-xl font-black text-hug-text mt-0.5">
            SRA Official Price Trends
          </h2>
          <p className="text-xs text-hug-muted mt-0.5">
            Chronological benchmark price series published by the Sugar Regulatory Administration.
          </p>
        </div>

        {/* Series & Timeframe Controls */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* Commodity Toggle */}
          <div className="flex items-center bg-bg p-1 rounded-xl border border-border text-xs">
            <button
              type="button"
              onClick={() => setActiveSeries('sugar')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                activeSeries === 'sugar'
                  ? 'bg-surface text-primary dark:text-primary-light shadow-2xs border border-border/80'
                  : 'text-hug-muted hover:text-hug-text'
              }`}
            >
              Raw Sugar (₱/Lkg)
            </button>
            <button
              type="button"
              onClick={() => setActiveSeries('molasses')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                activeSeries === 'molasses'
                  ? 'bg-surface text-amber-700 dark:text-amber-400 shadow-2xs border border-border/80'
                  : 'text-hug-muted hover:text-hug-text'
              }`}
            >
              Molasses (₱/MT)
            </button>
          </div>

          {/* Timeframe Toggle */}
          <div className="flex items-center bg-bg p-1 rounded-xl border border-border text-xs">
            <button
              type="button"
              onClick={() => onTimeframeChange('weekly')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                timeframe === 'weekly'
                  ? 'bg-surface text-hug-text shadow-2xs border border-border/80'
                  : 'text-hug-muted hover:text-hug-text'
              }`}
            >
              Weekly
            </button>
            <button
              type="button"
              onClick={() => onTimeframeChange('monthly')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                timeframe === 'monthly'
                  ? 'bg-surface text-hug-text shadow-2xs border border-border/80'
                  : 'text-hug-muted hover:text-hug-text'
              }`}
            >
              Monthly Avg
            </button>
          </div>
        </div>
      </div>

      {trendPoints.length === 0 ? (
        <div className="py-10 text-center text-hug-muted text-xs">
          <TrendingUp className="w-8 h-8 mx-auto text-hug-muted/50 mb-2" />
          <p className="font-semibold text-hug-text text-sm">No historical prices recorded</p>
          <p className="text-xs text-hug-muted mt-0.5">
            SRA pricing trajectory will appear once official circulars are published.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {/* Key Metrics Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {activeSeries === 'sugar' ? (
              <>
                <div className="bg-bg/60 dark:bg-gray-800/40 rounded-xl p-3 border border-border">
                  <span className="text-[10px] uppercase font-bold text-hug-muted block">Latest Circular</span>
                  <span className="text-base sm:text-lg font-black text-primary dark:text-primary-light">
                    ₱{currentSugar.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-hug-muted block">/ Lkg bag</span>
                </div>
                <div className="bg-bg/60 dark:bg-gray-800/40 rounded-xl p-3 border border-border">
                  <span className="text-[10px] uppercase font-bold text-hug-muted block">Period Low</span>
                  <span className="text-base sm:text-lg font-black text-hug-text">
                    ₱{minSugar.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-hug-muted block">/ Lkg bag</span>
                </div>
                <div className="bg-bg/60 dark:bg-gray-800/40 rounded-xl p-3 border border-border">
                  <span className="text-[10px] uppercase font-bold text-hug-muted block">Period High</span>
                  <span className="text-base sm:text-lg font-black text-hug-text">
                    ₱{maxSugar.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-hug-muted block">/ Lkg bag</span>
                </div>
                <div className="bg-bg/60 dark:bg-gray-800/40 rounded-xl p-3 border border-border">
                  <span className="text-[10px] uppercase font-bold text-hug-muted block">Trajectory Range</span>
                  <span className="text-base sm:text-lg font-black text-hug-text">
                    ₱{(maxSugar - minSugar).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-hug-muted block">variance across series</span>
                </div>
              </>
            ) : (
              <>
                <div className="bg-bg/60 dark:bg-gray-800/40 rounded-xl p-3 border border-border">
                  <span className="text-[10px] uppercase font-bold text-hug-muted block">Latest Circular</span>
                  <span className="text-base sm:text-lg font-black text-amber-600 dark:text-amber-400">
                    ₱{currentMolasses.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-hug-muted block">/ Metric Ton</span>
                </div>
                <div className="bg-bg/60 dark:bg-gray-800/40 rounded-xl p-3 border border-border">
                  <span className="text-[10px] uppercase font-bold text-hug-muted block">Period Low</span>
                  <span className="text-base sm:text-lg font-black text-hug-text">
                    ₱{minMolasses.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-hug-muted block">/ Metric Ton</span>
                </div>
                <div className="bg-bg/60 dark:bg-gray-800/40 rounded-xl p-3 border border-border">
                  <span className="text-[10px] uppercase font-bold text-hug-muted block">Period High</span>
                  <span className="text-base sm:text-lg font-black text-hug-text">
                    ₱{maxMolasses.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-hug-muted block">/ Metric Ton</span>
                </div>
                <div className="bg-bg/60 dark:bg-gray-800/40 rounded-xl p-3 border border-border">
                  <span className="text-[10px] uppercase font-bold text-hug-muted block">Trajectory Range</span>
                  <span className="text-base sm:text-lg font-black text-hug-text">
                    ₱{(maxMolasses - minMolasses).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-hug-muted block">variance across series</span>
                </div>
              </>
            )}
          </div>

          {/* SVG Line Chart */}
          <div className="overflow-x-auto bg-bg/20 dark:bg-gray-900/20 rounded-xl p-3 border border-border/80">
            <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full min-w-[560px] select-none">
              <defs>
                <linearGradient id="analyticsSugarGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2D5016" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#2D5016" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="analyticsMolGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#B45309" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#B45309" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Horizontal Gridlines & Y-labels */}
              {yTicks.map(({ y, sugarVal, molVal }) => (
                <g key={y}>
                  <line
                    x1={padL}
                    y1={y}
                    x2={padL + W}
                    y2={y}
                    stroke="currentColor"
                    className="text-border"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={padL - 10}
                    y={y + 3}
                    textAnchor="end"
                    fontSize="10"
                    fontWeight="600"
                    className="fill-hug-muted font-mono"
                  >
                    ₱{(activeSeries === 'sugar' ? sugarVal : molVal).toLocaleString()}
                  </text>
                </g>
              ))}

              {/* Sugar Line & Area */}
              {activeSeries === 'sugar' && sugarAreaD && (
                <path d={sugarAreaD} fill="url(#analyticsSugarGrad)" />
              )}
              {activeSeries === 'sugar' && sugarPathD && (
                <path
                  d={sugarPathD}
                  fill="none"
                  stroke="#2D5016"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              )}

              {/* Molasses Line */}
              {activeSeries === 'molasses' && (
                <path
                  d={molassesPathD}
                  fill="none"
                  stroke="#B45309"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              )}

              {/* Data Points and X Labels */}
              {pointsWithCoords.map((pt, i) => {
                const isLatest = i === n - 1;
                const ptY = activeSeries === 'sugar' ? pt.ySugar : pt.yMol;
                const color = activeSeries === 'sugar' ? '#2D5016' : '#B45309';
                const priceVal = activeSeries === 'sugar' ? pt.sugarPrice : pt.molassesPrice;
                const unit = activeSeries === 'sugar' ? '/ Lkg' : '/ MT';

                return (
                  <g
                    key={i}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredPoint(pt)}
                    onMouseLeave={() => setHoveredPoint(null)}
                  >
                    {isLatest && (
                      <circle
                        cx={pt.x}
                        cy={ptY}
                        r="10"
                        fill={color}
                        opacity="0.25"
                      />
                    )}
                    <circle
                      cx={pt.x}
                      cy={ptY}
                      r={isLatest ? 5.5 : 4}
                      fill={color}
                      stroke="#FFFFFF"
                      strokeWidth="2"
                    />

                    {/* X-axis Label */}
                    <text
                      x={pt.x}
                      y={padT + H + 18}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="600"
                      className="fill-hug-muted"
                      transform={`rotate(-25, ${pt.x}, ${padT + H + 18})`}
                    >
                      {timeframe === 'monthly' ? pt.periodLabel : pt.periodLabel.replace(/Week\s+/i, 'W')}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Hover / Point Details Callout */}
          {hoveredPoint ? (
            <div className="p-3 bg-bg dark:bg-gray-800/60 rounded-xl border border-border flex items-center justify-between text-xs animate-fadeIn">
              <div>
                <span className="font-bold text-hug-text">
                  {hoveredPoint.periodLabel} ({hoveredPoint.date})
                </span>
                <span className="text-[11px] text-hug-muted ml-2 font-mono">
                  {hoveredPoint.circularNumber}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-extrabold text-primary dark:text-primary-light">
                  Raw Sugar: ₱{hoveredPoint.sugarPrice.toLocaleString()} / Lkg
                </span>
                <span className="font-extrabold text-amber-600 dark:text-amber-400">
                  Molasses: ₱{hoveredPoint.molassesPrice.toLocaleString()} / MT
                </span>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-hug-muted text-center pt-1">
              Hover over points to inspect specific circular prices and issuing reference codes.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
