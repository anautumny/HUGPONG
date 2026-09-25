import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ROLE_KEYS } from '../../utils/authRouting';
import {
  subscribeToOperationsData,
  archiveOperations
} from '../../services/operationsService';
import { subscribeToFieldsData } from '../../services/fieldsService';
import {
  appendUniqueArchiveRecords,
  fetchArchivedOperations,
  getArchiveClearViewPreferenceKey,
  readArchiveClearViewPreference,
  writeArchiveClearViewPreference
} from '../../services/archiveViewService';
import { SRA_OPERATIONS_CATALOGUE } from '../../domain/operationCatalogue';
import { operationPresentation } from '../../domain/presentationContract';
import { getOperationCapabilities, normalizeActorId } from '../../domain/operationAuthorization';
import {
  completeLocalDraftSubmission,
  deleteLocalOperationDraft,
  listLocalOperationDrafts,
  saveLocalOperationDraft,
  validateLocalDraftForSubmission
} from '../../services/localOperationDrafts';
import { amendmentEditor, amendmentSummary, formatAmendmentChanges, formatDate as formatAmendmentDate } from '../../domain/amendmentPresentation';
import CompactDashboardHeader from '../../components/dashboard/CompactDashboardHeader';
import EditOperationModal from '../../components/operations/EditOperationModal';
import AddOperationModal from '../../components/operations/AddOperationModal';
import TakeOverAuthModal from '../../components/operations/TakeOverAuthModal';
import {
  Table,
  Button,
  StatusBadge,
  ConfirmDialog,
  Select
} from '../../components/ui';
import {
  canonicalStoredCropYear,
  formatCurrency,
  formatDate,
  formatCropYearDisplay,
  formatHectares,
  uniqueCropYears
} from '../../utils/formatters';
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
  Users,
  FileCheck2,
  FileText,
  Trash2
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

