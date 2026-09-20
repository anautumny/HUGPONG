import React, { useState, useEffect } from 'react';
import { TrendingUp, PlusCircle, Download, RefreshCw, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { subscribeToPrices } from '../../services/pricesService';
import CurrentPriceBanner from '../../components/prices/CurrentPriceBanner';
import PriceHistoryTable from '../../components/prices/PriceHistoryTable';
import PublishPriceModal from '../../components/prices/PublishPriceModal';
import Button from '../../components/ui/Button';

export default function PricesView() {
  const { roleKey } = useAuth();
  const isSraAdmin = roleKey === 'admin';

  const [prices, setPrices] = useState([]);
  const [currentPrice, setCurrentPrice] = useState(null);
  const [previousPrice, setPreviousPrice] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = subscribeToPrices({
      onUpdate: ({ prices, currentPrice, previousPrice, isLoading, error }) => {
        setPrices(prices || []);
        setCurrentPrice(currentPrice);
        setPreviousPrice(previousPrice);
        setIsLoading(isLoading);
        setError(error);
      },
      onError: (err) => {
        setError(err.message || 'Failed to load SRA prices.');
        setIsLoading(false);
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const handleExportCSV = () => {
    if (!prices || prices.length === 0) return;

    const headers = ['Effective Date', 'Week Label', 'Raw Sugar (PHP/Lkg)', 'Sugar Change', 'Molasses (PHP/MT)', 'Molasses Change', 'Circular Number', 'Source'];
    const rows = prices.map(p => [
      p.effectiveDate,
      `"${p.weekLabel || ''}"`,
      p.sugarPricePerLkg,
      p.sugarPriceChange || 0,
      p.molassesPricePerMetricTon,
      p.molassesPriceChange || 0,
      `"${p.circularNumber || ''}"`,
      `"${p.source || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SRA_Price_Ledger_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-primary dark:text-primary-light uppercase tracking-wider">
              Market Intelligence
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light">
              Official SRA Source
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-hug-text tracking-tight mt-1">
            SRA Price Monitor
          </h1>
          <p className="text-xs sm:text-sm text-hug-muted mt-1 max-w-2xl">
            Real-time Sugar Regulatory Administration millsite benchmark rates for Raw Sugar (₱/Lkg) and Industrial Molasses (₱/MT).
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="primary"
            size="md"
            onClick={handleExportCSV}
            disabled={prices.length === 0}
            icon={Download}
          >
            Export Ledger
          </Button>

          {isSraAdmin && (
            <Button
              variant="primary"
              size="md"
              onClick={() => setIsPublishModalOpen(true)}
              icon={PlusCircle}
            >
              Post Official SRA Price
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-danger-bg/40 border border-danger/30 rounded-2xl flex items-start gap-3 text-xs sm:text-sm font-semibold text-danger">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Error loading SRA pricing data</p>
            <p className="text-xs text-danger/80 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Current Official Price Banner */}
      <CurrentPriceBanner
        price={currentPrice}
        previousPrice={previousPrice}
        isLoading={isLoading}
        isSraAdmin={isSraAdmin}
        onPublishClick={() => setIsPublishModalOpen(true)}
      />

      {/* Historical SRA Price Records Table */}
      <PriceHistoryTable
        prices={prices}
        isLoading={isLoading}
      />

      {/* Publish Price Modal (SRA Admin only) */}
      {isSraAdmin && (
        <PublishPriceModal
          isOpen={isPublishModalOpen}
          onClose={() => setIsPublishModalOpen(false)}
          latestPrice={currentPrice}
          onPublished={(newPrice) => {
            // Price listener will auto-update state via Firestore snapshot / API
          }}
        />
      )}
    </div>
  );
}
