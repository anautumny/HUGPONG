import React, { useState } from 'react';
import { Sprout, ChevronRight, Layers, MapPin, CheckCircle2, User, Info } from 'lucide-react';

export default function CropProgressSection({
  progressData = null,
  isLoading = false,
  className = ''
}) {
  const [selectedStageNumber, setSelectedStageNumber] = useState(null);

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

  return (
    <div className={`bg-surface rounded-2xl border border-border p-5 sm:p-6 shadow-xs ${className}`}>
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-hug-muted block">
            Agronomic Lifecycle
          </span>
          <h2 className="text-lg sm:text-xl font-black text-hug-text mt-0.5">
            Crop & Field Progress
          </h2>
          <p className="text-xs text-hug-muted mt-0.5">
            Current stage distribution of registered parcels across the 6 canonical sugarcane growth stages.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs shrink-0">
          <div className="bg-bg dark:bg-gray-800/60 px-3 py-1.5 rounded-xl border border-border">
            <span className="text-[10px] text-hug-muted uppercase font-bold block">Total Parcels</span>
            <span className="text-sm font-extrabold text-hug-text">{totalPlots}</span>
          </div>
          <div className="bg-bg dark:bg-gray-800/60 px-3 py-1.5 rounded-xl border border-border">
            <span className="text-[10px] text-hug-muted uppercase font-bold block">Total Acreage</span>
            <span className="text-sm font-extrabold text-primary dark:text-primary-light">
              {totalAcreageHa.toFixed(2)} ha
            </span>
          </div>
        </div>
      </div>

      {totalPlots === 0 ? (
        <div className="py-12 text-center text-hug-muted text-xs">
          <Sprout className="w-8 h-8 mx-auto text-hug-muted/50 mb-2" />
          <p className="font-semibold text-hug-text text-sm">No parcel progress recorded</p>
          <p className="text-xs text-hug-muted mt-0.5">
            No registered fields or active Crop Year Cycles match the current filter selection.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {/* Horizontal Stage Progression Track (6 Sugarcane Stages) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {stagesDistribution.map((stage) => {
              const isSelected = selectedStageNumber === stage.stageNumber;
              const hasParcels = stage.plotsCount > 0;

              return (
                <button
                  key={stage.stageNumber}
                  type="button"
                  onClick={() => setSelectedStageNumber(isSelected ? null : stage.stageNumber)}
                  className={`text-left p-3.5 rounded-xl border transition-all relative flex flex-col justify-between ${
                    isSelected
                      ? 'border-primary bg-primary-bg/20 dark:bg-primary/10 shadow-xs ring-2 ring-primary/20'
                      : hasParcels
                      ? 'border-border bg-bg/40 dark:bg-gray-800/40 hover:border-primary/50 hover:bg-bg'
                      : 'border-border/50 bg-bg/20 opacity-60'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-primary dark:text-primary-light">
                        Stage {stage.stageNumber}
                      </span>
                      <span className="text-[10px] text-hug-muted font-medium">
                        {stage.months}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-hug-text leading-tight">
                      {stage.shortName}
                    </h4>
                  </div>

                  <div className="mt-3 pt-2 border-t border-border/50 flex items-baseline justify-between">
                    <div>
                      <span className="text-base font-extrabold text-hug-text">
                        {stage.plotsCount}
                      </span>
                      <span className="text-[10px] text-hug-muted ml-1">plots</span>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-bold text-primary dark:text-primary-light">
                        {stage.areaHa.toFixed(1)} ha
                      </span>
                      <span className="block text-[9px] text-hug-muted">
                        {stage.percentOfArea}%
                      </span>
                    </div>
                  </div>

                  {/* Visual progression bar in each stage card */}
                  <div className="w-full bg-gray-200 dark:bg-gray-700 h-1 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-primary dark:bg-primary-light h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, stage.percentOfArea)}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Interactive Stage Inspector Details */}
          {displayedStage && (
            <div className="p-4 rounded-xl bg-bg/60 dark:bg-gray-800/40 border border-border mt-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-primary dark:text-primary-light uppercase">
                    Stage {displayedStage.stageNumber}: {displayedStage.name}
                  </span>
                  <span className="text-xs text-hug-muted font-medium">
                    ({displayedStage.months}) · {displayedStage.plotsCount} parcels · {displayedStage.areaHa.toFixed(2)} ha
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedStageNumber(null)}
                  className="text-xs text-hug-muted hover:text-hug-text underline self-start sm:self-auto"
                >
                  Clear Selection
                </button>
              </div>

              {displayedFields.length === 0 ? (
                <p className="text-xs text-hug-muted">No parcels currently in this stage.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border/80 text-hug-muted font-bold uppercase tracking-wider">
                        <th className="py-2 px-3">Parcel ID</th>
                        <th className="py-2 px-3">Farm Member</th>
                        <th className="py-2 px-3">Block Farm</th>
                        <th className="py-2 px-3">Cane Variety</th>
                        <th className="py-2 px-3 text-right">Area (Ha)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50 text-hug-text">
                      {displayedFields.map((f) => (
                        <tr key={f.id} className="hover:bg-bg/40">
                          <td className="py-2 px-3 font-mono font-bold text-primary dark:text-primary-light">
                            {f.id}
                          </td>
                          <td className="py-2 px-3 font-medium">
                            {f.memberName}
                          </td>
                          <td className="py-2 px-3 text-hug-muted">
                            {f.blockFarmName}
                          </td>
                          <td className="py-2 px-3 text-hug-muted">
                            {f.variety}
                          </td>
                          <td className="py-2 px-3 text-right font-extrabold">
                            {f.areaHa.toFixed(2)} ha
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
