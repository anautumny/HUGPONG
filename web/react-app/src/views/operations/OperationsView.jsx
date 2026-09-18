import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ROLE_KEYS } from '../../utils/authRouting';
import {
  subscribeToOperationsData,
  archiveOperations
} from '../../services/operationsService';
import { subscribeToFieldsData } from '../../services/fieldsService';
import CompactDashboardHeader from '../../components/dashboard/CompactDashboardHeader';
import EditOperationModal from '../../components/operations/EditOperationModal';
import {
  Table,
  TablePagination,
  Button,
  StatusBadge,
  ConfirmDialog,
  Select,
  Input
} from '../../components/ui';
import { formatCurrency, formatDate, formatCropYear } from '../../utils/formatters';
import {
  ClipboardList,
  History,
  Archive,
  Search,
  ArrowRight,
  ShieldCheck,
  Calendar,
  Pencil,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function OperationsView() {
  const { user, roleKey } = useAuth();
  const navigate = useNavigate();

  const isManager = roleKey === ROLE_KEYS.FARM_MANAGER;
  const isSuper = roleKey === ROLE_KEYS.SUPER_ADMIN;
  const canArchive = isManager || isSuper || roleKey === ROLE_KEYS.MEMBER_FARMER;

  // Normal manager console exposes existing field operations and history.
  const [activeTab, setActiveTab] = useState('fields');

  // Operations data
  const [opsData, setOpsData] = useState({
    operations: [],
    isLoading: true,
    error: null
  });

  // Fields data for selection
  const [fieldsData, setFieldsData] = useState({
    fields: [],
    isLoading: true
  });

  // History search and filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Archive modal state
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [selectedOperationIds, setSelectedOperationIds] = useState({});
  const [editTarget, setEditTarget] = useState(null);
  const [updateSuccess, setUpdateSuccess] = useState('');

  // Subscribe to operations
  useEffect(() => {
    let active = true;

    const unsubOps = subscribeToOperationsData({
      onUpdate: (data) => {
        if (!active) return;
        setOpsData(data);
      },
      onError: (err) => {
        if (!active) return;
        setOpsData(prev => ({ ...prev, isLoading: false, error: err.message }));
      }
    });

    const unsubFields = subscribeToFieldsData({
      user,
      onUpdate: (data) => {
        if (!active) return;
        setFieldsData(data);
      }
    });

    return () => {
      active = false;
      if (typeof unsubOps === 'function') unsubOps();
      if (typeof unsubFields === 'function') unsubFields();
    };
  }, [user?.id, user?.employeeId]);

  const scopedOperations = useMemo(() => {
    if (!isManager) return opsData.operations;
    const permittedFieldIds = new Set(fieldsData.fields.map(field => field.id));
    return opsData.operations.filter(operation => permittedFieldIds.has(operation.fieldId));
  }, [opsData.operations, fieldsData.fields, isManager]);

  const operationsByField = useMemo(() => {
    const grouped = new Map();
    scopedOperations.forEach(operation => {
      grouped.set(operation.fieldId, [...(grouped.get(operation.fieldId) || []), operation]);
    });
    return grouped;
  }, [scopedOperations]);

  useEffect(() => {
    setSelectedOperationIds(current => {
      const next = { ...current };
      fieldsData.fields.forEach(field => {
        const fieldOperations = operationsByField.get(field.id) || [];
        if (!fieldOperations.some(operation => operation.id === next[field.id])) {
          next[field.id] = fieldOperations[0]?.id || '';
        }
      });
      return next;
    });
  }, [fieldsData.fields, operationsByField]);

  // Filter history records
  const filteredOperations = useMemo(() => {
    return scopedOperations.filter(op => {
      if (statusFilter !== 'ALL' && (op.status || 'ACTIVE').toUpperCase() !== statusFilter) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const idMatch = (op.id || '').toLowerCase().includes(q);
        const nameMatch = (op.operationName || op.activity || '').toLowerCase().includes(q);
        const fieldMatch = (op.fieldId || '').toLowerCase().includes(q);
        return idMatch || nameMatch || fieldMatch;
      }

      return true;
    });
  }, [scopedOperations, statusFilter, searchQuery]);

  const paginatedOperations = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredOperations.slice(start, start + pageSize);
  }, [filteredOperations, currentPage]);

  const totalPages = Math.max(1, Math.ceil(filteredOperations.length / pageSize));

  // Handle Archive Confirmation
  const handleArchiveConfirm = async () => {
    if (!archiveTarget) return;
    setIsArchiving(true);
    try {
      await archiveOperations([archiveTarget.id]);
      setIsArchiving(false);
      setArchiveTarget(null);
    } catch (err) {
      console.error('[OperationsView] Archive error:', err);
      setIsArchiving(false);
      alert(err.message || 'Failed to archive operation record.');
    }
  };

  // Header Actions
  const headerActions = useMemo(() => {
    const actions = [];
    if (isManager) {
      actions.push({
        label: 'Take Over Mode',
        icon: ArrowRight,
        onClick: () => navigate('/takeover')
      });
    }
    return actions;
  }, [isManager, navigate]);

  // History Table Columns
  const historyColumns = [
    {
      key: 'performedOn',
      header: 'Date',
      width: '120px',
      render: (val, row) => (
        <span className="text-xs font-semibold text-hug-muted whitespace-nowrap">
          {formatDate(val || row.date || row.createdAt)}
        </span>
      )
    },
    {
      key: 'operationName',
      header: 'Activity / Task',
      render: (val, row) => (
        <div>
          <span className="font-bold text-hug-text block">
            {val || row.activity || 'Field Operation'}
          </span>
          <span className="text-[11px] text-hug-muted font-medium">
            {row.category || 'General Care'}
          </span>
        </div>
      )
    },
    {
      key: 'fieldId',
      header: 'Field Plot',
      width: '130px',
      cellClassName: 'font-mono font-bold text-xs text-primary dark:text-primary-light'
    },
    {
      key: 'stageNumber',
      header: 'Crop Stage',
      width: '110px',
      render: (val) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-surface-subtle text-hug-text border border-border">
          Stage {val || 1}
        </span>
      )
    },
    {
      key: 'submissionSource',
      header: 'Source',
      width: '130px',
      render: (val) => (
        <span className="text-[11px] font-medium text-hug-muted">
          {val === 'MANAGER_TAKEOVER' ? 'Manager Takeover' : 'Member Log'}
        </span>
      )
    },
    {
      key: 'totalCost',
      header: 'Cost (₱)',
      align: 'right',
      width: '130px',
      render: (val, row) => (
        <span className="font-bold text-hug-text">
          {formatCurrency(val ?? row.cost ?? 0)}
        </span>
      )
    },
    {
      key: 'status',
      header: 'Status',
      width: '100px',
      render: (val) => <StatusBadge status={val || 'ACTIVE'} />
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      width: '90px',
      render: (_, row) => (
        canArchive && row.status !== 'ARCHIVED' ? (
          <button
            type="button"
            onClick={() => setArchiveTarget(row)}
            title="Archive Operation Record"
            className="p-1.5 rounded-lg text-hug-muted hover:text-danger hover:bg-danger-bg dark:hover:bg-danger/20 transition-colors cursor-pointer"
          >
            <Archive className="w-4 h-4" />
          </button>
        ) : null
      )
    }
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Header */}
      <CompactDashboardHeader
        title="Field Operations Console"
        contextText={`Assigned field operations & operational ledger · ${scopedOperations.length} recorded logs`}
        actions={headerActions}
      />

      {/* 2. Navigation Tab Switcher */}
      <div className="flex items-center gap-2 border-b border-border/80 pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('fields')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'fields'
              ? 'bg-primary text-white shadow-xs'
              : 'text-hug-muted hover:text-hug-text hover:bg-bg dark:hover:bg-[#0C1015]'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span>Field Operations</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'history'
              ? 'bg-primary text-white shadow-xs'
              : 'text-hug-muted hover:text-hug-text hover:bg-bg dark:hover:bg-[#0C1015]'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Operation History &amp; Ledger ({scopedOperations.length})</span>
        </button>
      </div>

      {/* 3. Tab Contents */}
      {activeTab === 'fields' ? (
        <div className="space-y-4">
          {updateSuccess && (
            <div className="p-4 rounded-xl bg-success-bg border border-success/30 text-success flex items-center gap-2.5 text-sm font-bold">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>{updateSuccess}</span>
            </div>
          )}

          {(fieldsData.isLoading || opsData.isLoading) ? (
            <div className="rounded-2xl border border-border bg-white dark:bg-surface p-8 text-center text-sm font-semibold text-hug-muted">
              Loading field operations...
            </div>
          ) : (fieldsData.error || opsData.error) ? (
            <div className="rounded-2xl border border-danger/30 bg-danger-bg/40 p-5 text-danger flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-bold">Unable to load field operations.</p>
                <p className="text-xs mt-1">{fieldsData.error || opsData.error}</p>
              </div>
            </div>
          ) : fieldsData.fields.length === 0 ? (
            <div className="rounded-2xl border border-border bg-white dark:bg-surface p-8 text-center">
              <p className="font-bold text-hug-text">No assigned fields found.</p>
              <p className="text-xs text-hug-muted mt-1">Fields from the Farm Manager's assigned Block Farm will appear here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {fieldsData.fields.map(field => {
                const fieldOperations = operationsByField.get(field.id) || [];
                const selectedId = selectedOperationIds[field.id] || '';
                const selectedOperation = fieldOperations.find(operation => operation.id === selectedId) || null;
                const cycle = field.cropCycle;
                const cycleSummary = cycle
                  ? [cycle.cropType || field.cycleType, formatCropYear(cycle.cropYear || field.cropYear), `Stage ${cycle.currentStageNumber || field.stageNumber || 1}`, cycle.status]
                    .filter(Boolean).join(' · ')
                  : null;

                return (
                  <section key={field.id} className="bg-white dark:bg-surface rounded-2xl border border-border shadow-xs p-5 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-mono font-black text-base text-hug-text">{field.id}</h3>
                        <p className="text-sm font-semibold text-hug-text mt-1">{field.memberName || 'Unassigned'}</p>
                        <p className="text-xs text-hug-muted mt-0.5">{Number(field.areaHa || field.ha || 0).toFixed(2)} ha</p>
                      </div>
                      {cycleSummary && (
                        <span className="max-w-[55%] text-right text-[10px] font-bold text-primary bg-primary-bg dark:bg-primary/20 px-2.5 py-1.5 rounded-lg">
                          {cycleSummary}
                        </span>
                      )}
                    </div>

                    <div className="border-t border-border/70 pt-3">
                      <p className="text-[10px] uppercase tracking-wider font-black text-hug-muted mb-2">Operation</p>
                      {fieldOperations.length === 0 ? (
                        <p className="text-sm text-hug-muted italic">No recorded operations yet.</p>
                      ) : (
                        <div className="flex flex-col sm:flex-row gap-2">
                          <select
                            value={selectedId}
                            onChange={event => setSelectedOperationIds(current => ({ ...current, [field.id]: event.target.value }))}
                            className="flex-1 min-w-0 text-xs font-semibold px-3 py-2.5 border border-border rounded-xl bg-surface-subtle text-hug-text outline-none focus:border-primary"
                            aria-label={`Operations for ${field.id}`}
                          >
                            {fieldOperations.map(operation => (
                              <option key={operation.id} value={operation.id}>
                                {operation.operationName || operation.activity || 'Field Operation'} · {formatDate(operation.performedOn || operation.date)}{operation.status === 'ARCHIVED' ? ' · Archived' : ''}
                              </option>
                            ))}
                          </select>
                          <Button
                            variant="secondary"
                            icon={Pencil}
                            onClick={() => {
                              setUpdateSuccess('');
                              setEditTarget(selectedOperation);
                            }}
                            disabled={!selectedOperation || selectedOperation.status === 'ARCHIVED'}
                            title={selectedOperation?.status === 'ARCHIVED' ? 'Archived operations cannot be edited.' : 'Edit this operation'}
                          >
                            Edit
                          </Button>
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* History Search & Filter Bar */}
          <div className="bg-white dark:bg-surface rounded-2xl p-4 border border-border shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-hug-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search operation name, field ID, task..."
                className="w-full text-xs font-medium pl-9 pr-3 py-2 border border-border rounded-xl bg-surface-subtle text-hug-text placeholder:text-hug-muted outline-none focus:border-primary"
              />
            </div>

            <div className="w-40">
              <Select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                options={[
                  { value: 'ACTIVE', label: 'Active Logs' },
                  { value: 'ARCHIVED', label: 'Archived Logs' },
                  { value: 'ALL', label: 'All Operations' }
                ]}
              />
            </div>
          </div>

          {/* Ledger Table */}
          <div className="space-y-2">
            <Table
              columns={historyColumns}
              data={paginatedOperations}
              isLoading={opsData.isLoading}
              error={opsData.error}
              emptyMessage="No operation records found."
              emptySubtext="Field activities recorded for your assigned plots will appear in this ledger."
            />

            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredOperations.length}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      )}

      {/* 4. Archive Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(archiveTarget)}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={handleArchiveConfirm}
        isLoading={isArchiving}
        loadingText="Archiving..."
        title="Archive operation?"
        message="This record will remain available in operation history."
        confirmText="Archive"
        cancelText="Cancel"
        type="danger"
      />

      <EditOperationModal
        operation={editTarget}
        isOpen={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        onUpdated={() => {
          setEditTarget(null);
          setUpdateSuccess('Operation updated successfully.');
        }}
      />
    </div>
  );
}
