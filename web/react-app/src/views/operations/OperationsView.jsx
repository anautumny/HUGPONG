import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ROLE_KEYS } from '../../utils/authRouting';
import {
  subscribeToOperationsData,
  archiveOperations
} from '../../services/operationsService';
import { subscribeToFieldsData } from '../../services/fieldsService';
import CompactDashboardHeader from '../../components/dashboard/CompactDashboardHeader';
import OperationForm from '../../components/operations/OperationForm';
import {
  Table,
  TablePagination,
  Button,
  StatusBadge,
  ConfirmDialog,
  Select,
  Input
} from '../../components/ui';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  ClipboardList,
  History,
  Archive,
  Search,
  ArrowRight,
  ShieldCheck,
  Calendar
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function OperationsView() {
  const { user, roleKey } = useAuth();
  const navigate = useNavigate();

  const isManager = roleKey === ROLE_KEYS.FARM_MANAGER;
  const isSuper = roleKey === ROLE_KEYS.SUPER_ADMIN;
  const canArchive = isManager || isSuper || roleKey === ROLE_KEYS.MEMBER_FARMER;

  // Active view tab: 'record' or 'history'
  const [activeTab, setActiveTab] = useState('record');

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

  // Filter history records
  const filteredOperations = useMemo(() => {
    return opsData.operations.filter(op => {
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
  }, [opsData.operations, statusFilter, searchQuery]);

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
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-bg dark:bg-[#0C1015] text-hug-text border border-border">
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
    <div className="space-y-6">
      {/* 1. Header */}
      <CompactDashboardHeader
        title="Field Operations Console"
        contextText={`Agricultural Activity Submission & Operational Ledger · ${opsData.operations.length} recorded logs`}
        actions={headerActions}
      />

      {/* 2. Navigation Tab Switcher */}
      <div className="flex items-center gap-2 border-b border-border/80 pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('record')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'record'
              ? 'bg-primary text-white shadow-xs'
              : 'text-hug-muted hover:text-hug-text hover:bg-bg dark:hover:bg-[#0C1015]'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span>Record New Operation</span>
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
          <span>Operation History &amp; Ledger ({opsData.operations.length})</span>
        </button>
      </div>

      {/* 3. Tab Contents */}
      {activeTab === 'record' ? (
        <div className="max-w-4xl">
          <OperationForm
            fields={fieldsData.fields}
            onSuccess={() => setActiveTab('history')}
          />
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
                className="w-full text-xs font-medium pl-9 pr-3 py-2 border border-border rounded-xl bg-bg/50 dark:bg-[#0C1015] text-hug-text placeholder:text-hug-muted outline-none focus:border-primary"
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
    </div>
  );
}
