import React, { useState } from 'react';
import { Filter } from 'lucide-react';
import Select from '../ui/Select';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { formatCropYear } from '../../utils/formatters';
import { filterOperationsByCropYearCycle } from '../../services/analyticsSelectors';

function FilterSelect({ label, ...props }) {
  return <label className="block space-y-1.5"><span className="text-xs font-semibold text-hug-muted">{label}</span><Select {...props} aria-label={label} /></label>;
}

export default function AnalyticsFilters({
  seasons = [], currentSeason = '', selectedSeason = 'ALL', onSeasonChange,
  blockFarms = [], selectedFarmId = 'ALL', onFarmChange,
  fields = [], selectedFieldId = 'ALL', onFieldChange,
  selectedPeriod = 'ALL', onPeriodChange,
  operations = [], cropCycles = [], isMember = false, className = ''
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({});
  const defaults = { season: currentSeason || 'ALL', farm: 'ALL', field: 'ALL', period: 'ALL' };
  const selected = { season: selectedSeason, farm: selectedFarmId, field: selectedFieldId, period: selectedPeriod };
  const count = Object.keys(defaults).filter(key => selected[key] !== defaults[key]).length;
  const draftFields = fields.filter(field => draft.farm === 'ALL' || field.blockFarmId === draft.farm);
  const fieldIds = new Set(draftFields.map(field => field.id));
  const periods = [...new Set(filterOperationsByCropYearCycle({ operations, cropCycles, selectedSeason: draft.season })
    .filter(op => fieldIds.has(op.fieldId) && (draft.field === 'ALL' || draft.field === op.fieldId))
    .map(op => String(op.performedOn || op.isoDate || op.date || '').slice(0, 7)).filter(Boolean))].sort().reverse();
  const farmName = selectedFarmId === 'ALL' ? 'All farms' : blockFarms.find(farm => farm.id === selectedFarmId)?.name || selectedFarmId;
  const summary = [selectedSeason === 'ALL' ? 'All crop years' : selectedSeason, !isMember && farmName, selectedFieldId === 'ALL' ? 'All plots' : selectedFieldId, selectedPeriod === 'ALL' ? 'All periods' : selectedPeriod].filter(Boolean).join(' · ');
  const apply = () => {
    onSeasonChange(draft.season); onFarmChange(draft.farm);
    onFieldChange(draftFields.some(field => field.id === draft.field) ? draft.field : 'ALL');
    onPeriodChange(periods.includes(draft.period) ? draft.period : 'ALL');
    setOpen(false);
  };
  return <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
    <p className="min-w-0 flex-1 text-xs leading-relaxed text-hug-muted">{summary}</p>
    <Button variant="secondary" size="sm" icon={Filter} onClick={() => { setDraft(selected); setOpen(true); }}>Filters{count ? ` (${count})` : ''}</Button>
    <Modal isOpen={open} onClose={() => setOpen(false)} title="Filters" subtitle="Choose the records to include" size="sm" closeOnBackdrop
      footer={<><Button variant="ghost" onClick={() => setDraft(defaults)}>Reset</Button><Button variant="primary" onClick={apply}>Apply filters</Button></>}>
      <div className="space-y-4">
        <FilterSelect label="Crop year" value={draft.season || 'ALL'} onChange={event => setDraft(value => ({ ...value, season: event.target.value, period: 'ALL' }))}
          options={[{ value: 'ALL', label: 'All crop years' }, ...seasons.filter(year => year !== 'ALL').map(year => ({ value: formatCropYear(year), label: `${formatCropYear(year)}${year === currentSeason ? ' (Current)' : ''}` }))]} />
        {!isMember && blockFarms.length > 1 && <FilterSelect label="Block farm" value={draft.farm || 'ALL'} onChange={event => setDraft(value => ({ ...value, farm: event.target.value, field: 'ALL', period: 'ALL' }))}
          options={[{ value: 'ALL', label: 'All farms' }, ...blockFarms.map(farm => ({ value: farm.id, label: farm.name || farm.id }))]} />}
        <FilterSelect label="Plot" value={draft.field || 'ALL'} onChange={event => setDraft(value => ({ ...value, field: event.target.value, period: 'ALL' }))}
          options={[{ value: 'ALL', label: 'All plots' }, ...draftFields.map(field => ({ value: field.id, label: field.id }))]} />
        <FilterSelect label="Reporting period" value={draft.period || 'ALL'} onChange={event => setDraft(value => ({ ...value, period: event.target.value }))}
          options={[{ value: 'ALL', label: 'All periods' }, ...periods.map(period => ({ value: period, label: period }))]} />
      </div>
    </Modal>
  </div>;
}
