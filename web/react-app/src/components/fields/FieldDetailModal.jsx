import React from 'react';
import { Modal, Button, StatusBadge } from '../ui';
import { Layers, MapPin, User, Calendar, Sprout, Activity, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatHectares, formatDate } from '../../utils/formatters';
import { SUGARCANE_STAGES } from '../../services/operationsService';

export default function FieldDetailModal({
  isOpen = false,
  onClose,
  field = null,
  isManager = false,
  onEdit,
  onArchive
}) {
  const navigate = useNavigate();

  if (!field) return null;

  const stageObj = SUGARCANE_STAGES.find(s => s.stageNumber === Number(field.stageNumber || 1)) || SUGARCANE_STAGES[0];

  const handleTakeOver = () => {
    onClose();
    navigate(`/takeover?fieldId=${encodeURIComponent(field.id)}`);
  };

  const footer = (
    <>
      <Button variant="secondary" onClick={onClose}>
        Close
      </Button>
      {onEdit && (
        <Button variant="secondary" onClick={() => { onClose(); onEdit(field); }}>
          Edit Plot
        </Button>
      )}
      {isManager && field.status === 'ACTIVE' && (
        <Button
          variant="primary"
          onClick={handleTakeOver}
          icon={ArrowRight}
          iconPosition="right"
        >
          Take Over Plot
        </Button>
      )}
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={`Field Plot ${field.id}`}
      subtitle={`${field.blockFarmName || 'Assigned Block Farm'} · Detailed Plot Inspection`}
      badge={field.status || 'ACTIVE'}
      icon={Layers}
      footer={footer}
    >
      <div className="space-y-5">
        {/* Top Summary Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-bg dark:bg-[#0C1015] p-4 rounded-2xl border border-border">
          <div>
            <span className="text-[10px] font-bold text-hug-muted uppercase tracking-wider block">
              Cultivated Area
            </span>
            <span className="text-base sm:text-lg font-black text-hug-text mt-0.5 block">
              {formatHectares(field.areaHa || field.ha)}
            </span>
          </div>

          <div>
            <span className="text-[10px] font-bold text-hug-muted uppercase tracking-wider block">
              Current Stage
            </span>
            <span className="text-base sm:text-lg font-black text-primary mt-0.5 block">
              Stage {field.stageNumber || 1}
            </span>
          </div>

          <div>
            <span className="text-[10px] font-bold text-hug-muted uppercase tracking-wider block">
              Variety
            </span>
            <span className="text-xs sm:text-sm font-bold text-hug-text mt-1 block truncate">
              {field.variety || 'Standard Cane'}
            </span>
          </div>

          <div>
            <span className="text-[10px] font-bold text-hug-muted uppercase tracking-wider block">
              Soil Type
            </span>
            <span className="text-xs sm:text-sm font-bold text-hug-text mt-1 block truncate">
              {field.soilType || 'Clay Loam'}
            </span>
          </div>
        </div>

        {/* Ownership & Block Farm Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl border border-border bg-white dark:bg-surface space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-hug-text uppercase tracking-wider">
              <User className="w-4 h-4 text-primary" />
              <span>Assigned Member Farmer</span>
            </div>
            <p className="text-sm font-extrabold text-hug-text">
              {field.memberName || 'Unassigned'}
            </p>
            {field.memberPhone && (
              <p className="text-xs text-hug-muted font-mono">
                Contact: {field.memberPhone}
              </p>
            )}
            <p className="text-[11px] text-hug-muted">
              Member identity holds personal field stewardship.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-white dark:bg-surface space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-hug-text uppercase tracking-wider">
              <MapPin className="w-4 h-4 text-primary" />
              <span>Parent Block Farm</span>
            </div>
            <p className="text-sm font-extrabold text-hug-text">
              {field.blockFarmName || field.blockFarmId}
            </p>
            <p className="text-xs text-hug-muted font-mono">
              Farm ID: {field.blockFarmId}
            </p>
            <p className="text-[11px] text-hug-muted">
              Aggregated under SRA cooperative boundary jurisdiction.
            </p>
          </div>
        </div>

        {/* Crop Cycle Progress Banner */}
        <div className="p-4 rounded-xl bg-primary-bg/50 dark:bg-primary/10 border border-primary/20 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-primary dark:text-primary-light uppercase tracking-wider flex items-center gap-1.5">
              <Sprout className="w-4 h-4" />
              Active Crop Cycle
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white dark:bg-surface text-primary border border-primary/20 font-mono">
              Cycle {field.cycleNumber || 1} ({field.cycleType || 'Plant Cane'})
            </span>
          </div>
          <p className="text-sm font-bold text-hug-text">
            {stageObj.name}
          </p>
          <p className="text-xs text-hug-muted">
            {stageObj.description} · Timeline: <strong>{stageObj.months}</strong>
          </p>
        </div>

        {/* Registration Metadata */}
        <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs text-hug-muted">
          <span>Created: {formatDate(field.createdAt)}</span>
          <span>Last Updated: {formatDate(field.updatedAt)}</span>
        </div>
      </div>
    </Modal>
  );
}
