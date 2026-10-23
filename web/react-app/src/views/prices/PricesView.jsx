import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, PlusCircle, Download, RefreshCw, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { subscribeToPrices, fetchPrices } from '../../services/pricesService';
import { fromPrice } from '../../services/firestoreSchema';
import { sortNewestFirst } from '../../utils/recordOrdering';
import CurrentPriceBanner from '../../components/prices/CurrentPriceBanner';
import PriceHistoryTable from '../../components/prices/PriceHistoryTable';
import PublishPriceModal from '../../components/prices/PublishPriceModal';
import Button from '../../components/ui/Button';

export default function PricesView() {
  const { roleKey, user } = useAuth();
  const ownerId = user?.employeeId || user?.id;
  const isSraAdmin = roleKey === 'admin';

  const [prices, setPrices] = useState([]);
  const [currentPrice, setCurrentPrice] = useState(null);
  const [previousPrice, setPreviousPrice] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [historyPage, setHistoryPage] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const historyExtended = useRef(false);
  const ownerRef = useRef(ownerId);
  ownerRef.current = ownerId;

  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    setPrices([]);
    setHistoryPage(null);
    setLoadingOlder(false);
    historyExtended.current = false;
    let active = true;
    const unsubscribe = subscribeToPrices({
      onUpdate: ({ prices, page, currentPrice, previousPrice, isLoading, error }) => {
        if (!active) return;
        setPrices(previous => historyExtended.current
          ? sortNewestFirst([...new Map([...previous, ...prices].map(row => [row.id, row])).values()], ['effectiveDate'])
          : prices || []);
        if (!historyExtended.current) setHistoryPage(page);
        setCurrentPrice(currentPrice);
        setPreviousPrice(previousPrice);
        setIsLoading(isLoading);
        setError(error);
      },
      onError: (err) => {
        if (!active) return;
        setError(err.message || 'Failed to load SRA prices.');
        setIsLoading(false);
      }
    });

    return () => {
      active = false;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [ownerId]);

  const loadOlder = async () => {
    if (loadingOlder || !historyPage?.nextCursor) return;
    const owner = ownerId;
    setLoadingOlder(true);
    try {
      const response = await fetchPrices({ cursor: historyPage.nextCursor });
      if (ownerRef.current !== owner) return;
      const older = (response.data || []).map(row => fromPrice(row.id, row));
      historyExtended.current = true;
      setPrices(previous => sortNewestFirst([...new Map([...previous, ...older].map(row => [row.id, row])).values()], ['effectiveDate']));
      setHistoryPage(response.page);
      setError(null);
    } catch (err) {
      if (ownerRef.current === owner) setError(err.message || 'Could not load older prices.');
    } finally {
      if (ownerRef.current === owner) setLoadingOlder(false);
    }
  };

  const handleExportCSV = () => {
    if (!prices || prices.length === 0) return;

    const headers = ['Reporting Date', 'Period Type', 'Week Label', 'Raw Sugar (PHP/Lkg)', 'Sugar Status', 'Sugar Change', 'Molasses (PHP/MT)', 'Molasses Status', 'Molasses Change', 'Circular Number', 'Source', 'Source URL'];
    const rows = prices.map(p => [
      p.effectiveDate,
      p.periodType,
      p.weekLabel,
      p.sugarPricePerLkg,
      p.sugarPriceStatus,
      p.sugarPriceChange,
      p.molassesPricePerMetricTon,
      p.molassesPriceStatus,
      p.molassesPriceChange,
      p.circularNumber,
      p.source,
      p.sourceUrl
    ]);

    const csvCell = value => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
    const csvContent = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
    const encodedUri = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SRA_Price_Ledger_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(encodedUri);
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
              Published Prices
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-hug-text tracking-tight mt-1">
            SRA Price Monitor
          </h1>
          <p className="text-xs sm:text-sm text-hug-muted mt-1 max-w-2xl">
            Weekly millsite prices and availability for Raw Sugar (PHP/Lkg) and Molasses (PHP/MT).
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
              Publish Price Reference
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

      {/* Current published price banner */}
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
      {historyPage?.hasMore && (
        <Button onClick={loadOlder} disabled={loadingOlder}>
          {loadingOlder ? 'Loading older records…' : 'Load older price records'}
        </Button>
      )}

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
