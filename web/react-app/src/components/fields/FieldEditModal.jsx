import React, { useState, useEffect } from 'react';
import { Modal, FormField, Input, Select, Button } from '../ui';
import { Edit3 } from 'lucide-react';
import { updateField } from '../../services/fieldsService';
import { formatCropYearDisplay } from '../../utils/formatters';

export default function FieldEditModal({
  isOpen = false,
  onClose,
  field = null,
  blockFarms = [],
  memberUsers = [],
  onSuccess
}) {
  const [blockFarmId, setBlockFarmId] = useState('');
  const [memberUserId, setMemberUserId] = useState('');
  const [areaHa, setAreaHa] = useState('');

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);

  useEffect(() => {
    if (field) {
      setBlockFarmId(field.blockFarmId || '');
      setMemberUserId(field.memberUserId || '');
      setAreaHa(String(field.areaHa || field.ha || ''));
      setErrors({});
      setServerError(null);
    }
  }, [field]);

  if (!field) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError(null);

    const validation = {};
    const numHa = Number(areaHa);
    if (!areaHa || isNaN(numHa) || numHa <= 0) {
      validation.areaHa = 'Enter a valid area in hectares (> 0).';
    }

    if (!blockFarmId) {
      validation.blockFarmId = 'Parent Block Farm is required.';
    }

    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        blockFarmId,
        memberUserId: memberUserId || null,
        areaHa: numHa
      };

      await updateField(field.id, payload);
      setIsSubmitting(false);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('[FieldEdit] Error:', err);
      setServerError(err.message || 'Failed to update field plot.');
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={`Edit Field ${field.id}`}
      subtitle="Modify registered acreage or field owner assignment."
      badge="Plot Configuration"
      icon={Edit3}
      preventBackdropClose={isSubmitting}
      preventEscapeClose={isSubmitting}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            isLoading={isSubmitting}
            loadingText="Updating field..."
          >
            Save Changes
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {serverError && (
          <div className="p-3 bg-danger-bg dark:bg-danger/20 border border-danger/30 rounded-xl text-xs font-bold text-danger">
            {serverError}
          </div>
        )}

        <div className="flex items-center justify-between p-3 bg-bg dark:bg-[#0C1015] rounded-xl border border-border">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-hug-muted">Field ID</span>
            <span className="text-sm font-mono font-bold text-primary">{field.id}</span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-[10px] uppercase font-bold text-hug-muted">Status</span>
            <span className="text-xs font-bold text-success">{field.status || 'ACTIVE'}</span>
          </div>
        </div>

        {/* Block Farm & Assigned Member */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <FormField
            id="edit-block-farm"
            label="Parent Block Farm"
            required
            error={errors.blockFarmId}
          >
            <Select
              id="edit-block-farm"
              value={blockFarmId}
              onChange={(e) => setBlockFarmId(e.target.value)}
              disabled={isSubmitting}
              options={blockFarms.map(bf => ({
                value: bf.id,
                label: `${bf.name} (${bf.code || bf.id})`
              }))}
            />
          </FormField>

          <FormField
            id="edit-member-user"
            label="Assigned Field Owner"
          >
            <Select
              id="edit-member-user"
              value={memberUserId}
              onChange={(e) => setMemberUserId(e.target.value)}
              disabled={isSubmitting}
              placeholder="Unassigned (No member)..."
              options={memberUsers.map(m => ({
                value: m.id || m.employeeId,
                label: `${m.displayName || m.name} (${m.phone || m.id})`
              }))}
            />
          </FormField>
        </div>

        {/* Persistent parcel attributes */}
        <div>
          <FormField
            id="edit-area-ha"
            label="Plot Area"
            required
            error={errors.areaHa}
          >
            <Input
              id="edit-area-ha"
              type="number"
              step="0.01"
              min="0.01"
              max="500"
              suffix="ha"
              value={areaHa}
              onChange={(e) => {
                setAreaHa(e.target.value);
                if (errors.areaHa) setErrors(prev => ({ ...prev, areaHa: null }));
              }}
              error={Boolean(errors.areaHa)}
              disabled={isSubmitting}
            />
          </FormField>

        </div>

        {/* Crop Year Cycle is changed only through the renewal workflow. */}
        <FormField
          id="edit-crop-year"
          label="Crop Year Cycle"
          helperText="Stored cycle context. Start a legitimate new cycle to change it."
        >
          <Input
            id="edit-crop-year"
            value={formatCropYearDisplay(field.cropYear || field.cropCycle?.cropYear)}
            readOnly
            disabled
          />
        </FormField>
      </form>
    </Modal>
  );
}
