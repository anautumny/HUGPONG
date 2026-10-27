import React, { useState } from 'react';
import { Sprout, ChevronRight, Layers, MapPin, CheckCircle2, User, Info } from 'lucide-react';
import { PaginationFooter } from '../ui/Table';

const FIELD_PAGE_SIZE = 10;

export default function CropProgressSection({
  progressData = null,
  isLoading = false,
  className = ''
}) {
  const [selectedStageNumber, setSelectedStageNumber] = useState(null);
  const [fieldPage, setFieldPage] = useState(1);

  if (isLoading) {
    return (
      <div className={`bg-surface rounded-2xl border border-border p-6 shadow-xs animate-pulse ${className}`}>
        <div className="h-5 w-48 bg-gray-200 dark:bg-gray-800 rounded mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 bg-gray-200 dark:bg-gray-800 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const {
    totalPlots = 0,
    totalAcreageHa = 0,
    stagesDistribution = []
  } = progressData || {};

  // Find dominant stage (stage with most acreage)
  const dominantStage = [...stagesDistribution].sort((a, b) => b.areaHa - a.areaHa)[0] || null;

  // Selected stage fields or all fields if none selected
  const displayedStage = selectedStageNumber
    ? stagesDistribution.find(s => s.stageNumber === selectedStageNumber)
    : null;

  const displayedFields = displayedStage ? displayedStage.fields : [];
  const fieldTotalPages = Math.max(1, Math.ceil(displayedFields.length / FIELD_PAGE_SIZE));
  const validFieldPage = Math.min(fieldPage, fieldTotalPages);
  const pagedFields = displayedFields.slice(
    (validFieldPage - 1) * FIELD_PAGE_SIZE,
    validFieldPage * FIELD_PAGE_SIZE
  );

  return (
    <div className={`bg-surface rounded-2xl border border-border p-5 sm:p-6 shadow-xs ${className}`}>
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 block mb-1">
            Agronomic Lifecycle
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-hug-text">
            Crop & Field Progress
          </h2>
          <p className="text-xs sm:text-sm text-hug-muted mt-0.5">
            Current stage distribution of registered plots across the 6 canonical sugarcane growth stages.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="bg-surface-subtle/80 dark:bg-surface border border-border px-4 py-2 rounded-xl shadow-2xs">
            <span className="text-xs text-hug-muted uppercase font-bold block tracking-wider">Total Plots</span>
            <span className="text-lg sm:text-xl font-black text-hug-text">{totalPlots}</span>
          </div>
          <div className="bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 dark:border-amber-500/40 px-4 py-2 rounded-xl shadow-2xs">
            <span className="text-xs text-amber-800 dark:text-amber-300 uppercase font-bold block tracking-wider">Total Hectares</span>
            <span className="text-lg sm:text-xl font-black text-amber-900 dark:text-amber-200">
              {totalAcreageHa.toFixed(2)} ha
            </span>
          </div>
        </div>
      </div>

      {totalPlots === 0 ? (
        <div className="py-12 text-center text-hug-muted text-xs">
          <Sprout className="w-8 h-8 mx-auto text-hug-muted/50 mb-2" />
          <p className="font-semibold text-hug-text text-sm">No plot progress recorded</p>
          <p className="text-xs text-hug-muted mt-0.5">
            No registered fields or active Crop Year Cycles match the current filter selection.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {/* Horizontal Stage Progression Track (6 Sugarcane Stages) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {stagesDistribution.map((stage) => {
              const isSelected = selectedStageNumber === stage.stageNumber;
              const hasParcels = stage.plotsCount > 0;

              return (
                <button
                  key={stage.stageNumber}
                  type="button"
                  onClick={() => {
                    setSelectedStageNumber(isSelected ? null : stage.stageNumber);
                    setFieldPage(1);
                  }}
                  className={`text-left p-4 rounded-2xl border transition-all relative flex flex-col justify-between ${
                    isSelected
                      ? 'border-amber-500 bg-amber-500/10 dark:bg-amber-500/15 shadow-sm ring-2 ring-amber-500/30'
                      : hasParcels
                      ? 'border-amber-500/40 dark:border-amber-500/30 bg-surface shadow-xs hover:border-amber-500/70 hover:shadow-md'
                      : 'border-border/60 bg-surface-subtle/30 opacity-70 hover:opacity-95 hover:border-border'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span className={`text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                        hasParcels
                          ? 'bg-amber-500/15 dark:bg-amber-500/25 text-amber-800 dark:text-amber-300 border border-amber-500/30'
                          : 'bg-surface-subtle text-hug-muted border border-border/50'
                      }`}>
                        Stage {stage.stageNumber}
                      </span>
                      <span className="text-xs font-bold text-hug-muted">
                        {stage.months}
                      </span>
                    </div>
                    <h4 className="text-sm sm:text-base font-black text-hug-text leading-tight mt-1">
                      {stage.shortName}
                    </h4>
                  </div>

                  <div className="mt-4 pt-2.5 border-t border-border/60 flex items-baseline justify-between">
                    <div>
                      <span className="text-xl sm:text-2xl font-black text-hug-text">
                        {stage.plotsCount}
                      </span>
                      <span className="text-xs font-semibold text-hug-muted ml-1.5">plots</span>
                    </div>

                    <div className="text-right">
                      <span className="text-sm sm:text-base font-black text-primary dark:text-primary-light block">
                        {stage.areaHa.toFixed(1)} ha
                      </span>
                      <span className={`inline-block text-xs font-black px-1.5 py-0.5 rounded-md mt-0.5 ${
                        hasParcels
                          ? 'bg-amber-500/15 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30'
                          : 'text-hug-muted'
                      }`}>
                        {stage.percentOfArea}%
                      </span>
                    </div>
                  </div>

                  {/* Visual progression bar in each stage card */}
                  <div className="w-full bg-surface-subtle dark:bg-surface-subtle/80 border border-border/40 h-2 rounded-full mt-2.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        hasParcels
                          ? 'bg-gradient-to-r from-primary via-primary-light to-amber-500'
                          : 'bg-hug-muted/30'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(stage.percentOfArea > 0 ? 8 : 0, stage.percentOfArea))}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Interactive Stage Inspector Details */}
          {displayedStage && (
            <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-border shadow-xs mt-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-sm sm:text-base font-black text-primary dark:text-primary-light uppercase tracking-tight">
                    Stage {displayedStage.stageNumber}: {displayedStage.name}
                  </span>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                    {displayedStage.months} · {displayedStage.plotsCount} plots · {displayedStage.areaHa.toFixed(2)} ha
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStageNumber(null);
                    setFieldPage(1);
                  }}
                  className="text-xs font-semibold text-primary hover:text-primary-hover underline self-start sm:self-auto cursor-pointer"
                >
                  Clear Selection
                </button>
              </div>

              {displayedFields.length === 0 ? (
                <p className="text-xs sm:text-sm text-hug-muted py-4 text-center">No plots currently in this stage.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-border text-hug-muted font-bold uppercase tracking-wider text-xs">
                        <th className="py-2.5 px-3">Plot ID</th>
                        <th className="py-2.5 px-3">Farm Member</th>
                        <th className="py-2.5 px-3">Block Farm</th>
                        <th className="py-2.5 px-3">Cane Variety</th>
                        <th className="py-2.5 px-3 text-right">Area (Ha)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 text-hug-text">
                      {pagedFields.map((f) => (
                        <tr key={f.id} className="hover:bg-surface-subtle/50 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-bold text-primary dark:text-primary-light">
                            {f.id}
                          </td>
                          <td className="py-2.5 px-3 font-semibold">
                            {f.memberName}
                          </td>
                          <td className="py-2.5 px-3 text-hug-muted">
                            {f.blockFarmName}
                          </td>
                          <td className="py-2.5 px-3 text-hug-muted">
                            {f.variety}
                          </td>
                          <td className="py-2.5 px-3 text-right font-black text-amber-800 dark:text-amber-300">
                            {f.areaHa.toFixed(2)} ha
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <PaginationFooter
                    currentPage={validFieldPage}
                    totalPages={fieldTotalPages}
                    totalItems={displayedFields.length}
                    onPageChange={setFieldPage}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
