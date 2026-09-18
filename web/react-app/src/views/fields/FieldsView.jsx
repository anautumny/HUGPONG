import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ROLE_KEYS } from '../../utils/authRouting';
import {
  subscribeToFieldsData,
  archiveField
} from '../../services/fieldsService';
import CompactDashboardHeader from '../../components/dashboard/CompactDashboardHeader';
import {
  Table,
  TablePagination,
  Input,
  Select,
  Button,
  StatusBadge,
  ConfirmDialog,
  Badge
} from '../../components/ui';
import FieldEnrollmentModal from '../../components/fields/FieldEnrollmentModal';
import FieldEditModal from '../../components/fields/FieldEditModal';
import FieldDetailModal from '../../components/fields/FieldDetailModal';
import { formatHectares } from '../../utils/formatters';
import { Plus, Search, Filter, Layers, ArrowRight, Eye, Edit3, Archive } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function FieldsView() {
  const { user, roleKey } = useAuth();
  const navigate = useNavigate();

  const isManager = roleKey === ROLE_KEYS.FARM_MANAGER;
  const isSuper = roleKey === ROLE_KEYS.SUPER_ADMIN;
  const canModify = isManager || isSuper;

  // Data state
  const [data, setData] = useState({
    fields: [],
    cropCycles: [],
    blockFarms: [],
    memberUsers: [],
    isLoading: true,
    error: null
  });

  // Filter & search state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFarm, setSelectedFarm] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Modal states
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [editField, setEditField] = useState(null);
  const [detailField, setDetailField] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [isArchiving, setIsArchiving] = useState(false);

  // Subscribe to real-time fields data
  useEffect(() => {
    let active = true;

    const unsubscribe = subscribeToFieldsData({
      user,
      onUpdate: (updatedState) => {
        if (!active) return;
        setData(updatedState);
      },
      onError: (err) => {
        if (!active) return;
        setData(prev => ({ ...prev, isLoading: false, error: err.message }));
      }
    });

    return () => {
      active = false;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [user?.id, user?.employeeId]);

  // Filter fields
  const filteredFields = useMemo(() => {
    return data.fields.filter(f => {
      // Status filter
      if (statusFilter !== 'ALL' && (f.status || 'ACTIVE').toUpperCase() !== statusFilter) {
        return false;
      }

      // Farm filter
      if (selectedFarm !== 'ALL' && f.blockFarmId !== selectedFarm) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const idMatch = (f.id || '').toLowerCase().includes(q);
        const nameMatch = (f.memberName || '').toLowerCase().includes(q);
        const varietyMatch = (f.variety || '').toLowerCase().includes(q);
        const farmMatch = (f.blockFarmName || '').toLowerCase().includes(q);
        return idMatch || nameMatch || varietyMatch || farmMatch;
      }

      return true;
    });
  }, [data.fields, statusFilter, selectedFarm, searchQuery]);

  // Paginated slice
  const paginatedFields = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredFields.slice(start, start + pageSize);
  }, [filteredFields, currentPage]);

  const totalPages = Math.max(1, Math.ceil(filteredFields.length / pageSize));

  // Total cultivated area
  const totalArea = useMemo(() => {
    return filteredFields.reduce((sum, f) => sum + Number(f.areaHa || f.ha || 0), 0);
  }, [filteredFields]);

  // Handle Archive Confirmation
  const handleArchiveConfirm = async () => {
    if (!archiveTarget) return;
    setIsArchiving(true);
    try {
      await archiveField(archiveTarget.id);
      setIsArchiving(false);
      setArchiveTarget(null);
    } catch (err) {
      console.error('[FieldsView] Archive error:', err);
      setIsArchiving(false);
      alert(err.message || 'Unable to archive field plot.');
    }
  };

  // Header Actions
  const headerActions = useMemo(() => {
    const actions = [];
    if (canModify) {
      actions.push({
        label: 'Enroll Field Plot',
        icon: Plus,
        primary: true,
        onClick: () => setEnrollModalOpen(true)
      });
    }
    if (isManager) {
      actions.push({
        label: 'Take Over Console',
        to: '/takeover',
        icon: ArrowRight
      });
    }
    return actions;
  }, [canModify, isManager]);

  // Table Columns
  const columns = [
    {
      key: 'id',
      header: 'Field ID',
      width: '130px',
      cellClassName: 'font-mono font-bold text-xs text-primary dark:text-primary-light'
    },
    {
      key: 'memberName',
      header: 'Assigned Member',
      render: (val, row) => (
        <div>
          <span className="font-bold text-hug-text block">{val || 'Unassigned'}</span>
          {row.memberPhone && (
            <span className="text-[11px] text-hug-muted font-mono">{row.memberPhone}</span>
          )}
        </div>
      )
    },
    {
      key: 'blockFarmName',
      header: 'Parent Block Farm',
      render: (val, row) => (
        <span className="text-xs text-hug-muted font-medium truncate max-w-[160px] block">
          {val || row.blockFarmId}
        </span>
      )
    },
    {
      key: 'areaHa',
      header: 'Acreage',
      width: '110px',
      render: (val, row) => (
        <span className="font-bold text-hug-text">
          {formatHectares(val || row.ha)}
        </span>
      )
    },
    {
      key: 'stageNumber',
      header: 'Growth Stage',
      width: '120px',
      render: (val) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-bg dark:bg-[#0C1015] text-hug-text border border-border">
          Stage {val || 1}
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
      header: 'Actions',
      align: 'right',
      width: '160px',
      render: (_, row) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setDetailField(row)}
            title="View Plot Details"
            className="p-1.5 rounded-lg text-hug-muted hover:text-hug-text hover:bg-bg dark:hover:bg-[#0C1015] transition-colors cursor-pointer"
          >
            <Eye className="w-4 h-4" />
          </button>

          {canModify && row.status !== 'ARCHIVED' && (
            <button
              type="button"
              onClick={() => setEditField(row)}
              title="Edit Plot Parameters"
              className="p-1.5 rounded-lg text-hug-muted hover:text-hug-text hover:bg-bg dark:hover:bg-[#0C1015] transition-colors cursor-pointer"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          )}

          {isManager && row.status === 'ACTIVE' && (
            <button
              type="button"
              onClick={() => navigate(`/takeover?fieldId=${encodeURIComponent(row.id)}`)}
              title="Take Over Field Plot"
              className="px-2 py-1 rounded-lg text-xs font-bold text-primary dark:text-primary-light hover:bg-primary-bg dark:hover:bg-primary/20 transition-colors cursor-pointer"
            >
              Take Over
            </button>
          )}

          {canModify && row.status === 'ACTIVE' && (
            <button
              type="button"
              onClick={() => setArchiveTarget(row)}
              title="Archive Plot"
              className="p-1.5 rounded-lg text-hug-muted hover:text-danger hover:bg-danger-bg dark:hover:bg-danger/20 transition-colors cursor-pointer"
            >
              <Archive className="w-4 h-4" />
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* 1. Header */}
      <CompactDashboardHeader
        title="Field Plot Registry"
        contextText={`Spatial Aggregation & Cooperative Plot Directory · ${filteredFields.length} plots (${formatHectares(totalArea)})`}
        actions={headerActions}
      />

      {/* 2. Filter & Search Bar */}
      <div className="bg-white dark:bg-surface rounded-2xl p-4 border border-border shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-hug-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search field ID, member name, variety..."
              className="w-full text-xs font-medium pl-9 pr-3 py-2 border border-border rounded-xl bg-bg/50 dark:bg-[#0C1015] text-hug-text placeholder:text-hug-muted outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Parent Block Farm Filter */}
          <div className="w-44">
            <Select
              value={selectedFarm}
              onChange={(e) => {
                setSelectedFarm(e.target.value);
                setCurrentPage(1);
              }}
              options={[
                { value: 'ALL', label: 'All Block Farms' },
                ...data.blockFarms.map(bf => ({
                  value: bf.id,
                  label: bf.name
                }))
              ]}
            />
          </div>

          {/* Status Filter */}
          <div className="w-36">
            <Select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              options={[
                { value: 'ACTIVE', label: 'Active Plots' },
                { value: 'ARCHIVED', label: 'Archived Plots' },
                { value: 'ALL', label: 'All Statuses' }
              ]}
            />
          </div>
        </div>
      </div>

      {/* 3. Fields Table */}
      <div className="space-y-2">
        <Table
          columns={columns}
          data={paginatedFields}
          isLoading={data.isLoading}
          error={data.error}
          onRowClick={(row) => setDetailField(row)}
          emptyMessage="No registered field plots found."
          emptySubtext="Enrolled parcels will appear here with crop cycle progress and member farmer assignments."
          emptyAction={
            canModify && (
              <Button size="sm" onClick={() => setEnrollModalOpen(true)} icon={Plus}>
                Enroll First Field Plot
              </Button>
            )
          }
        />

        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredFields.length}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* 4. Modals */}
      <FieldEnrollmentModal
        isOpen={enrollModalOpen}
        onClose={() => setEnrollModalOpen(false)}
        blockFarms={data.blockFarms}
        memberUsers={data.memberUsers}
        defaultBlockFarmId={user?.blockFarmId || (data.blockFarms[0]?.id || '')}
        onSuccess={() => {}}
      />

      <FieldEditModal
        isOpen={Boolean(editField)}
        onClose={() => setEditField(null)}
        field={editField}
        blockFarms={data.blockFarms}
        memberUsers={data.memberUsers}
        onSuccess={() => {}}
      />

      <FieldDetailModal
        isOpen={Boolean(detailField)}
        onClose={() => setDetailField(null)}
        field={detailField}
        isManager={isManager}
        onEdit={(f) => setEditField(f)}
      />

      <ConfirmDialog
        isOpen={Boolean(archiveTarget)}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={handleArchiveConfirm}
        isLoading={isArchiving}
        loadingText="Archiving Field..."
        title={`Archive field plot ${archiveTarget?.id}?`}
        message="This field parcel will be archived. All associated active crop cycles and historical operation records will remain available in compliance audit ledgers."
        confirmText="Archive Plot"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  );
}
