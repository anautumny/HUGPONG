import React, { useState, useEffect } from 'react';
import { FileText, Calendar, TrendingUp, AlertCircle, CheckCircle2 } from 'lucide-react';
import Modal from '../ui/Modal';
import FormField from '../ui/FormField';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { calculateSRAWeekLabel, publishPrice } from '../../services/pricesService';

export default function PublishPriceModal({
  isOpen = false,
  onClose,
  latestPrice = null,
  onPublished
}) {
  const today = new Date().toISOString().split('T')[0];

  const [effectiveDate, setEffectiveDate] = useState(today);
  const [weekLabel, setWeekLabel] = useState('');
  const [sugarPrice, setSugarPrice] = useState('');
  const [molassesPrice, setMolassesPrice] = useState('');
  const [circularNumber, setCircularNumber] = useState('');
  const [source, setSource] = useState('Official SRA Sugar & Molasses Price Monitor');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Initialize or reset form values when opening
  useEffect(() => {
    if (isOpen) {
      setEffectiveDate(today);
      setWeekLabel(calculateSRAWeekLabel(today));
      setSugarPrice(latestPrice?.sugarPricePerLkg != null ? String(latestPrice.sugarPricePerLkg) : '');
      setMolassesPrice(latestPrice?.molassesPricePerMetricTon != null ? String(latestPrice.molassesPricePerMetricTon) : '');
      setCircularNumber('');
      setSource('Official SRA Sugar & Molasses Price Monitor');
      setFormError(null);
      setSuccessMessage(null);
      setIsSubmitting(false);
    }
  }, [isOpen, latestPrice]);

  // When effectiveDate changes, auto-update week label if not manually customized
  const handleDateChange = (e) => {
    const newDate = e.target.value;
    setEffectiveDate(newDate);
    if (newDate) {
      setWeekLabel(calculateSRAWeekLabel(newDate));
    }
  };

  // Derive variance vs previous latest price
  const prevSugar = latestPrice?.sugarPricePerLkg != null ? Number(latestPrice.sugarPricePerLkg) : null;
  const prevMolasses = latestPrice?.molassesPricePerMetricTon != null ? Number(latestPrice.molassesPricePerMetricTon) : null;

  const curSugarNum = sugarPrice !== '' ? Number(sugarPrice) : NaN;
  const curMolassesNum = molassesPrice !== '' ? Number(molassesPrice) : NaN;

  const sugarChange = !isNaN(curSugarNum) && prevSugar !== null ? curSugarNum - prevSugar : 0;
  const molassesChange = !isNaN(curMolassesNum) && prevMolasses !== null ? curMolassesNum - prevMolasses : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    // Validation
    if (!effectiveDate) {
      setFormError('Effective Date is required.');
      return;
    }
    if (!weekLabel.trim()) {
      setFormError('SRA Week Label is required.');
      return;
    }
    if (isNaN(curSugarNum) || curSugarNum <= 0) {
      setFormError('Raw Sugar price must be a valid positive number.');
      return;
    }
    if (isNaN(curMolassesNum) || curMolassesNum <= 0) {
      setFormError('Molasses price must be a valid positive number.');
      return;
    }
    if (!circularNumber.trim()) {
      setFormError('Official Circular / Reference Number is required.');
      return;
    }
    if (!source.trim()) {
      setFormError('Official Source description is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        effectiveDate,
        weekLabel: weekLabel.trim(),
        sugarPricePerLkg: curSugarNum,
        sugarPriceChange: sugarChange,
        molassesPricePerMetricTon: curMolassesNum,
        molassesPriceChange: molassesChange,
        circularNumber: circularNumber.trim(),
        source: source.trim()
      };

      const result = await publishPrice(payload);
      if (result.success) {
        setSuccessMessage('Official SRA Price Circular successfully broadcasted.');
        if (typeof onPublished === 'function') {
          onPublished(result.data);
        }
        setTimeout(() => {
          onClose();
        }, 800);
      } else {
        setFormError(result.error || 'Failed to publish SRA price circular.');
      }
    } catch (err) {
      setFormError(err.message || 'An error occurred while publishing the circular.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Publish Official SRA Price"
      subtitle="Broadcast weekly domestic millsite sugar and molasses benchmark prices."
      icon={TrendingUp}
      badge="SRA Admin"
      size="md"
      preventBackdropClose={isSubmitting}
      preventEscapeClose={isSubmitting}
      isLoading={isSubmitting}
      footer={
        <div className="flex items-center justify-end gap-2.5 w-full">
          <Button
            variant="ghost"
            size="md"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleSubmit}
            isLoading={isSubmitting}
          >
            Publish Circular
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {formError && (
          <div className="p-3 bg-danger-bg/40 border border-danger/30 rounded-xl flex items-start gap-2 text-xs font-semibold text-danger">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{formError}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3 bg-success-bg border border-success/30 rounded-xl flex items-start gap-2 text-xs font-semibold text-success">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Date & Week Label */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            id="price-effective-date"
            label="Effective Date"
            required
            helperText="Date circular takes millsite effect"
          >
            <Input
              type="date"
              id="price-effective-date"
              value={effectiveDate}
              onChange={handleDateChange}
              disabled={isSubmitting}
              required
            />
          </FormField>

          <FormField
            id="price-week-label"
            label="SRA Week Label"
            required
            helperText="Official reporting period title"
          >
            <Input
              type="text"
              id="price-week-label"
              placeholder="e.g. Week 3, September 2026"
              value={weekLabel}
              onChange={(e) => setWeekLabel(e.target.value)}
              disabled={isSubmitting}
              required
            />
          </FormField>
        </div>

        {/* Sugar Price & Molasses Price */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            id="price-sugar"
            label="Raw Sugar Price"
            required
            helperText={
              prevSugar !== null ? (
                <span>
                  Prev: ₱{prevSugar.toLocaleString()} ·{' '}
                  <span className={sugarChange > 0 ? 'text-success font-bold' : sugarChange < 0 ? 'text-danger font-bold' : 'text-hug-muted'}>
                    {sugarChange > 0 ? `+₱${sugarChange}` : sugarChange < 0 ? `-₱${Math.abs(sugarChange)}` : '₱0'}
                  </span>
                </span>
              ) : 'Price per 50-kg Lkg bag'
            }
          >
            <Input
              type="number"
              id="price-sugar"
              placeholder="e.g. 2950"
              prefix="₱"
              suffix="/ Lkg"
              value={sugarPrice}
              onChange={(e) => setSugarPrice(e.target.value)}
              disabled={isSubmitting}
              min="1"
              step="0.01"
              required
            />
          </FormField>

          <FormField
            id="price-molasses"
            label="Cane Molasses Price"
            required
            helperText={
              prevMolasses !== null ? (
                <span>
                  Prev: ₱{prevMolasses.toLocaleString()} ·{' '}
                  <span className={molassesChange > 0 ? 'text-success font-bold' : molassesChange < 0 ? 'text-danger font-bold' : 'text-hug-muted'}>
                    {molassesChange > 0 ? `+₱${molassesChange}` : molassesChange < 0 ? `-₱${Math.abs(molassesChange)}` : '₱0'}
                  </span>
                </span>
              ) : 'Price per Metric Ton'
            }
          >
            <Input
              type="number"
              id="price-molasses"
              placeholder="e.g. 11500"
              prefix="₱"
              suffix="/ MT"
              value={molassesPrice}
              onChange={(e) => setMolassesPrice(e.target.value)}
              disabled={isSubmitting}
              min="1"
              step="0.01"
              required
            />
          </FormField>
        </div>

        {/* Circular Number & Source */}
        <FormField
          id="price-circular-number"
          label="Official Circular / Reference No."
          required
          helperText="Official document reference code published by SRA"
        >
          <Input
            type="text"
            id="price-circular-number"
            placeholder="e.g. SRA-MD-2026-039"
            icon={FileText}
            value={circularNumber}
            onChange={(e) => setCircularNumber(e.target.value)}
            disabled={isSubmitting}
            required
          />
        </FormField>

        <FormField
          id="price-source"
          label="Issuing Authority / Source"
          required
          helperText="Originating agency or millsite market monitoring division"
        >
          <Input
            type="text"
            id="price-source"
            placeholder="Official SRA Sugar & Molasses Price Monitor"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            disabled={isSubmitting}
            required
          />
        </FormField>
      </form>
    </Modal>
  );
}
