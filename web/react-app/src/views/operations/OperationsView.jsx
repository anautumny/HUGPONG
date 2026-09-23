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
import AddOperationModal from '../../components/operations/AddOperationModal';
import TakeOverAuthModal from '../../components/operations/TakeOverAuthModal';
import {
  Table,
  TablePagination,
  Button,
  StatusBadge,
  ConfirmDialog,
  Select,
  Input
} from '../../components/ui';
import { formatCurrency, formatDate, formatCropYear, formatHectares } from '../../utils/formatters';
import {
  ClipboardList,
  History,
  Archive,
  Search,
  ShieldCheck,
  Calendar,
  Pencil,
  Plus,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  LogOut,
  Layers,
  UserCheck,
  MapPin,
  Users
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function OperationsView() {
  const { user, roleKey } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const targetUrlFieldId = searchParams.get('fieldId') || searchParams.get('takeOverFieldId') || '';

  const isManager = roleKey === ROLE_KEYS.FARM_MANAGER;
  const canArchive = isManager;

  // Active Tab: 'fields' or 'history'
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

  // Take Over Mode state: null by default (Manager does NOT automatically enter Take Over Mode)
  const [activeTakeOverFieldId, setActiveTakeOverFieldId] = useState(null);
  const [takeoverGrant, setTakeoverGrant] = useState(null);
  const [authModalField, setAuthModalField] = useState(null);
  const [pendingAction, setPendingAction] = useState(null); // { type: 'ADD_OPERATION', field } | { type: 'EDIT_OPERATION', operation, field }

  // Modals state
  const [addOperationField, setAddOperationField] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState('');

  // Expandable field cards: map of fieldId -> boolean
  const [expandedFields, setExpandedFields] = useState({});

  // History search and filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Auto-expand field from URL if requested
  useEffect(() => {
    if (targetUrlFieldId) {
      setExpandedFields(prev => ({ ...prev, [targetUrlFieldId]: true }));
    }
  }, [targetUrlFieldId]);

  // Subscribe to operations & fields data
  useEffect(() => {
    let active = true;

    const unsubOps = subscribeToOperationsData({
      user,
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

  // Scope operations to manager's fields
  const scopedOperations = useMemo(() => {
    if (!isManager) return opsData.operations;
    const permittedFieldIds = new Set(fieldsData.fields.map(field => field.id));
    return opsData.operations.filter(operation => permittedFieldIds.has(operation.fieldId));
  }, [opsData.operations, fieldsData.fields, isManager]);

  // Group operations by field
  const operationsByField = useMemo(() => {
    const grouped = new Map();
    scopedOperations.forEach(operation => {
      grouped.set(operation.fieldId, [...(grouped.get(operation.fieldId) || []), operation]);
    });
    return grouped;
  }, [scopedOperations]);

  // Active takeover field object
  const activeTakeOverField = useMemo(() => {
    if (!activeTakeOverFieldId) return null;
    return fieldsData.fields.find(f => f.id === activeTakeOverFieldId) || null;
  }, [fieldsData.fields, activeTakeOverFieldId]);

  // Toggle field card expansion
  const toggleExpandField = (fieldId) => {
    setExpandedFields(prev => ({
      ...prev,
      [fieldId]: !prev[fieldId]
    }));
  };

  // Exit Take Over Mode
  const handleExitTakeOver = () => {
    setActiveTakeOverFieldId(null);
    setTakeoverGrant(null);
    setUpdateSuccess('Exited Take Over Mode.');
  };

  // Entry point: Add Operation
  const handleAddOperationClick = (field) => {
    setUpdateSuccess('');
    // Auto-expand this field card
    setExpandedFields(prev => ({ ...prev, [field.id]: true }));

    // If manager has not activated Take Over Mode for this specific field yet:
    // Prompt password confirmation first!
    if (isManager && activeTakeOverFieldId !== field.id) {
      setPendingAction({ type: 'ADD_OPERATION', field });
      setAuthModalField(field);
      return;
    }

    // Otherwise proceed directly
    setAddOperationField(field);
  };

  // Entry point: Edit Operation
  const handleEditOperationClick = (operation, field) => {
    setUpdateSuccess('');
    if (operation.status === 'ARCHIVED') return;

    // Auto-expand this field card
    setExpandedFields(prev => ({ ...prev, [field.id]: true }));

    // If manager has not activated Take Over Mode for this specific field yet:
    // Prompt password confirmation first!
    if (isManager && activeTakeOverFieldId !== field.id) {
      setPendingAction({ type: 'EDIT_OPERATION', operation, field });
      setAuthModalField(field);
      return;
    }

    // Otherwise proceed directly
    setEditTarget(operation);
  };

  const handleArchiveOperationClick = (operation, field) => {
    setUpdateSuccess('');
    if (operation.status === 'ARCHIVED') return;
    if (isManager && activeTakeOverFieldId !== field?.id) {
      setPendingAction({ type: 'ARCHIVE_OPERATION', operation, field });
      setAuthModalField(field);
      return;
    }
    setArchiveTarget(operation);
  };

  // Successful password confirmation handler
  const handleAuthSuccess = (field, grant) => {
    setActiveTakeOverFieldId(field.id);
    setTakeoverGrant(grant);
    setAuthModalField(null);

    // Proceed to pending action if requested
    if (pendingAction) {
      if (pendingAction.type === 'ADD_OPERATION') {
        setAddOperationField(field);
      } else if (pendingAction.type === 'EDIT_OPERATION') {
        setEditTarget(pendingAction.operation);
      } else if (pendingAction.type === 'ARCHIVE_OPERATION') {
        setArchiveTarget(pendingAction.operation);
      }
      setPendingAction(null);
    }
  };

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
      await archiveOperations([archiveTarget.id], takeoverGrant);
      setIsArchiving(false);
      setArchiveTarget(null);
      setUpdateSuccess('Operation record archived successfully.');
    } catch (err) {
      console.error('[OperationsView] Archive error:', err);
      setIsArchiving(false);
      alert(err.message || 'Failed to archive operation record.');
    }
  };

  // Header Actions
  const headerActions = useMemo(() => {
    const actions = [];
    if (isManager && activeTakeOverFieldId) {
      actions.push({
        label: 'Exit Take Over',
        icon: LogOut,
        onClick: handleExitTakeOver
      });
    }
    return actions;
  }, [isManager, activeTakeOverFieldId]);

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
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
          val === 'MANAGER_TAKEOVER'
            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
            : 'text-hug-muted bg-surface-subtle'
        }`}>
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
            onClick={() => handleArchiveOperationClick(row, fieldsData.fields.find(field => field.id === row.fieldId))}
            title="Archive Operation Record"
            className="p-1.5 rounded-lg text-hug-muted hover:text-danger hover:bg-danger-bg dark:hover:bg-danger/20 transition-colors cursor-pointer"
          >
            <Archive className="w-4 h-4" />
          </button>
        ) : null
      )
    }
  ];

  // Access control check: Farm Manager only
  if (roleKey && !isManager) {
    return (
      <div className="p-8 max-w-md mx-auto text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-danger-bg dark:bg-danger/20 text-danger flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-black text-hug-text">
          Access Restricted
        </h2>
        <p className="text-xs text-hug-muted">
          Field Operations Console is authorized exclusively for Farm Managers managing an assigned Block Farm.
        </p>
        <Button variant="secondary" onClick={() => navigate('/dashboard')}>
          Return to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Header */}
      <CompactDashboardHeader
        category="Farm Operations"
        badge="Operational Ledger"
        title="Field Operations Console"
        subtitle={`Assigned field operations, crop cycle stages & supervisory ledger · ${scopedOperations.length} recorded logs`}
        actions={headerActions}
      />

      {/* Active Supervisory Takeover Banner (Rule 27 / Prompt Requirement) */}
      {isManager && activeTakeOverField && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shrink-0 shadow-xs">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs sm:text-sm font-black text-amber-950 dark:text-amber-200">
                  Take Over Mode Active
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-white dark:bg-surface border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300">
                  {activeTakeOverField.id}
                </span>
              </div>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5 font-medium">
                Supervising: <strong>{activeTakeOverField.memberName || 'Member Farmer'}</strong> · {formatHectares(activeTakeOverField.areaHa || activeTakeOverField.ha)}. Operations logged or edited will be attributed to supervisor takeover.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExitTakeOver}
              icon={LogOut}
              className="border-amber-300 text-amber-900 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
            >
              Exit Take Over
            </Button>
          </div>
        </div>
      )}

      {/* 2. Navigation Tab Switcher */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/80 pb-2.5">
        <button
          type="button"
          onClick={() => setActiveTab('fields')}
          className={`px-4.5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
            activeTab === 'fields'
              ? 'bg-primary text-white shadow-xs'
              : 'text-hug-muted hover:text-hug-text hover:bg-bg dark:hover:bg-gray-800'
          }`}
        >
          Field Operations
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`px-4.5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
            activeTab === 'history'
              ? 'bg-primary text-white shadow-xs'
              : 'text-hug-muted hover:text-hug-text hover:bg-bg dark:hover:bg-gray-800'
          }`}
        >
          Operation History &amp; Ledger ({scopedOperations.length})
        </button>
      </div>

      {/* 3. Tab Contents */}
      {activeTab === 'fields' ? (
        <div className="space-y-4">
          {updateSuccess && (
            <div className="p-4 rounded-xl bg-success-bg border border-success/30 text-success flex items-center gap-2.5 text-sm font-bold animate-in fade-in">
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
            <div className="space-y-4 w-full">
              {fieldsData.fields.map(field => {
                const fieldOperations = operationsByField.get(field.id) || [];
                const cycle = field.cropCycle;
                const cycleSummary = cycle
                  ? [cycle.cropType || field.cycleType, formatCropYear(cycle.cropYear || field.cropYear), `Stage ${cycle.currentStageNumber || field.stageNumber || 1}`, cycle.status]
                    .filter(Boolean).join(' · ')
                  : null;

                const isTakeOverActiveForField = isManager && activeTakeOverFieldId === field.id;
                const isExpanded = Boolean(expandedFields[field.id]);
                const activeOpsCount = fieldOperations.filter(o => o.status !== 'ARCHIVED').length;

                return (
                  <section
                    key={field.id}
                    className={`bg-white dark:bg-surface rounded-2xl border transition-all shadow-xs p-5 sm:p-6 space-y-4 w-full ${
                      isTakeOverActiveForField
                        ? 'border-amber-400 dark:border-amber-600 ring-2 ring-amber-400/20'
                        : 'border-border'
                    }`}
                  >
                    {/* Field Card Header / Summary - Full Width */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-base sm:text-lg text-hug-text px-2.5 py-1 rounded-lg bg-surface-subtle dark:bg-[#252B27] border border-border">
                            {field.id}
                          </span>
                          {isTakeOverActiveForField && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>Take Over Active</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-bold text-hug-text">{field.memberName || 'Unassigned Member'}</span>
                          {field.memberPhone && (
                            <span className="text-xs text-hug-muted font-mono">({field.memberPhone})</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-xs text-hug-muted">
                          <span>·</span>
                          <span className="font-semibold text-hug-text">{Number(field.areaHa || field.ha || 0).toFixed(2)} ha</span>
                          {field.blockFarmName && (
                            <>
                              <span>·</span>
                              <span>{field.blockFarmName}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-wrap md:justify-end">
                        {cycleSummary && (
                          <span className="text-xs font-bold text-primary bg-primary-bg dark:bg-primary/20 px-3 py-1.5 rounded-xl border border-primary/20">
                            {cycleSummary}
                          </span>
                        )}
                        {isTakeOverActiveForField && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleExitTakeOver}
                            icon={LogOut}
                            className="border-danger/40 text-danger hover:bg-danger-bg dark:hover:bg-danger/20"
                          >
                            Exit Take Over
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Field Card Action Row & Expand Trigger */}
                    <div className="border-t border-border/70 pt-3 flex flex-wrap items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => toggleExpandField(field.id)}
                        className="flex items-center gap-2 text-xs sm:text-sm font-bold text-hug-muted hover:text-hug-text transition-colors cursor-pointer py-1"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-primary" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-primary" />
                        )}
                        <span>
                          {fieldOperations.length} recorded {fieldOperations.length === 1 ? 'operation' : 'operations'}
                        </span>
                        <span className="text-xs text-hug-muted font-normal">
                          ({activeOpsCount} active)
                        </span>
                      </button>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          icon={Plus}
                          onClick={() => handleAddOperationClick(field)}
                          title={
                            !isTakeOverActiveForField && isManager
                              ? 'Requires manager password confirmation to take over and record operation'
                              : 'Record a new operation for this field'
                          }
                        >
                          Add Operation
                        </Button>
                      </div>
                    </div>

                    {/* Expandable Recorded Operations Section - Spacious and Full Width */}
                    {isExpanded && (
                      <div className="border-t border-border/70 pt-4 space-y-3 w-full">
                        <div className="flex items-center justify-between">
                          <span className="text-xs uppercase font-black tracking-wider text-hug-muted">
                            Field Operation Logs
                          </span>
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-surface-subtle font-bold text-hug-muted border border-border">
                            {fieldOperations.length} total recorded
                          </span>
                        </div>

                        {fieldOperations.length === 0 ? (
                          <div className="p-6 rounded-2xl bg-surface-subtle dark:bg-[#1A1F1C] text-center text-xs sm:text-sm text-hug-muted italic border border-border">
                            No recorded operations yet for this field plot. Click "Add Operation" above to record activities.
                          </div>
                        ) : (
                          <div className="space-y-2.5 w-full">
                            {fieldOperations.map(operation => {
                              const isArchived = operation.status === 'ARCHIVED';
                              return (
                                <div
                                  key={operation.id}
                                  className={`p-4 sm:p-5 rounded-2xl border transition-all w-full flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                                    isArchived
                                      ? 'bg-bg/40 dark:bg-[#0C1015]/40 border-border/60 opacity-75'
                                      : 'bg-surface-subtle dark:bg-[#1A1F1C] border-border/80 hover:border-primary/40 hover:shadow-xs'
                                  }`}
                                >
                                  {/* Left: Operation Title, Stage, Category & Submission Source Badges */}
                                  <div className="flex-1 min-w-0 space-y-1.5">
                                    <div className="flex items-center gap-2.5 flex-wrap">
                                      <span className="font-black text-sm sm:text-base text-hug-text">
                                        {operation.operationName || operation.activity || 'Field Operation'}
                                      </span>
                                      <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-white dark:bg-surface border border-border text-hug-text">
                                        Stage {operation.stageNumber || 1}
                                      </span>
                                      {operation.submissionSource === 'MANAGER_TAKEOVER' ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                          <UserCheck className="w-3 h-3" />
                                          <span>Supervisor Takeover</span>
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-surface dark:bg-[#252B27] border border-border text-hug-muted">
                                          Member Farmer
                                        </span>
                                      )}
                                      {isArchived ? (
                                        <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-zinc-200 dark:bg-zinc-800 text-hug-muted">
                                          Archived
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-success-bg text-success border border-success/30">
                                          Verified Active
                                        </span>
                                      )}
                                    </div>

                                    {/* Metadata Row: Spacious and clearly formatted */}
                                    <div className="flex items-center gap-4 text-xs sm:text-sm text-hug-muted flex-wrap pt-0.5">
                                      <div className="flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5 text-hug-muted" />
                                        <span>{formatDate(operation.performedOn || operation.date)}</span>
                                      </div>
                                      {operation.areaHa && (
                                        <div className="flex items-center gap-1.5">
                                          <MapPin className="w-3.5 h-3.5 text-hug-muted" />
                                          <span>{Number(operation.areaHa).toFixed(2)} ha treated</span>
                                        </div>
                                      )}
                                      {operation.workersCount && (
                                        <div className="flex items-center gap-1.5">
                                          <Users className="w-3.5 h-3.5 text-hug-muted" />
                                          <span>{operation.workersCount} laborers</span>
                                        </div>
                                      )}
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-semibold text-hug-muted">Total Cost:</span>
                                        <strong className="text-hug-text font-bold">
                                          {formatCurrency(operation.totalCost ?? operation.cost ?? 0)}
                                        </strong>
                                      </div>
                                      {operation.notes && (
                                        <div className="text-xs text-hug-muted italic truncate max-w-md">
                                          "{operation.notes}"
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Right: Actions */}
                                  <div className="flex items-center gap-2 shrink-0 self-end lg:self-center">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      icon={Pencil}
                                      disabled={isArchived}
                                      onClick={() => handleEditOperationClick(operation, field)}
                                      title={
                                        isArchived
                                          ? 'Archived operations cannot be edited.'
                                          : !isTakeOverActiveForField && isManager
                                            ? 'Requires manager password confirmation to take over and edit this operation'
                                            : 'Edit this operation'
                                      }
                                    >
                                      Edit
                                    </Button>

                                    {canArchive && !isArchived && (
                                      <button
                                        type="button"
                                        onClick={() => handleArchiveOperationClick(operation, field)}
                                        title="Archive Operation Record"
                                        className="p-2 rounded-xl text-hug-muted hover:text-danger hover:bg-danger-bg dark:hover:bg-danger/20 border border-transparent hover:border-danger/30 transition-colors cursor-pointer"
                                      >
                                        <Archive className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
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
            <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
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
          <Table
            columns={historyColumns}
            data={paginatedOperations}
            isLoading={opsData.isLoading}
            error={opsData.error}
            emptyMessage="No operation records found."
            emptySubtext="Field activities recorded for your assigned plots will appear in this ledger."
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredOperations.length}
            onPageChange={setCurrentPage}
          />
        </div>
      )}

      {/* Modals & Dialogs */}

      {/* 1. Supervisor Take Over Password Authorization Modal */}
      <TakeOverAuthModal
        isOpen={Boolean(authModalField)}
        field={authModalField}
        user={user}
        onClose={() => {
          setAuthModalField(null);
          setPendingAction(null);
        }}
        onAuthorized={handleAuthSuccess}
      />

      {/* 2. Add Operation Modal (Contextual to Selected Field Plot) */}
      <AddOperationModal
        isOpen={Boolean(addOperationField)}
        field={addOperationField}
        isTakeOver={isManager && activeTakeOverFieldId === addOperationField?.id}
        takeoverGrant={takeoverGrant}
        onClose={() => setAddOperationField(null)}
        onSuccess={() => {
          setAddOperationField(null);
          setUpdateSuccess('Operation recorded successfully and synchronized.');
        }}
      />

      {/* 3. Edit Operation Modal */}
      <EditOperationModal
        operation={editTarget}
        takeoverGrant={takeoverGrant}
        isOpen={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        onUpdated={() => {
          setEditTarget(null);
          setUpdateSuccess('Operation amended and updated successfully.');
        }}
      />

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
    </div>
  );
}
