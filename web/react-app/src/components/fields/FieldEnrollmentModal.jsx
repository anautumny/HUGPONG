import React, { useState } from 'react';
import { Modal, FormField, Input, Select, Button } from '../ui';
import { MapPin, Layers } from 'lucide-react';
import { createField } from '../../services/fieldsService';

const SUGARCANE_VARIETIES = [
  'VMC 84-524',
  'Phil 2006-228',
  'Phil 99-1793',
  'Phil 58-260',
  'Phil 80-13',
  'Other / Local High Yield'
];

const SOIL_TYPES = [
  'Clay Loam',
  'Sandy Loam',
  'Loam',
  'Clay',
  'Silt Loam',
  'Sandy Clay Loam'
];

const currentYear = new Date().getFullYear();
const currentStart = new Date().getMonth() >= 8 ? currentYear : currentYear - 1;
const CROP_YEAR_OPTIONS = [
  `${currentStart - 1}-${currentStart}`,
  `${currentStart}-${currentStart + 1}`,
  `${currentStart + 1}-${currentStart + 2}`
];

export default function FieldEnrollmentModal({
  isOpen = false,
  onClose,
  blockFarms = [],
  memberUsers = [],
  defaultBlockFarmId = '',
  onSuccess
}) {
  const [fieldId, setFieldId] = useState('');
  const [blockFarmId, setBlockFarmId] = useState(defaultBlockFarmId);
  const [memberUserId, setMemberUserId] = useState('');
  const [areaHa, setAreaHa] = useState('');
  const [variety, setVariety] = useState(SUGARCANE_VARIETIES[0]);
  const [soilType, setSoilType] = useState(SOIL_TYPES[0]);
  const [cropYear, setCropYear] = useState(CROP_YEAR_OPTIONS[1]);
  const [initialStage, setInitialStage] = useState('1');

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);

  const handleBlockFarmChange = (e) => {
    setBlockFarmId(e.target.value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError(null);

    const validation = {};
    const cleanId = fieldId.trim().toUpperCase();

    if (!cleanId) {
      validation.fieldId = 'Field Plot ID is required.';
    } else if (!/^[A-Z0-9_-]{3,80}$/.test(cleanId)) {
      validation.fieldId = 'Field ID must be 3-80 alphanumeric characters (e.g. FLD-005).';
    }

    const cleanBf = blockFarmId || defaultBlockFarmId;
    if (!cleanBf) {
      validation.blockFarmId = 'Parent Block Farm is required.';
    }

    const numHa = Number(areaHa);
    if (!areaHa || isNaN(numHa) || numHa <= 0) {
      validation.areaHa = 'Enter a valid area in hectares (> 0).';
    }

    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        id: cleanId,
        blockFarmId: cleanBf,
        memberUserId: memberUserId || null,
        areaHa: numHa,
        variety,
        soilType,
        cropYear,
        currentStageNumber: Number(initialStage) || 1
      };

      await createField(payload);
      setIsSubmitting(false);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('[FieldEnrollment] Error:', err);
      setServerError(err.message || 'Failed to enroll field plot.');
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title="Enroll New Field Plot"
      subtitle="Register an individual sugarcane parcel and assign a member farmer."
      badge="Field Parcel Allocation"
      icon={Layers}
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
            loadingText="Saving field..."
          >
            Enroll Field Plot
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

        {/* 1. Plot ID & Block Farm */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <FormField
            id="field-id-input"
            label="Field Plot ID"
            required
            helperText="e.g. FLD-005 or FLD-NCY-001"
            error={errors.fieldId}
          >
            <Input
              id="field-id-input"
              value={fieldId}
              onChange={(e) => {
                setFieldId(e.target.value.toUpperCase());
                if (errors.fieldId) setErrors(prev => ({ ...prev, fieldId: null }));
              }}
              placeholder="FLD-005"
              error={Boolean(errors.fieldId)}
              disabled={isSubmitting}
            />
          </FormField>

          <FormField
            id="block-farm-select"
            label="Parent Block Farm"
            required
            error={errors.blockFarmId}
          >
            <Select
              id="block-farm-select"
              value={blockFarmId || defaultBlockFarmId}
              onChange={handleBlockFarmChange}
              disabled={isSubmitting || blockFarms.length === 0}
              placeholder="Select Block Farm..."
              options={blockFarms.map(bf => ({
                value: bf.id,
                label: `${bf.name} (${bf.code || bf.id})`
              }))}
            />
          </FormField>
        </div>

        {/* 2. Assigned Member Farmer */}
        <FormField
          id="member-user-select"
          label="Assigned Farmer Member"
          helperText="Select a registered Member Farmer in this district."
        >
          <Select
            id="member-user-select"
            value={memberUserId}
            onChange={(e) => setMemberUserId(e.target.value)}
            disabled={isSubmitting}
            placeholder="Unassigned (Can assign later)..."
            options={memberUsers.map(m => ({
              value: m.id || m.employeeId,
              label: `${m.displayName || m.name} (${m.phone || m.id})`
            }))}
          />
        </FormField>

        {/* 3. Parcel Area, Variety, Soil Type */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <FormField
            id="area-ha-input"
            label="Plot Area"
            required
            error={errors.areaHa}
          >
            <Input
              id="area-ha-input"
              type="number"
              step="0.01"
              min="0.01"
              max="500"
              placeholder="1.50"
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

          <FormField
            id="variety-select"
            label="Cane Variety"
          >
            <Select
              id="variety-select"
              value={variety}
              onChange={(e) => setVariety(e.target.value)}
              disabled={isSubmitting}
              options={SUGARCANE_VARIETIES.map(v => ({ value: v, label: v }))}
            />
          </FormField>

          <FormField
            id="soil-select"
            label="Soil Type"
          >
            <Select
              id="soil-select"
              value={soilType}
              onChange={(e) => setSoilType(e.target.value)}
              disabled={isSubmitting}
              options={SOIL_TYPES.map(s => ({ value: s, label: s }))}
            />
          </FormField>
        </div>

        {/* 4. Initial Crop Stage & Crop Year */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <FormField
            id="initial-stage-select"
            label="Initial Crop Stage"
            helperText="New crop cycle starts at this stage."
          >
            <Select
              id="initial-stage-select"
              value={initialStage}
              onChange={(e) => setInitialStage(e.target.value)}
              disabled={isSubmitting}
              options={[
                { value: '1', label: 'Stage 1: Pre-Planting & Land Preparation' },
                { value: '2', label: 'Stage 2: Planting & Crop Establishment' },
                { value: '3', label: 'Stage 3: Basal Nutrition & Early Care' },
                { value: '4', label: 'Stage 4: Cultivation & Weed Management' },
                { value: '5', label: 'Stage 5: Crop Maintenance & Final Hilling-Up' },
                { value: '6', label: 'Stage 6: Harvesting & Hauling' }
              ]}
            />
          </FormField>

          <FormField
            id="crop-year-select"
            label="Crop Year (CY)"
            helperText="Official SRA milling season."
          >
            <Select
              id="crop-year-select"
              value={cropYear}
              onChange={(e) => setCropYear(e.target.value)}
              disabled={isSubmitting}
              options={CROP_YEAR_OPTIONS.map(cy => ({ value: cy, label: cy }))}
            />
          </FormField>
        </div>
      </form>
    </Modal>
  );
}
