import React from 'react';
import PriceReferenceCard from './PriceReferenceCard';
export default function CurrentPriceBanner({ price, isLoading, isSraAdmin, onPublishClick, className }) {
  return <PriceReferenceCard price={price} isLoading={isLoading} canPublish={isSraAdmin} onPublishClick={onPublishClick} className={className} />;
}
