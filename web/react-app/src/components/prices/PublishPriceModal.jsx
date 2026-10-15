import React, { useState, useEffect } from 'react';
import { FileText, Calendar, TrendingUp, AlertCircle, CheckCircle2 } from 'lucide-react';
import Modal from '../ui/Modal';
import FormField from '../ui/FormField';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { calculateSRAWeekLabel, publishPrice } from '../../services/pricesService';
import { PRICE_STATUSES, priceStatusLabel } from '../../utils/pricePresentation';

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
  const [source, setSource] = useState('');
  const [sugarStatus, setSugarStatus] = useState('REPORTED');
  const [molassesStatus, setMolassesStatus] = useState('REPORTED');
  
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
      setSource('');
      setSugarStatus('REPORTED');
      setMolassesStatus('REPORTED');
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
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
    if (sugarStatus === 'REPORTED' && (!Number.isFinite(curSugarNum) || curSugarNum <= 0)) {
      setFormError('Raw Sugar price must be a valid positive number.');
      return;
    }
    if (molassesStatus === 'REPORTED' && (!Number.isFinite(curMolassesNum) || curMolassesNum <= 0)) {
      setFormError('Molasses price must be a valid positive number.');
      return;
    }
    if (!circularNumber.trim()) {
      setFormError('Circular or reference number is required.');
      return;
    }
    if (!source.trim()) {
      setFormError('A verifiable source description is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        effectiveDate,
        weekLabel: weekLabel.trim(),
        sugarPricePerLkg: sugarStatus === 'REPORTED' ? curSugarNum : null,
        molassesPricePerMetricTon: molassesStatus === 'REPORTED' ? curMolassesNum : null,
        sugarPriceStatus: sugarStatus,
        molassesPriceStatus: molassesStatus,
        circularNumber: circularNumber.trim(),
        source: source.trim()
      };

      const result = await publishPrice(payload);
      if (result.success) {
        setSuccessMessage('Price reference published successfully.');
        if (typeof onPublished === 'function') {
          onPublished(result.data);
        }
        onClose();
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
      title="Publish Price Reference"
      subtitle="Publish a traceable domestic millsite sugar and molasses price record."
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
            loadingText="Publishing price..."
          >
            Publish Price Reference
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
            label="Reporting Period"
            required
            helperText="Reporting period shown on the source document"
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
          {[["Raw Sugar status", sugarStatus, setSugarStatus], ["Molasses status", molassesStatus, setMolassesStatus]].map(([label, status, update]) => <label key={label} className="text-xs font-semibold text-hug-text">{label}<select className="mt-2 block w-full rounded-xl border border-border bg-bg p-3" value={status} onChange={event => update(event.target.value)} disabled={isSubmitting}>{PRICE_STATUSES.map(value => <option key={value} value={value}>{priceStatusLabel(value)}</option>)}</select></label>)}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            id="price-sugar"
            label="Raw Sugar Price"
            required
            helperText="Only reported weeks have a price. Comparisons are calculated by the server."
          >
            <Input
              type="number"
              id="price-sugar"
              placeholder="e.g. 2950"
              prefix="₱"
              suffix="/ Lkg"
              value={sugarPrice}
              onChange={(e) => setSugarPrice(e.target.value)}
              disabled={isSubmitting || sugarStatus !== 'REPORTED'}
              min="1"
              step="0.01"
              required={sugarStatus === 'REPORTED'}
            />
          </FormField>

          <FormField
            id="price-molasses"
            label="Molasses Price"
            required
            helperText="Only reported weeks have a price. Comparisons are calculated by the server."
          >
            <Input
              type="number"
              id="price-molasses"
              placeholder="e.g. 11500"
              prefix="₱"
              suffix="/ MT"
              value={molassesPrice}
              onChange={(e) => setMolassesPrice(e.target.value)}
              disabled={isSubmitting || molassesStatus !== 'REPORTED'}
              min="1"
              step="0.01"
              required={molassesStatus === 'REPORTED'}
            />
          </FormField>
        </div>

        {/* Circular Number & Source */}
        <FormField
          id="price-circular-number"
          label="Circular / Reference No."
          required
          helperText="Reference code from the source document"
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
            placeholder="e.g. issuing agency, circular, or millsite bulletin"
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
