import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import PriceReferenceCard from '../prices/PriceReferenceCard';

export default function CurrentPriceCard({ price, isLoading, showPublishAction, onPublishClick, className = '' }) {
  return (
    <div className={`h-full flex flex-col justify-between ${className}`}>
      <PriceReferenceCard
        price={price}
        isLoading={isLoading}
        canPublish={showPublishAction}
        onPublishClick={onPublishClick}
        className="h-full flex-1"
        footerAction={
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-hug-muted font-medium">
              Official Sugar Regulatory Administration benchmarks
            </span>
            <Link
              to="/prices"
              className="text-xs font-semibold text-primary dark:text-primary-light hover:underline inline-flex items-center gap-1 transition-colors"
            >
              <span>Price Ledger</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        }
      />
    </div>
  );
}
