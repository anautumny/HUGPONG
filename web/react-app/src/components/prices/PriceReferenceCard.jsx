import React from 'react';
import { priceText, movementText } from '../../utils/pricePresentation';
import Button from '../ui/Button';

export default function PriceReferenceCard({ price, isLoading, onPublishClick, canPublish, className = '' }) {
  const summary = price?.priceAnalytics?.summary;
  return <section className={`bg-surface rounded-2xl border border-border p-5 sm:p-6 shadow-xs space-y-4 ${className}`} aria-busy={isLoading}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="font-bold text-hug-text">Latest SRA bulletin</h3>
        <p className="text-sm text-hug-text2 mt-1">{isLoading ? 'Loading…' : price ? `${price.weekLabel} · ${price.periodType === 'WEEK_ENDING' ? 'Week ending' : 'Effective'} ${price.effectiveDate}` : 'No published bulletin available.'}</p>
      </div>
      {canPublish && <Button size="sm" onClick={onPublishClick}>Publish Price Reference</Button>}
    </div>
    {summary?.isStale && <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-relaxed text-hug-text">No newer bulletin available as of {price.priceAnalytics.asOf}. These are historical references.</p>}
    {price && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {[
        { key: 'sugar', label: 'Raw Sugar', field: 'sugarPricePerLkg', unit: 'Lkg (50 kg)' },
        { key: 'molasses', label: 'Molasses', field: 'molassesPricePerMetricTon', unit: 'MT' }
      ].map(product => {
        const status = price[`${product.key}PriceStatus`] || 'REPORTED';
        const last = summary?.lastReported?.[product.key];
        return <div key={product.key} className="rounded-xl border border-border bg-bg p-4 min-w-0">
          <h4 className="text-sm font-bold text-hug-text2">{product.label}</h4>
          <p className="text-xl sm:text-2xl font-extrabold text-hug-text mt-2 break-words">{priceText(price[product.field], status, status === 'REPORTED' ? product.unit : '')}</p>
          <p className="text-sm text-hug-text2 leading-relaxed mt-2">{status === 'REPORTED' ? `${movementText(price[`${product.key}PriceChange`])}${price[`${product.key}PriceChange`] != null ? ' vs prior week' : ''}` : status === 'MILLING_ENDED' ? 'Milling ended; no price quoted for this week.' : 'No price quoted for this reporting week.'}</p>
          {last && last.date !== price.effectiveDate && <p className="text-sm text-hug-text mt-3">Last reported: {priceText(last.value, 'REPORTED', product.unit)} · {last.date}</p>}
        </div>;
      })}
    </div>}
  </section>;
}