function AmendmentHistory({ operation }) {
  const summary = amendmentSummary(operation.amendments);
  if (!summary.latest) return null;
  return (
    <details className="mt-3 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20">
      <summary className="cursor-pointer list-none p-3 flex items-center justify-between gap-3">
        <div>
          <span className="block text-xs font-black text-blue-800 dark:text-blue-300">Amended {summary.count} time{summary.count === 1 ? '' : 's'}</span>
          <span className="block text-[11px] text-hug-muted mt-0.5">Last edited: {summary.editedAt} · Reason: {summary.latest.reason}</span>
        </div>
        <span className="text-xs font-bold text-blue-700 dark:text-blue-300">View Amendment History</span>
      </summary>
      <div className="border-t border-blue-200 dark:border-blue-900/60 p-3 space-y-3">
        {operation.amendments.map((amendment, amendmentIndex) => {
          const editor = amendmentEditor(amendment);
          const changes = formatAmendmentChanges(amendment.changes);
          return (
            <section key={amendment.amendmentId || amendmentIndex} className="rounded-xl bg-white dark:bg-surface border border-border p-3 space-y-2">
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <span className="block text-xs font-black text-hug-text">Amendment #{amendmentIndex + 1}</span>
                  <span className="block text-[11px] text-hug-muted">{editor.name} · {editor.role}</span>
                </div>
                <span className="text-[11px] text-hug-muted">{formatAmendmentDate(amendment.amendedAt, true)}</span>
              </div>
              <p className="text-xs text-hug-text"><strong>Reason:</strong> {amendment.reason}</p>
              <div className="space-y-2">
                {changes.map((change, changeIndex) => change.kind === 'group' ? (
                  <div key={`${change.label}-${changeIndex}`}>
                    <span className="text-xs font-black text-hug-text">{change.label}</span>
                    <div className="mt-1 space-y-1.5">
                      {change.items.map((item, itemIndex) => (
                        <div key={`${item.label}-${itemIndex}`} className="rounded-lg bg-bg p-2 text-[11px] text-hug-text">
                          <strong>{item.label}{item.action ? ` · ${item.action}` : ''}</strong>
                          {item.before && <span className="block text-hug-muted mt-0.5">{item.before}</span>}
                          {item.after && <span className="block text-primary font-semibold">→ {item.after}</span>}
                          {(item.details || []).map((detail, detailIndex) => <span key={detailIndex} className="block text-hug-muted">{detail.label}: {detail.before} → {detail.after}</span>)}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div key={`${change.field}-${changeIndex}`} className="text-xs text-hug-text">
                    <strong>{change.label}</strong><span className="block text-hug-muted">{change.before} → <span className="text-primary font-bold">{change.after}</span></span>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </details>
  );
}

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

  // Manager Takeover state: null by default; it is never entered automatically.
  const [activeTakeOverFieldId, setActiveTakeOverFieldId] = useState(null);
  const [takeoverGrant, setTakeoverGrant] = useState(null);
  const [takeoverExpiresAt, setTakeoverExpiresAt] = useState(0);
  const [authModalField, setAuthModalField] = useState(null);
  const [pendingAction, setPendingAction] = useState(null); // { type: 'ADD_OPERATION', field } | { type: 'EDIT_OPERATION', operation, field }

  // Modals state
  const [addOperationField, setAddOperationField] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState('');
  const [localDrafts, setLocalDrafts] = useState([]);
  const [activeDraft, setActiveDraft] = useState(null);

  const takeoverSession = activeTakeOverFieldId ? {
    managerId: normalizeActorId(user),
    fieldId: activeTakeOverFieldId,
    grant: takeoverGrant,
    expiresAt: takeoverExpiresAt
  } : null;

  useEffect(() => {
    setLocalDrafts(listLocalOperationDrafts(user));
  }, [user?.employeeId, user?.id, fieldsData.fields]);

  useEffect(() => {
    setActiveTakeOverFieldId(null);
    setTakeoverGrant(null);
    setTakeoverExpiresAt(0);
  }, [user?.employeeId, user?.id]);

  useEffect(() => {
    if (!takeoverExpiresAt) return undefined;
    const remaining = takeoverExpiresAt - Date.now();
    if (remaining <= 0) {
      setActiveTakeOverFieldId(null);
      setTakeoverGrant(null);
      setTakeoverExpiresAt(0);
      return undefined;
    }
    const timer = setTimeout(() => {
      setActiveTakeOverFieldId(null);
      setTakeoverGrant(null);
      setTakeoverExpiresAt(0);
      setUpdateSuccess('Manager Takeover authorization expired.');
    }, remaining);
    return () => clearTimeout(timer);
  }, [takeoverExpiresAt]);

  // Expandable field cards: map of fieldId -> boolean
  const [expandedFields, setExpandedFields] = useState({});

  // History search and filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ARCHIVED');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [archiveFilters, setArchiveFilters] = useState({
    cropYearCycle: '',
    fieldId: '',
    operationDefinitionId: '',
    search: ''
  });
  const [archiveSearchDraft, setArchiveSearchDraft] = useState('');
  const [archiveState, setArchiveState] = useState({
    records: [],
    nextCursor: null,
    hasMore: false,
    isLoading: false,
    isLoadingMore: false,
    isCleared: false,
    error: null,
    loadMoreError: null
  });
  const [archiveReloadKey, setArchiveReloadKey] = useState(0);
  const archiveRequestIdRef = useRef(0);
  const archiveLoadMoreLockRef = useRef(false);
  const archivePreferenceKey = useMemo(
    () => getArchiveClearViewPreferenceKey(user, roleKey),
    [user?.employeeId, user?.id, user?.userId, user?.uid, user?.email, user?.canonicalRole, user?.role, roleKey]
  );
  const [hydratedArchivePreferenceKey, setHydratedArchivePreferenceKey] = useState('');

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
      status: 'ACTIVE',
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

  useEffect(() => {
    if (!archivePreferenceKey) {
      setHydratedArchivePreferenceKey('');
      return;
    }

    archiveRequestIdRef.current += 1;
    archiveLoadMoreLockRef.current = false;
    const isCleared = readArchiveClearViewPreference(archivePreferenceKey);
    setArchiveState(previous => ({
      ...previous,
      records: [],
      nextCursor: null,
      hasMore: false,
      isLoading: false,
      isLoadingMore: false,
      isCleared,
      error: null,
      loadMoreError: null
    }));
    setHydratedArchivePreferenceKey(archivePreferenceKey);
  }, [archivePreferenceKey]);

  const loadArchivePage = useCallback(async ({ append = false } = {}) => {
    if (append && archiveLoadMoreLockRef.current) return;
    if (append) archiveLoadMoreLockRef.current = true;
    const requestId = ++archiveRequestIdRef.current;
    setArchiveState(previous => ({
      ...previous,
      isLoading: !append,
      isLoadingMore: append,
      isCleared: false,
      error: append ? previous.error : null,
      loadMoreError: null,
      ...(append ? {} : { records: [], nextCursor: null, hasMore: false })
    }));
    try {
      const page = await fetchArchivedOperations({
        ...archiveFilters,
        cursor: append ? archiveState.nextCursor : null
      });
      if (requestId !== archiveRequestIdRef.current) return;
      setArchiveState(previous => ({
        ...previous,
        records: append
          ? appendUniqueArchiveRecords(previous.records, page.records)
          : page.records,
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
        isLoading: false,
        isLoadingMore: false,
        isCleared: false,
        error: null,
        loadMoreError: null
      }));
    } catch (error) {
      if (requestId !== archiveRequestIdRef.current) return;
      setArchiveState(previous => ({
        ...previous,
        isLoading: false,
        isLoadingMore: false,
        ...(append
          ? { loadMoreError: error.message || 'Unable to load more archived records.' }
          : { error: error.message || 'Unable to load archived records.' })
      }));
    } finally {
      if (append) archiveLoadMoreLockRef.current = false;
    }
  }, [archiveFilters, archiveState.nextCursor]);

  useEffect(() => {
    if (activeTab !== 'history' || statusFilter !== 'ARCHIVED') return;
    if (!archivePreferenceKey || hydratedArchivePreferenceKey !== archivePreferenceKey) return;
    if (archiveState.isCleared) return;
    loadArchivePage({ append: false });
  }, [activeTab, statusFilter, archiveFilters, archiveReloadKey, archivePreferenceKey, hydratedArchivePreferenceKey]);

  const clearArchiveView = () => {
    writeArchiveClearViewPreference(archivePreferenceKey, true);
    archiveRequestIdRef.current += 1;
    archiveLoadMoreLockRef.current = false;
    setArchiveState(previous => ({
      ...previous,
      records: [],
      nextCursor: null,
      hasMore: false,
      isLoading: false,
      isLoadingMore: false,
      isCleared: true,
      error: null,
      loadMoreError: null
    }));
  };

  const showArchiveRecords = () => {
    writeArchiveClearViewPreference(archivePreferenceKey, false);
    setArchiveState(previous => ({ ...previous, isCleared: false }));
    loadArchivePage({ append: false });
  };

  const updateArchiveFilter = (key, value) => {
    setArchiveFilters(previous => ({ ...previous, [key]: value }));
  };

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

  const cropYearByCycleId = useMemo(() => new Map(
    (fieldsData.cropCycles || []).map(cycle => [cycle.id, cycle.cropYear])
  ), [fieldsData.cropCycles]);

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

  // Exit Manager Takeover mode
  const handleExitTakeOver = () => {
    setActiveTakeOverFieldId(null);
    setTakeoverGrant(null);
    setTakeoverExpiresAt(0);
    setUpdateSuccess('Exited Manager Takeover Mode.');
  };

  // Entry point: Add Operation
  const handleAddOperationClick = (field) => {
    setUpdateSuccess('');
    // Auto-expand this field card
    setExpandedFields(prev => ({ ...prev, [field.id]: true }));

    // If the manager has not activated Manager Takeover for this field yet:
    // Prompt password confirmation first!
    const capability = getOperationCapabilities(user, field, takeoverSession);
    if (capability.requiresTakeover) {
      setPendingAction({ type: 'ADD_OPERATION', field });
      setAuthModalField(field);
      return;
    }

    // Otherwise proceed directly
    setActiveDraft(null);
    setAddOperationField(field);
  };

  // Entry point: Edit Operation
  const handleEditOperationClick = (operation, field) => {
    setUpdateSuccess('');
    if (operation.status === 'ARCHIVED') return;

    // Auto-expand this field card
    setExpandedFields(prev => ({ ...prev, [field.id]: true }));

    // If the manager has not activated Manager Takeover for this field yet:
    // Prompt password confirmation first!
    if (getOperationCapabilities(user, field, takeoverSession).requiresTakeover) {
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
    if (getOperationCapabilities(user, field, takeoverSession).requiresTakeover) {
      setPendingAction({ type: 'ARCHIVE_OPERATION', operation, field });
      setAuthModalField(field);
      return;
    }
    setArchiveTarget(operation);
  };

  // Successful password confirmation handler
  const handleAuthSuccess = (field, grant, expiresAt) => {
    setActiveTakeOverFieldId(field.id);
    setTakeoverGrant(grant);
    setTakeoverExpiresAt(Number(expiresAt || 0));
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

  const handleSaveLocalDraft = (form, existingId) => {
    try {
      const draft = saveLocalOperationDraft(user, addOperationField, form, existingId);
      setLocalDrafts(listLocalOperationDrafts(user));
      setActiveDraft(draft);
      setAddOperationField(null);
      setUpdateSuccess('Draft saved locally on this browser. It was not synchronized.');
    } catch (error) {
      setUpdateSuccess(error.message);
    }
  };

  const handleContinueDraft = (draft, field) => {
    const validation = validateLocalDraftForSubmission(user, field, draft);
    if (!validation.valid) {
      setUpdateSuccess(validation.error);
      return;
    }
    setActiveDraft(draft);
    setAddOperationField(field);
  };

  const handleDeleteDraft = draftId => {
    deleteLocalOperationDraft(user, draftId);
    setLocalDrafts(listLocalOperationDrafts(user));
    setUpdateSuccess('Local draft deleted from this browser.');
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
  const authorizedArchiveCycles = useMemo(() => {
    const fieldIds = new Set((fieldsData.fields || []).map(field => field.id));
    return (fieldsData.cropCycles || []).filter(cycle => fieldIds.has(cycle.fieldId));
  }, [fieldsData.cropCycles, fieldsData.fields]);
  const invalidArchiveCycles = useMemo(
    () => authorizedArchiveCycles.filter(cycle => !canonicalStoredCropYear(cycle.cropYear)),
    [authorizedArchiveCycles]
  );
  const archiveCycleOptions = useMemo(() => [
    { value: '', label: 'All Crop Year Cycles' },
    ...uniqueCropYears(authorizedArchiveCycles).map(cropYear => ({
      value: cropYear,
      label: formatCropYearDisplay(cropYear)
    }))
  ], [authorizedArchiveCycles]);
  const archiveFieldOptions = useMemo(() => [
    { value: '', label: 'All Fields' },
    ...[...(fieldsData.fields || [])].sort((left, right) => String(left.id).localeCompare(String(right.id))).map(field => ({
      value: field.id,
      label: field.id
    }))
  ], [fieldsData.fields]);
  const archiveOperationOptions = useMemo(() => [
    { value: '', label: 'All Operations' },
    ...SRA_OPERATIONS_CATALOGUE.map(operation => ({
      value: operation.id,
      label: operation.name
    }))
  ], []);

  // Handle Archive Confirmation
  const handleArchiveConfirm = async () => {
    if (!archiveTarget) return;
    setIsArchiving(true);
    try {
      await archiveOperations([archiveTarget.id], takeoverGrant);
      setIsArchiving(false);
      setArchiveTarget(null);
      setUpdateSuccess('Operation record archived successfully.');
      setArchiveReloadKey(key => key + 1);
    } catch (err) {
      console.error('[OperationsView] Archive error:', err);
      setIsArchiving(false);
      alert(err.message || 'Failed to archive operation record.');
    }
  };

  // Header Actions
  const headerActions = useMemo(() => {
    const actions = isManager ? [{
      label: 'Compile Monthly Audit',
      to: '/audit?compile=1',
      icon: FileCheck2,
      variant: 'primary'
    }] : [];
    if (isManager && activeTakeOverFieldId) {
      actions.push({
        label: 'Exit Manager Takeover',
        icon: LogOut,
        onClick: handleExitTakeOver,
        variant: 'secondary'
      });
    }
    return actions;
  }, [isManager, activeTakeOverFieldId]);

  // History Table Columns
  const historyColumns = [
    {
      key: 'performedOn',
      header: 'Operation Date',
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
            {row.category || 'General Care'}{row.variety ? ` · Variety: ${row.variety}` : ''}
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
      key: 'archivedAt',
      header: 'Archived At',
      width: '130px',
      render: (value) => (
        <span className="text-xs font-semibold text-hug-muted whitespace-nowrap">
          {value ? formatDate(value) : '—'}
        </span>
      )
    },
    {
      key: 'cycleId',
      header: 'Crop Year Cycle',
      width: '145px',
      render: (val, operation) => (
        <span className="text-xs font-semibold text-hug-text whitespace-nowrap">
          {formatCropYearDisplay(operation.cropYearCycle || cropYearByCycleId.get(val))}
        </span>
      )
    },
    {
      key: 'stageNumber',
      header: 'Stage at Recording',
      width: '145px',
      render: (val, operation) => {
        const presentation = operationPresentation(operation);
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-surface-subtle text-hug-text border border-border">
            {presentation.stageLabel || `Stage ${operation.stageNumberAtRecord || val || 1}`}
          </span>
        );
      }
    },
    {
      key: 'submissionSource',
      header: 'Classification / Provenance',
      width: '210px',
      render: (_, row) => {
        const presentation = operationPresentation(row);
        const semanticBadges = presentation.badges.filter(badge => badge.dimension !== 'lifecycle');
        return (
          <div className="flex flex-wrap gap-1">
            {semanticBadges.length ? semanticBadges.map(badge => (
              <span key={badge.key} className="text-[11px] font-bold px-2 py-0.5 rounded-full border border-border bg-surface-subtle text-hug-text">
                {badge.label}
              </span>
            )) : presentation.submissionSource === 'MEMBER' ? (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-surface-subtle text-hug-muted">Farm Member Entry</span>
            ) : (
              <span className="text-[11px] text-hug-muted">Provenance unavailable</span>
            )}
          </div>
        );
      }
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
        subtitle={`Assigned field operations, Crop Year Cycle stages & supervisory ledger · ${scopedOperations.length} recorded logs`}
        actions={headerActions}
      />

      {/* Active Manager Takeover banner */}
      {isManager && activeTakeOverField && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shrink-0 shadow-xs">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs sm:text-sm font-black text-amber-950 dark:text-amber-200">
                  Manager Takeover Active
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-white dark:bg-surface border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300">
                  {activeTakeOverField.id}
                </span>
              </div>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5 font-medium">
                Supervising: <strong>{activeTakeOverField.memberName || 'Farm Member'}</strong> · {formatHectares(activeTakeOverField.areaHa || activeTakeOverField.ha)}. Operations logged or edited will be attributed to Manager Takeover.
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
              Exit Manager Takeover
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
                const fieldDrafts = localDrafts.filter(draft => draft.fieldId === field.id);
                const capability = getOperationCapabilities(user, field, takeoverSession);
                const cycle = field.cropCycle;
                const cycleSummary = cycle
                  ? [cycle.cropType || field.cycleType, formatCropYearDisplay(cycle.cropYear || field.cropYear), `Stage ${cycle.currentStageNumber || field.stageNumber || 1}`, cycle.status]
                    .filter(Boolean).join(' · ')
                  : null;

                const isTakeOverActiveForField = capability.takeover;
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
                              <span>Manager Takeover Active</span>
                            </span>
                          )}
                          {capability.ownField && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-success-bg text-success border border-success/30">
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Your Assigned Field</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-bold text-hug-text">{field.memberName || 'Unassigned Farm Member'}</span>
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
                            Exit Manager Takeover
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
                        {capability.canCreate ? (
                          <Button variant="primary" size="sm" icon={Plus} onClick={() => handleAddOperationClick(field)}>
                            Add Operation
                          </Button>
                        ) : capability.requiresTakeover ? (
                          <Button
                            variant="outline"
                            size="sm"
                            icon={ShieldCheck}
                            onClick={() => { setPendingAction(null); setAuthModalField(field); }}
                          >
                            Manager Takeover
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    {/* Expandable Recorded Operations Section - Spacious and Full Width */}
                    {isExpanded && (
                      <div className="border-t border-border/70 pt-4 space-y-3 w-full">
                        {fieldDrafts.length > 0 && (
                          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-2">
                            <span className="text-xs uppercase font-black tracking-wider text-amber-800 dark:text-amber-300">
                              Local-only drafts ({fieldDrafts.length})
                            </span>
                            {fieldDrafts.map(draft => (
                              <div key={draft.id} className="flex items-center justify-between gap-3 rounded-xl bg-white dark:bg-surface border border-border p-3">
                                <div className="min-w-0">
                                  <span className="block text-sm font-bold text-hug-text truncate">{draft.form?.activityName || 'Untitled operation draft'}</span>
                                  <span className="block text-[11px] text-hug-muted">Stored only in this browser · {formatDate(draft.updatedAt)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button variant="outline" size="sm" icon={FileText} onClick={() => handleContinueDraft(draft, field)}>Continue</Button>
                                  <button type="button" className="p-2 text-danger" title="Delete local draft" onClick={() => handleDeleteDraft(draft.id)}>
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
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
                              const presentation = operationPresentation(operation);
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
                                        Stage at Recording: {presentation.stageLabel || `Stage ${operation.stageNumberAtRecord || operation.stageNumber || 1}`}
                                      </span>
                                      {presentation.badges.filter(badge => badge.dimension !== 'lifecycle').map(badge => (
                                        <span key={badge.key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-surface dark:bg-[#252B27] border border-border text-hug-text">
                                          {badge.key === 'manager_takeover' && <UserCheck className="w-3 h-3" />}
                                          <span>{badge.label}</span>
                                        </span>
                                      ))}
                                      {presentation.submissionSource === 'MEMBER' && (
                                        <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-surface dark:bg-[#252B27] border border-border text-hug-muted">
                                          Farm Member Entry
                                        </span>
                                      )}
                                      {isArchived ? (
                                        <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-zinc-200 dark:bg-zinc-800 text-hug-muted">
                                          Archived
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-success-bg text-success border border-success/30">
                                          Active
                                        </span>
                                      )}
                                    </div>

                                    {/* Metadata Row: Spacious and clearly formatted */}
                                    <div className="flex items-center gap-4 text-xs sm:text-sm text-hug-muted flex-wrap pt-0.5">
                                      <div className="flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5 text-hug-muted" />
                                        <span>{formatDate(operation.performedOn || operation.date)}</span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-semibold text-hug-muted">Crop Year Cycle:</span>
                                        <span>{formatCropYearDisplay(operation.cropYearCycle || cropYearByCycleId.get(operation.cycleId))}</span>
                                      </div>
                                      {operation.variety && (
                                        <div className="flex items-center gap-1.5">
                                          <span className="font-semibold text-hug-muted">Sugarcane Variety:</span>
                                          <span>{operation.variety}</span>
                                        </div>
                                      )}
                                      {operation.areaHa && (
                                        <div className="flex items-center gap-1.5">
                                          <MapPin className="w-3.5 h-3.5 text-hug-muted" />
                                          <span>{Number(operation.areaHa).toFixed(2)} ha treated</span>
                                        </div>
                                      )}
                                      {operation.peopleCount > 0 && (
                                        <div className="flex items-center gap-1.5">
                                          <Users className="w-3.5 h-3.5 text-hug-muted" />
                                          <span>{operation.peopleCount} laborers</span>
                                        </div>
                                      )}
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-semibold text-hug-muted">Recorded By:</span>
                                        <span>{operation.submittedByUserId || 'Unknown'}</span>
                                      </div>
                                      {operation.updatedAt && (
                                        <div className="flex items-center gap-1.5">
                                          <span className="font-semibold text-hug-muted">Last Modified:</span>
                                          <span>{formatDate(operation.updatedAt)}</span>
                                        </div>
                                      )}
                                      {Array.isArray(operation.lineItems) && operation.lineItems.length > 0 && (
                                        <div className="flex items-center gap-1.5">
                                          <span className="font-semibold text-hug-muted">Materials / Activities:</span>
                                          <span>{operation.lineItems.length}</span>
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
                                    {operation.photoEvidence?.dataUrl && (
                                      <a href={operation.photoEvidence.dataUrl} target="_blank" rel="noreferrer" className="inline-flex mt-2">
                                        <img
                                          src={operation.photoEvidence.dataUrl}
                                          alt={`Evidence for ${operation.operationName || operation.id}`}
                                          className="w-24 h-16 object-cover rounded-lg border border-border hover:border-primary transition-colors"
                                        />
                                      </a>
                                    )}
                                    <AmendmentHistory operation={operation} />
                                  </div>

                                  {/* Right: Actions */}
                                  <div className="flex items-center gap-2 shrink-0 self-end lg:self-center">
                                    {capability.canEdit && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        icon={Pencil}
                                        disabled={isArchived}
                                        onClick={() => handleEditOperationClick(operation, field)}
                                        title={isArchived ? 'Archived operations cannot be edited.' : 'Edit this operation'}
                                      >
                                        Edit
                                      </Button>
                                    )}

                                    {canArchive && capability.canEdit && !isArchived && (
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
          <div className="bg-white dark:bg-surface rounded-2xl p-4 border border-border shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="w-full sm:w-48">
                <Select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  options={[
                    { value: 'ARCHIVED', label: 'Archived Logs' },
                    { value: 'ACTIVE', label: 'Active Logs' }
                  ]}
                />
              </div>
              {statusFilter === 'ARCHIVED' ? (
                <form
                  className="relative flex-1 min-w-0"
                  onSubmit={(event) => {
                    event.preventDefault();
                    updateArchiveFilter('search', archiveSearchDraft);
                  }}
                >
                  <Search className="w-4 h-4 text-hug-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={archiveSearchDraft}
                    onChange={(event) => setArchiveSearchDraft(event.target.value)}
                    placeholder="Exact operation record ID"
                    aria-label="Search archived operations by exact record ID"
                    className="w-full text-xs font-medium pl-9 pr-24 py-2 border border-border rounded-xl bg-surface-subtle text-hug-text placeholder:text-hug-muted outline-none focus:border-primary"
                  />
                  <button type="submit" className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 rounded-lg bg-primary text-white text-xs font-bold">
                    Search
                  </button>
                </form>
              ) : (
                <div className="relative flex-1 min-w-0">
                  <Search className="w-4 h-4 text-hug-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => {
                      setSearchQuery(event.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Search active operation name, field ID, task..."
                    className="w-full text-xs font-medium pl-9 pr-3 py-2 border border-border rounded-xl bg-surface-subtle text-hug-text placeholder:text-hug-muted outline-none focus:border-primary"
                  />
                </div>
              )}
            </div>

            {statusFilter === 'ARCHIVED' && (
              <div className="pt-3 border-t border-border/60">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="min-w-0">
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-hug-muted mb-1">Crop Year Cycle</span>
                    <Select
                      value={archiveFilters.cropYearCycle}
                      onChange={(event) => updateArchiveFilter('cropYearCycle', event.target.value)}
                      options={archiveCycleOptions}
                    />
                  </label>
                  <label className="min-w-0">
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-hug-muted mb-1">Field</span>
                    <Select
                      value={archiveFilters.fieldId}
                      onChange={(event) => updateArchiveFilter('fieldId', event.target.value)}
                      options={archiveFieldOptions}
                    />
                  </label>
                  <label className="min-w-0">
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-hug-muted mb-1">Operation</span>
                    <Select
                      value={archiveFilters.operationDefinitionId}
                      onChange={(event) => updateArchiveFilter('operationDefinitionId', event.target.value)}
                      options={archiveOperationOptions}
                    />
                  </label>
                </div>
                {invalidArchiveCycles.length > 0 && (
                  <p className="mt-2 text-xs font-semibold text-warning">
                    Data integrity notice: {invalidArchiveCycles.length} Crop Year Cycle record{invalidArchiveCycles.length === 1 ? '' : 's'} with an invalid stored year {invalidArchiveCycles.length === 1 ? 'is' : 'are'} excluded from this filter.
                  </p>
                )}
              </div>
            )}
          </div>

          {statusFilter === 'ARCHIVED' && archiveState.isCleared ? (
            <div className="rounded-2xl border border-border bg-surface p-8 text-center shadow-xs">
              <History className="w-8 h-8 mx-auto text-hug-muted mb-3" />
              <h3 className="text-sm font-black text-hug-text">View cleared.</h3>
              <p className="text-xs text-hug-muted mt-1 mb-4">Your archived records are still safely stored.</p>
              <Button variant="secondary" onClick={showArchiveRecords}>
                Show Records
              </Button>
            </div>
          ) : (
            <>
              <Table
                columns={historyColumns}
                data={statusFilter === 'ARCHIVED' ? archiveState.records : paginatedOperations}
                isLoading={statusFilter === 'ARCHIVED' ? archiveState.isLoading : opsData.isLoading}
                error={statusFilter === 'ARCHIVED' ? archiveState.error : opsData.error}
                onRetry={statusFilter === 'ARCHIVED' ? () => loadArchivePage({ append: false }) : undefined}
                emptyMessage={statusFilter === 'ARCHIVED' ? 'No archived records found for this selection.' : 'No active operation records found.'}
                emptySubtext={statusFilter === 'ARCHIVED'
                  ? 'Try another Crop Year Cycle, field, operation, or record ID.'
                  : 'Field activities recorded for your assigned plots will appear in this ledger.'}
                {...(statusFilter === 'ACTIVE' ? {
                  currentPage,
                  totalPages,
                  totalItems: filteredOperations.length,
                  onPageChange: setCurrentPage
                } : {})}
              />

              {statusFilter === 'ARCHIVED' && !archiveState.isLoading && !archiveState.error && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-xs">
                  <p className="text-xs text-hug-muted">
                    {archiveState.records.length} archived record{archiveState.records.length === 1 ? '' : 's'} currently displayed · newest archived first
                    {archiveState.loadMoreError && (
                      <span className="block mt-1 text-red-600">{archiveState.loadMoreError} Your displayed records were preserved.</span>
                    )}
                  </p>
                  <div className="flex items-center gap-2">
                    {archiveState.hasMore && (
                      <Button
                        variant="primary"
                        size="sm"
                        isLoading={archiveState.isLoadingMore}
                        loadingText="Loading..."
                        disabled={archiveState.isLoadingMore}
                        onClick={() => loadArchivePage({ append: true })}
                      >
                        Load More
                      </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={clearArchiveView} disabled={archiveState.records.length === 0}>
                      Clear View
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Modals & Dialogs */}

      {/* Manager Takeover password authorization modal */}
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
        isTakeOver={Boolean(addOperationField && getOperationCapabilities(user, addOperationField, takeoverSession).takeover)}
        takeoverGrant={addOperationField && getOperationCapabilities(user, addOperationField, takeoverSession).takeover ? takeoverGrant : null}
        canSaveDraft={Boolean(addOperationField && getOperationCapabilities(user, addOperationField, takeoverSession).canDraft)}
        initialDraft={activeDraft}
        onSaveDraft={handleSaveLocalDraft}
        validateBeforeSubmit={() => {
          if (!activeDraft) return { valid: true };
          const currentField = fieldsData.fields.find(field => field.id === activeDraft.fieldId);
          return validateLocalDraftForSubmission(user, currentField, activeDraft);
        }}
        onClose={() => { setAddOperationField(null); setActiveDraft(null); }}
        onSuccess={() => {
          if (activeDraft?.id) completeLocalDraftSubmission(user, activeDraft.id);
          setLocalDrafts(listLocalOperationDrafts(user));
          setAddOperationField(null);
          setActiveDraft(null);
          setUpdateSuccess('Operation recorded successfully and synchronized.');
        }}
      />

      {/* 3. Edit Operation Modal */}
      <EditOperationModal
        operation={editTarget}
        takeoverGrant={editTarget && getOperationCapabilities(
          user,
          fieldsData.fields.find(field => field.id === editTarget.fieldId),
          takeoverSession
        ).takeover ? takeoverGrant : null}
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
