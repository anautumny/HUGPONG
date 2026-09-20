import React, { useState } from 'react';
import {
  Button,
  FormField,
  Input,
  PasswordInput,
  Textarea,
  Select,
  Checkbox,
  RadioGroup,
  Badge,
  StatusBadge,
  Modal,
  ConfirmDialog,
  Table,
  TablePagination,
  EmptyState,
  LoadingState,
  Skeleton,
  ErrorState
} from '../components/ui';
import { Plus, Trash2, CheckCircle, AlertCircle, Save, Sparkles, Filter } from 'lucide-react';

export default function ComponentShowcaseView() {
  // Button loading states
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [textVal, setTextVal] = useState('');
  const [numVal, setNumVal] = useState('2850');
  const [dateVal, setDateVal] = useState('2026-09-18');
  const [passVal, setPassVal] = useState('Secret123');
  const [notesVal, setNotesVal] = useState('');
  const [selectVal, setSelectVal] = useState('ACTIVE');
  const [checkVal, setCheckVal] = useState(true);
  const [radioVal, setRadioVal] = useState('A');
  const [hasError, setHasError] = useState(false);

  // Modal states
  const [activeModalSize, setActiveModalSize] = useState(null); // 'sm' | 'md' | 'lg' | null
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Table state
  const [tableLoading, setTableLoading] = useState(false);
  const [tableEmpty, setTableEmpty] = useState(false);
  const [tableError, setTableError] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const sampleData = [
    { id: 'FLD-001', name: 'North Plot Silay', area: '4.50 ha', crop: 'Sugarcane Phil 2006-228', status: 'ACTIVE' },
    { id: 'FLD-002', name: 'East Boundary Field', area: '3.20 ha', crop: 'Sugarcane VMC 84-524', status: 'PENDING' },
    { id: 'FLD-003', name: 'River Basin Sector', area: '6.80 ha', crop: 'Sugarcane Phil 2006-228', status: 'ARCHIVED' },
    { id: 'FLD-004', name: 'Central Plantation', area: '5.10 ha', crop: 'Sugarcane VMC 86-550', status: 'ACTIVE' }
  ];

  const columns = [
    { key: 'id', header: 'Field ID', cellClassName: 'font-mono font-bold text-xs text-primary' },
    { key: 'name', header: 'Plot Name', cellClassName: 'font-bold' },
    { key: 'area', header: 'Cultivated Area' },
    { key: 'crop', header: 'Crop Variety' },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (val) => <StatusBadge status={val} />
    }
  ];

  const handleSimulateSave = () => {
    setIsSaving(true);
    setTimeout(() => setIsSaving(false), 1500);
  };

  const handleSimulateSubmit = () => {
    setIsSubmitting(true);
    setTimeout(() => setIsSubmitting(false), 1500);
  };

  const handleSimulateConfirm = () => {
    setConfirmLoading(true);
    setTimeout(() => {
      setConfirmLoading(false);
      setConfirmOpen(false);
    }, 1200);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-primary dark:text-primary-light uppercase tracking-wider">
              Design System
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light">
              Component Library
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-hug-text tracking-tight mt-1">
            Reusable UI Component Foundation
          </h1>
          <p className="text-xs sm:text-sm text-hug-muted mt-1 max-w-2xl">
            Standardized primitives conforming to HUGPONG visual design tokens, responsive layouts, and accessible UI controls.
          </p>
        </div>
      </div>

      {/* 1. Buttons Section */}
      <section className="space-y-4">
        <h2 className="text-base font-bold text-hug-text uppercase tracking-wider border-b border-border/60 pb-2">
          1. Button System & Action Loading
        </h2>

        <div className="bg-white dark:bg-surface rounded-2xl p-5 border border-border space-y-5 shadow-xs">
          <div>
            <span className="text-xs font-bold text-hug-muted block mb-3">Intent Variants</span>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary">Primary Action</Button>
              <Button variant="secondary">Secondary Action</Button>
              <Button variant="ghost">Ghost / Text</Button>
              <Button variant="destructive">Destructive Action</Button>
            </div>
          </div>

          <div>
            <span className="text-xs font-bold text-hug-muted block mb-3">Sizes</span>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small (sm)</Button>
              <Button size="md">Medium (md)</Button>
              <Button size="lg">Large (lg)</Button>
            </div>
          </div>

          <div>
            <span className="text-xs font-bold text-hug-muted block mb-3">Action-Level Loading Feedback</span>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                onClick={handleSimulateSave}
                isLoading={isSaving}
                loadingText="Saving operation..."
                icon={Save}
              >
                Save Operation
              </Button>

              <Button
                variant="destructive"
                onClick={handleSimulateSubmit}
                isLoading={isSubmitting}
                loadingText="Archiving record..."
                icon={Trash2}
              >
                Archive Record
              </Button>

              <Button disabled>Disabled Button</Button>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Form Fields & Inputs */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-2">
          <h2 className="text-base font-bold text-hug-text uppercase tracking-wider">
            2. Form Inputs, Select & Validation
          </h2>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setHasError(!hasError)}
          >
            Toggle Validation Errors: {hasError ? 'ON' : 'OFF'}
          </Button>
        </div>

        <div className="bg-white dark:bg-surface rounded-2xl p-5 sm:p-6 border border-border shadow-xs space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              id="showcase-text"
              label="Block Farm Name"
              required
              badge="Required"
              helperText="Enter the official registered cooperative or farm name."
              error={hasError ? 'Block Farm name is required.' : null}
            >
              <Input
                id="showcase-text"
                placeholder="e.g. Silay District Cooperative"
                value={textVal}
                onChange={(e) => setTextVal(e.target.value)}
                error={hasError}
              />
            </FormField>

            <FormField
              id="showcase-price"
              label="Raw Sugar Benchmark Price"
              required
              helperText="Published in PHP per 50kg Lkg bag."
              error={hasError ? 'Enter a valid numeric price.' : null}
            >
              <Input
                id="showcase-price"
                type="number"
                prefix="₱"
                suffix="/ Lkg"
                value={numVal}
                onChange={(e) => setNumVal(e.target.value)}
                error={hasError}
              />
            </FormField>

            <FormField
              id="showcase-date"
              label="Effective Broadcast Date"
              required
            >
              <Input
                id="showcase-date"
                type="date"
                value={dateVal}
                onChange={(e) => setDateVal(e.target.value)}
              />
            </FormField>

            <FormField
              id="showcase-password"
              label="Supervisor Authorization PIN"
              required
              helperText="Used to authorize supervisor take-over and amendment actions."
              error={hasError ? 'PIN must be at least 6 characters.' : null}
            >
              <PasswordInput
                id="showcase-password"
                value={passVal}
                onChange={(e) => setPassVal(e.target.value)}
                error={hasError}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border/60">
            <FormField
              id="showcase-select"
              label="Field Lifecycle Status"
              helperText="Select the operational lifecycle stage."
            >
              <Select
                id="showcase-select"
                value={selectVal}
                onChange={(e) => setSelectVal(e.target.value)}
                options={[
                  { value: 'ACTIVE', label: 'Active — Currently Cultivated' },
                  { value: 'PENDING', label: 'Pending — Verification Required' },
                  { value: 'ARCHIVED', label: 'Archived — Cycle Completed' }
                ]}
              />
            </FormField>

            <div className="space-y-3 pt-2">
              <span className="text-xs font-semibold text-hug-text2 block">
                Single-Select Options (RadioGroup)
              </span>
              <RadioGroup
                name="showcase-radio"
                value={radioVal}
                onChange={setRadioVal}
                options={[
                  { value: 'A', label: 'Standard Milling Season Mode', description: 'Real-time synchronization with millsite logs' },
                  { value: 'B', label: 'Maintenance Standby Mode', description: 'Queued local offline buffer' }
                ]}
              />
            </div>
          </div>

          <div className="pt-2 border-t border-border/60">
            <FormField
              id="showcase-notes"
              label="Field Operation Log Notes"
              helperText="Optional details regarding fertilizer input or labor force."
            >
              <Textarea
                id="showcase-notes"
                placeholder="Specify contractor name, weather conditions, or equipment..."
                value={notesVal}
                onChange={(e) => setNotesVal(e.target.value)}
                rows={3}
                maxLength={200}
                showCount
              />
            </FormField>
          </div>

          <div className="pt-2 border-t border-border/60">
            <Checkbox
              id="showcase-consent"
              checked={checkVal}
              onChange={(e) => setCheckVal(e.target.checked)}
              label="I certify all operational logs comply with SRA compliance standards"
              description="Authoritative timestamps will be recorded and sealed against the active crop cycle."
            />
          </div>
        </div>
      </section>

      {/* 3. Badges & Status Indicators */}
      <section className="space-y-4">
        <h2 className="text-base font-bold text-hug-text uppercase tracking-wider border-b border-border/60 pb-2">
          3. Badges & Status Indicators
        </h2>

        <div className="bg-white dark:bg-surface rounded-2xl p-5 border border-border shadow-xs space-y-4">
          <div>
            <span className="text-xs font-bold text-hug-muted block mb-2.5">Manual Semantic Badges</span>
            <div className="flex flex-wrap items-center gap-2.5">
              <Badge variant="success" dot>Active</Badge>
              <Badge variant="warning" dot>Pending Review</Badge>
              <Badge variant="danger" dot>Sync Failed</Badge>
              <Badge variant="info">SRA Circular</Badge>
              <Badge variant="neutral">Archived</Badge>
            </div>
          </div>

          <div>
            <span className="text-xs font-bold text-hug-muted block mb-2.5">Automatic Status Badge Resolver</span>
            <div className="flex flex-wrap items-center gap-2.5">
              <StatusBadge status="ACTIVE" />
              <StatusBadge status="PENDING" />
              <StatusBadge status="CERTIFIED" />
              <StatusBadge status="HEALTHY" />
              <StatusBadge status="CRITICAL" />
              <StatusBadge status="ARCHIVED" />
            </div>
          </div>
        </div>
      </section>

      {/* 4. Table Component */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-2">
          <h2 className="text-base font-bold text-hug-text uppercase tracking-wider">
            4. Table System (Readability & States)
          </h2>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setTableLoading(!tableLoading);
                setTableEmpty(false);
                setTableError(false);
              }}
            >
              Toggle Loading
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setTableEmpty(!tableEmpty);
                setTableLoading(false);
                setTableError(false);
              }}
            >
              Toggle Empty
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setTableError(!tableError);
                setTableLoading(false);
                setTableEmpty(false);
              }}
            >
              Toggle Error
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Table
            columns={columns}
            data={tableEmpty ? [] : sampleData}
            isLoading={tableLoading}
            error={tableError ? 'Unable to load registered member fields from the database.' : null}
            onRetry={() => setTableError(false)}
            emptyMessage="No member plots registered yet."
            emptySubtext="Enrolled sugarcane plots for this block farm will appear here."
            emptyAction={<Button size="sm">Register First Plot</Button>}
          />
          <TablePagination
            currentPage={currentPage}
            totalPages={3}
            totalItems={12}
            onPageChange={setCurrentPage}
          />
        </div>
      </section>

      {/* 5. Modals & Confirmation Dialogs */}
      <section className="space-y-4">
        <h2 className="text-base font-bold text-hug-text uppercase tracking-wider border-b border-border/60 pb-2">
          5. Modal System & Confirmation Dialogs
        </h2>

        <div className="bg-white dark:bg-surface rounded-2xl p-5 border border-border shadow-xs flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => setActiveModalSize('sm')}>
            Open Small Modal (sm)
          </Button>

          <Button variant="primary" onClick={() => setActiveModalSize('md')}>
            Open Medium Modal (md)
          </Button>

          <Button variant="secondary" onClick={() => setActiveModalSize('lg')}>
            Open Large Modal (lg)
          </Button>

          <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
            Open Confirmation Dialog
          </Button>
        </div>
      </section>

      {/* 6. Feedback & Recovery States */}
      <section className="space-y-4">
        <h2 className="text-base font-bold text-hug-text uppercase tracking-wider border-b border-border/60 pb-2">
          6. Standalone Feedback States
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-surface rounded-2xl border border-border shadow-xs">
            <EmptyState
              title="No audit reports submitted"
              description="Monthly compilation dossiers awaiting certification will be listed here."
              action={<Button size="sm" variant="secondary">Compile Report</Button>}
            />
          </div>

          <div className="bg-white dark:bg-surface rounded-2xl border border-border shadow-xs flex items-center justify-center">
            <LoadingState message="Synchronizing with cloud..." />
          </div>

          <div className="bg-white dark:bg-surface rounded-2xl border border-border shadow-xs">
            <ErrorState
              title="Sync connection interrupted"
              message="Failed to stream Firestore document snapshot."
              onRetry={() => alert('Retry triggered')}
            />
          </div>
        </div>
      </section>

      {/* Modals In Dom */}
      {activeModalSize && (
        <Modal
          isOpen={Boolean(activeModalSize)}
          onClose={() => setActiveModalSize(null)}
          size={activeModalSize}
          title={`${activeModalSize.toUpperCase()} Modal Dialog`}
          subtitle="Keyboard accessible (Escape to close, Tab traps focus inside)"
          badge="HUGPONG Modal"
          footer={
            <>
              <Button variant="secondary" onClick={() => setActiveModalSize(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => setActiveModalSize(null)}>
                Save Changes
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <p>
              This is a standard <strong>{activeModalSize}</strong> modal dialog with accessible focus management, smooth entrance animation, and backdrop safety.
            </p>
            <FormField label="Sample Dialog Field">
              <Input placeholder="Type inside modal to test focus trapping..." />
            </FormField>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleSimulateConfirm}
        isLoading={confirmLoading}
        loadingText="Archiving operation..."
        title="Archive operation record?"
        message="This field operation record will be archived. It will remain accessible in history logs and compliance audit snapshots."
        confirmText="Archive Record"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  );
}
