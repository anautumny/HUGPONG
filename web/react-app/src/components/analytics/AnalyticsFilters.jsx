import React from 'react';
import { Filter, Calendar, MapPin, Clock, RotateCcw } from 'lucide-react';
import Select from '../ui/Select';
import Button from '../ui/Button';
import { formatCropYear } from '../../utils/formatters';

export default function AnalyticsFilters({
  seasons = [],
  currentSeason = '',
  selectedSeason = 'ALL',
  onSeasonChange,
  blockFarms = [],
  selectedFarmId = 'ALL',
  onFarmChange,
  fields = [],
  selectedFieldId = 'ALL',
  onFieldChange,
  periods = [],
  selectedPeriod = 'ALL',
  onPeriodChange,
  onResetFilters,
  isFarmManager = false,
  className = ''
}) {
  const seasonOptions = [
    { value: 'ALL', label: 'All Crop Year Cycles' },
    ...seasons.map(s => {
      const formatted = formatCropYear(s);
      const current = formatted === formatCropYear(currentSeason) ? ' (Current)' : '';
      return { value: formatted, label: `Crop Year Cycle ${formatted.replace('-', '–')}${current}` };
    })
  ];

  const farmOptions = [
    { value: 'ALL', label: isFarmManager ? 'All Assigned Parcels' : 'All Block Farms' },
    ...blockFarms.map(f => ({ value: f.id, label: f.name || f.id }))
  ];

  const periodOptions = [
    { value: 'ALL', label: 'All Recorded Periods' },
    ...periods.map(p => {
      // p is 'YYYY-MM'
      const [y, m] = p.split('-').map(Number);
      const date = new Date(y, m - 1, 1);
      const label = isNaN(date.getTime()) ? p : date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      return { value: p, label };
    })
  ];

  const fieldOptions = [
    { value: 'ALL', label: 'All Fields' },
    ...fields.map(field => ({ value: field.id, label: field.id }))
  ];

  const hasActiveFilters = selectedSeason !== 'ALL' || selectedFarmId !== 'ALL' || selectedFieldId !== 'ALL' || selectedPeriod !== 'ALL';

  return (
    <div className={`bg-white dark:bg-surface rounded-2xl border border-border p-4 sm:p-5 shadow-xs ${className}`}>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Filter Title & Indicator */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light flex items-center justify-center shrink-0">
            <Filter className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-hug-text flex items-center gap-2">
              <span>Analytics Scope</span>
              {hasActiveFilters && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light">
                  Filtered
                </span>
              )}
            </h3>
            <p className="text-xs text-hug-muted">
              Scope data across Crop Year Cycles, Block Farms, Fields, and reporting periods.
            </p>
          </div>
        </div>

        {/* Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 w-full lg:w-auto min-w-0">
          {/* Season Filter */}
          <div className="min-w-0">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-hug-muted mb-1">
              Crop Year Cycle
            </label>
            <Select
              value={selectedSeason}
              onChange={(e) => onSeasonChange(e.target.value)}
              options={seasonOptions}
            />
          </div>

          {/* Farm Filter */}
          <div className="min-w-0">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-hug-muted mb-1">
              {isFarmManager ? 'Block Farm / Area' : 'Block Farm Scope'}
            </label>
            <Select
              value={selectedFarmId}
              onChange={(e) => onFarmChange(e.target.value)}
              options={farmOptions}
            />
          </div>

          <div className="min-w-0">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-hug-muted mb-1">Field</label>
            <Select
              value={selectedFieldId}
              onChange={(e) => onFieldChange(e.target.value)}
              options={fieldOptions}
            />
          </div>

          {/* Period Filter */}
          <div className="min-w-0">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-hug-muted mb-1">
              Reporting Period
            </label>
            <Select
              value={selectedPeriod}
              onChange={(e) => onPeriodChange(e.target.value)}
              options={periodOptions}
            />
          </div>
        </div>

        {/* Reset Filter Action */}
        {hasActiveFilters && (
          <div className="flex items-end shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={onResetFilters}
              icon={RotateCcw}
              className="text-xs text-hug-muted hover:text-hug-text"
            >
              Reset
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
