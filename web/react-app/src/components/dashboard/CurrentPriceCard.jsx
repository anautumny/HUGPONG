import React from 'react';
import { Link } from 'react-router-dom';
import PriceReferenceCard from '../prices/PriceReferenceCard';
export default function CurrentPriceCard({ price, isLoading, showPublishAction, onPublishClick }) {
  return <div className="h-full space-y-3">
    <PriceReferenceCard price={price} isLoading={isLoading} canPublish={showPublishAction} onPublishClick={onPublishClick} />
    <Link to="/prices" className="text-xs font-semibold text-primary hover:underline">Price Ledger ?</Link>
  </div>;
}
