import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ROLE_KEYS } from '../../utils/authRouting';
import {
  subscribeToFieldsData,
  archiveField
} from '../../services/fieldsService';
import { subscribeToBlockFarmsData } from '../../services/blockFarmsService';
import CompactDashboardHeader from '../../components/dashboard/CompactDashboardHeader';
import {
  Table,
  TablePagination,
  Input,
  Select,
  Button,
  StatusBadge,
  ConfirmDialog,
  Modal
} from '../../components/ui';
import FieldEnrollmentModal from '../../components/fields/FieldEnrollmentModal';
import FieldEditModal from '../../components/fields/FieldEditModal';
import FieldDetailModal from '../../components/fields/FieldDetailModal';
import BlockFarmModal from '../../components/fields/BlockFarmModal';
import { formatHectares, formatCropYearDisplay } from '../../utils/formatters';
import {
  Building2,
  MapPin,
  Layers,
  Users,
  Plus,
  Search,
  Eye,
  Edit3,
  Archive,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  ClipboardList,
  X
} from 'lucide-react';

export default function FarmFieldRegistryView() {
  const { user, roleKey } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const isFarmManager = roleKey === ROLE_KEYS.FARM_MANAGER;
  const isSraAdmin = roleKey === ROLE_KEYS.SRA_ADMIN;
  const isSuperAdmin = roleKey === ROLE_KEYS.SUPER_ADMIN;

  // Active view tab resolution:
  // Farm Manager: strictly 'fields'
  // SRA Admin: 'blocks' or 'fields' (defaults to 'blocks')
  // Super Admin: 'blocks' or 'fields' (defaults to 'blocks')
  const defaultTab = isFarmManager ? 'fields' : (searchParams.get('tab') === 'fields' ? 'fields' : 'blocks');
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Sync tab with URL search parameter for Super Admin and SRA Admin
  useEffect(() => {
    if (isSuperAdmin || isSraAdmin) {
      const qTab = searchParams.get('tab');
      if (qTab === 'fields' || qTab === 'blocks') {
        setActiveTab(qTab);
      }
    } else if (isFarmManager) {
      setActiveTab('fields');
    }
  }, [isSuperAdmin, isSraAdmin, isFarmManager, searchParams]);

  // Data states
  const [fieldsState, setFieldsState] = useState({
    fields: [],
    cropCycles: [],
    blockFarms: [],
    memberUsers: [],
    isLoading: true,
    error: null
  });

  const [blockFarmsState, setBlockFarmsState] = useState({
    blockFarms: [],
    fields: [],
    farmManagers: [],
    isLoading: true,
    error: null
  });

  // Filters & Pagination for Field Plots
  const [fieldSearchQuery, setFieldSearchQuery] = useState('');
  const [fieldStatusFilter, setFieldStatusFilter] = useState('ACTIVE');
  const [fieldFarmFilter, setFieldFarmFilter] = useState(searchParams.get('farmId') || 'ALL');
  const [fieldCurrentPage, setFieldCurrentPage] = useState(1);
  const pageSize = 10;

  // Filters & Pagination for Block Farms
  const [blockSearchQuery, setBlockSearchQuery] = useState('');
  const [blockStatusFilter, setBlockStatusFilter] = useState('ACTIVE');
  const [blockCurrentPage, setBlockCurrentPage] = useState(1);

  // Modal states
  const [enrollFieldModalOpen, setEnrollFieldModalOpen] = useState(false);
  const [editField, setEditField] = useState(null);
  const [detailField, setDetailField] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [isArchiving, setIsArchiving] = useState(false);

  const [blockFarmModalOpen, setBlockFarmModalOpen] = useState(false);
  const [editingBlockFarm, setEditingBlockFarm] = useState(null);
  const [inspectBlockFarm, setInspectBlockFarm] = useState(null);

  // 1. Subscribe to Fields data
  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeToFieldsData({
      user,
      onUpdate: (data) => {
        if (!active) return;
        setFieldsState(data);
      },
      onError: (err) => {
        if (!active) return;
        setFieldsState(prev => ({ ...prev, isLoading: false, error: err.message }));
      }
    });

    return () => {
      active = false;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [user?.id, user?.employeeId]);

  // 2. Subscribe to Block Farms data
  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeToBlockFarmsData({
      user,
      onUpdate: (data) => {
        if (!active) return;
        setBlockFarmsState(data);
      },
      onError: (err) => {
        if (!active) return;
        setBlockFarmsState(prev => ({ ...prev, isLoading: false, error: err.message }));
      }
    });

    return () => {
      active = false;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [user]);

  // Assigned Block Farm for Farm Manager
  const currentActorId = String(user?.employeeId || user?.id || user?.userId || '').trim();
  const assignedBlockFarm = useMemo(() => {
    if (!isFarmManager) return null;
    return blockFarmsState.blockFarms.find(bf => bf.managerUserId === currentActorId || bf.id === user?.blockFarmId)
      || fieldsState.blockFarms.find(bf => bf.managerUserId === currentActorId || bf.id === user?.blockFarmId)
      || null;
  }, [isFarmManager, blockFarmsState.blockFarms, fieldsState.blockFarms, currentActorId, user?.blockFarmId]);

  // Farm Manager scoped fields (enforce strict single-farm isolation)
  const managerScopedFields = useMemo(() => {
    if (!isFarmManager) return fieldsState.fields;
    const farmId = assignedBlockFarm?.id || user?.blockFarmId;
    if (!farmId) return [];
    return fieldsState.fields.filter(f => f.blockFarmId === farmId);
  }, [isFarmManager, fieldsState.fields, assignedBlockFarm?.id, user?.blockFarmId]);

  // Filtered Field Plots
  const filteredFields = useMemo(() => {
    const sourceFields = isFarmManager ? managerScopedFields : fieldsState.fields;

    return sourceFields.filter(f => {
      if (fieldStatusFilter !== 'ALL' && (f.status || 'ACTIVE').toUpperCase() !== fieldStatusFilter) {
        return false;
      }
      if (!isFarmManager && fieldFarmFilter !== 'ALL' && f.blockFarmId !== fieldFarmFilter) {
        return false;
      }
      if (fieldSearchQuery.trim()) {
        const q = fieldSearchQuery.toLowerCase();
        const idMatch = (f.id || '').toLowerCase().includes(q);
        const nameMatch = (f.memberName || '').toLowerCase().includes(q);
        const varietyMatch = (f.variety || '').toLowerCase().includes(q);
        const farmMatch = (f.blockFarmName || '').toLowerCase().includes(q);
        return idMatch || nameMatch || varietyMatch || farmMatch;
      }
      return true;
    });
  }, [isFarmManager, managerScopedFields, fieldsState.fields, fieldStatusFilter, fieldFarmFilter, fieldSearchQuery]);

  const paginatedFields = useMemo(() => {
    const start = (fieldCurrentPage - 1) * pageSize;
    return filteredFields.slice(start, start + pageSize);
  }, [filteredFields, fieldCurrentPage]);

  const totalFieldPages = Math.max(1, Math.ceil(filteredFields.length / pageSize));

  // Filtered Block Farms
  const filteredBlockFarms = useMemo(() => {
    return blockFarmsState.blockFarms.filter(bf => {
      if (blockStatusFilter !== 'ALL' && (bf.status || 'ACTIVE').toUpperCase() !== blockStatusFilter) {
        return false;
      }
      if (blockSearchQuery.trim()) {
        const q = blockSearchQuery.toLowerCase();
        const idMatch = (bf.id || '').toLowerCase().includes(q);
        const codeMatch = (bf.code || '').toLowerCase().includes(q);
        const nameMatch = (bf.name || '').toLowerCase().includes(q);
        const locMatch = (bf.location || '').toLowerCase().includes(q);
        const mgrMatch = (bf.managerUserId || '').toLowerCase().includes(q);
        return idMatch || codeMatch || nameMatch || locMatch || mgrMatch;
      }
      return true;
    });
  }, [blockFarmsState.blockFarms, blockStatusFilter, blockSearchQuery]);

  const paginatedBlockFarms = useMemo(() => {
    const start = (blockCurrentPage - 1) * pageSize;
    return filteredBlockFarms.slice(start, start + pageSize);
  }, [filteredBlockFarms, blockCurrentPage]);

  const totalBlockPages = Math.max(1, Math.ceil(filteredBlockFarms.length / pageSize));

  // Handle Tab Switch (Super Admin and SRA Admin)
  const handleTabSwitch = (newTab) => {
    if (isFarmManager) return; // Farm Manager is strictly fields
    setActiveTab(newTab);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', newTab);
      return next;
    });
    setFieldCurrentPage(1);
    setBlockCurrentPage(1);
  };

  // Archive field handler (Farm Manager only)
  const handleArchiveConfirm = async () => {
    if (!archiveTarget || !isFarmManager) return;
    setIsArchiving(true);
    try {
      await archiveField(archiveTarget.id);
      setIsArchiving(false);
      setArchiveTarget(null);
    } catch (err) {
      console.error('[FarmFieldRegistry] Archive error:', err);
      setIsArchiving(false);
      alert(err.message || 'Unable to archive field plot.');
    }
  };

  // Header Actions (Farm Manager gets Add Field, SRA gets Add Block Farm on blocks tab, Super Admin & SRA on fields gets none)
  const headerActions = useMemo(() => {
    if (isFarmManager) {
      return [
        {
          label: 'Add Field',
          icon: Plus,
          variant: 'primary',
          onClick: () => setEnrollFieldModalOpen(true)
        }
      ];
    }
    if (isSraAdmin && activeTab === 'blocks') {
      return [
        {
          label: 'Add Block Farm',
          icon: Plus,
          variant: 'primary',
          onClick: () => {
            setEditingBlockFarm(null);
            setBlockFarmModalOpen(true);
          }
        }
      ];
    }
    return []; // Super Admin has NO action button (read-only); SRA Admin on fields tab is read-only
  }, [isFarmManager, isSraAdmin, activeTab]);

  // Scoped Metrics (Rule 5 & 6: Consistent HUGPONG green accent styling, no rainbow colors)
  const summaryCards = useMemo(() => {
    if (isFarmManager) {
      const totalCultivated = managerScopedFields.reduce((sum, f) => sum + Number(f.areaHa || f.ha || 0), 0);
      const declaredArea = Number(assignedBlockFarm?.declaredAreaHa ?? assignedBlockFarm?.declaredHa ?? 0);
      return [
        {
          label: 'Assigned Block Farm',
          value: assignedBlockFarm?.name || 'Assigned Cooperative',
          subtext: `Code: ${assignedBlockFarm?.code || assignedBlockFarm?.id || 'N/A'}`,
          icon: Building2
        },
        {
          label: 'Declared Area',
          value: formatHectares(declaredArea),
          subtext: 'Certified landholding',
          icon: MapPin
        },
        {
          label: 'Enrolled Plots',
          value: managerScopedFields.length,
          subtext: 'Active member parcels',
          icon: Layers
        },
        {
          label: 'Cultivated Area',
          value: formatHectares(totalCultivated),
          subtext: `${formatHectares(Math.max(0, declaredArea - totalCultivated))} unallocated`,
          icon: Users
        }
      ];
    }

    if (isSraAdmin) {
      const totalDeclared = filteredBlockFarms.reduce((sum, bf) => sum + Number(bf.declaredAreaHa ?? bf.declaredHa ?? 0), 0);
      const totalDistrictPlots = blockFarmsState.fields.length;
      const assignedManagers = new Set(filteredBlockFarms.map(bf => bf.managerUserId).filter(Boolean)).size;
      return [
        {
          label: 'Registered Block Farms',
          value: filteredBlockFarms.length,
          subtext: 'District cooperative entities',
          icon: Building2
        },
        {
          label: 'Total Declared Area',
          value: formatHectares(totalDeclared),
          subtext: 'District cooperative landholding',
          icon: MapPin
        },
        {
          label: 'Enrolled Farm Member Fields',
          value: totalDistrictPlots,
          subtext: 'Registered parcel records',
          icon: Layers
        },
        {
          label: 'Assigned Farm Managers',
          value: assignedManagers,
          subtext: 'Authorized personnel',
          icon: Users
        }
      ];
    }

    // Super Admin: Governance Oversight
    const totalDeclared = filteredBlockFarms.reduce((sum, bf) => sum + Number(bf.declaredAreaHa ?? bf.declaredHa ?? 0), 0);
    const assignedManagers = new Set(blockFarmsState.blockFarms.map(bf => bf.managerUserId).filter(Boolean)).size;
    return [
      {
        label: 'Total Block Farms',
        value: blockFarmsState.blockFarms.length,
        subtext: 'System-wide cooperatives',
        icon: Building2
      },
      {
        label: 'Declared Landholding',
        value: formatHectares(totalDeclared),
        subtext: 'Certified agricultural acreage',
        icon: MapPin
      },
      {
        label: 'Registered Field Plots',
        value: fieldsState.fields.length,
        subtext: 'Enrolled parcel directory',
        icon: Layers
      },
      {
        label: 'Active Farm Managers',
        value: assignedManagers,
        subtext: 'Supervising operations',
        icon: Users
      }
    ];
  }, [isFarmManager, isSraAdmin, assignedBlockFarm, managerScopedFields, filteredBlockFarms, blockFarmsState, fieldsState]);

  // Field Plot Table Columns
  const fieldColumns = [
    {
      key: 'id',
      header: 'Field ID',
      width: '140px',
      cellClassName: 'font-mono font-bold text-xs text-primary dark:text-primary-light'
    },
    {
      key: 'memberName',
      header: 'Assigned Farm Member',
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
        <span className="text-xs text-hug-muted font-medium truncate max-w-[200px] block">
          {val || row.blockFarmId}
        </span>
      )
    },
    {
      key: 'areaHa',
      header: 'Cultivated Area',
      width: '130px',
      render: (val, row) => (
        <span className="font-bold text-hug-text">
          {formatHectares(val || row.ha)}
        </span>
      )
    },
    {
      key: 'cropYear',
      header: 'Crop Year Cycle',
      width: '145px',
      render: (val, row) => (
        <span className="font-semibold text-hug-text whitespace-nowrap">
          {formatCropYearDisplay(val || row.cropCycle?.cropYear)}
        </span>
      )
    },
    {
      key: 'stageNumber',
      header: 'Current Stage',
      width: '120px',
      render: (val) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-primary-bg/50 dark:bg-primary/20 text-primary dark:text-primary-light border border-primary/20">
          Stage {val || 1}
        </span>
      )
    },
    {
      key: 'status',
      header: 'Status',
      width: '110px',
      render: (val) => <StatusBadge status={val || 'ACTIVE'} />
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      width: isFarmManager ? '190px' : '70px',
      render: (_, row) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {/* Read-Only Inspect Button (available to all roles) */}
          <button
            type="button"
            onClick={() => setDetailField(row)}
            title="Inspect Plot Details"
            className="p-1.5 rounded-lg text-hug-muted hover:text-hug-text hover:bg-surface-subtle transition-colors cursor-pointer"
          >
            <Eye className="w-4 h-4" />
          </button>

          {/* Farm Manager modifying controls */}
          {isFarmManager && row.status !== 'ARCHIVED' && (
            <button
              type="button"
              onClick={() => setEditField(row)}
              title="Edit Plot Parameters"
              className="p-1.5 rounded-lg text-hug-muted hover:text-hug-text hover:bg-surface-subtle transition-colors cursor-pointer"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          )}

          {isFarmManager && row.status === 'ACTIVE' && (
            <button
              type="button"
              onClick={() => navigate(`/operations?fieldId=${encodeURIComponent(row.id)}`)}
              title="View Field Operations"
              className="px-2 py-1 rounded-lg text-xs font-bold text-primary dark:text-primary-light hover:bg-primary-bg dark:hover:bg-primary/20 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>Operations</span>
            </button>
          )}

          {isFarmManager && row.status === 'ACTIVE' && (
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

  // Block Farm Table Columns
  const blockColumns = [
    {
      key: 'id',
      header: 'Farm Code / ID',
      width: '150px',
      render: (_, row) => (
        <div>
          <span className="font-mono font-bold text-xs text-primary dark:text-primary-light block">
            {row.code || row.id}
          </span>
          {row.code && row.code !== row.id && (
            <span className="text-[10px] text-hug-muted font-mono">{row.id}</span>
          )}
        </div>
      )
    },
    {
      key: 'name',
      header: 'Block Farm Name & Location',
      render: (val, row) => (
        <div>
          <span className="font-bold text-sm text-hug-text block">{val || 'Unnamed Block Farm'}</span>
          {row.location && (
            <span className="text-xs text-hug-muted flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3 text-hug-muted shrink-0" />
              <span className="truncate max-w-[280px]">{row.location}</span>
            </span>
          )}
        </div>
      )
    },
    {
      key: 'manager',
      header: 'Assigned Farm Manager',
      render: (_, row) => {
        const mgr = blockFarmsState.farmManagers?.find(u => u.id === row.managerUserId || u.employeeId === row.managerUserId);
        if (!mgr && !row.managerUserId) {
          return <span className="text-xs text-hug-muted italic">Unassigned</span>;
        }
        return (
          <div>
            <span className="font-semibold text-xs text-hug-text block">
              {mgr?.displayName || mgr?.name || row.managerUserId}
            </span>
            <span className="text-[11px] text-hug-muted font-mono">
              {mgr?.phone || (mgr?.employeeId && `ID: ${mgr.employeeId}`)}
            </span>
          </div>
        );
      }
    },
    {
      key: 'declaredAreaHa',
      header: 'Declared Area',
      width: '130px',
      render: (val, row) => (
        <span className="font-bold text-hug-text">
          {formatHectares(val ?? row.declaredHa ?? 0)}
        </span>
      )
    },
    {
      key: 'plots',
      header: 'Enrolled Farm Member Fields',
      width: '180px',
      render: (_, row) => {
        const farmPlots = blockFarmsState.fields.filter(f => f.blockFarmId === row.id);
        const farmPlotsArea = farmPlots.reduce((sum, f) => sum + Number(f.areaHa || f.ha || 0), 0);
        return (
          <div>
            <span className="font-bold text-xs text-hug-text block">
              {farmPlots.length} {farmPlots.length === 1 ? 'plot' : 'plots'}
            </span>
            <span className="text-[11px] text-hug-muted">
              {formatHectares(farmPlotsArea)} cultivated
            </span>
          </div>
        );
      }
    },
    {
      key: 'status',
      header: 'Status',
      width: '110px',
      render: (val) => <StatusBadge status={val || 'ACTIVE'} />
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      width: isSraAdmin ? '110px' : '60px',
      render: (_, row) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {/* Inspect Button (Super Admin and SRA Admin) */}
          <button
            type="button"
            onClick={() => setInspectBlockFarm(row)}
            title="Inspect Block Farm Record"
            className="p-1.5 rounded-lg text-hug-muted hover:text-hug-text hover:bg-surface-subtle transition-colors cursor-pointer"
          >
            <Eye className="w-4 h-4" />
          </button>

          {/* SRA Admin Edit Button */}
          {isSraAdmin && (
            <button
              type="button"
              onClick={() => {
                setEditingBlockFarm(row);
                setBlockFarmModalOpen(true);
              }}
              title="Edit Block Farm Parameters"
              className="p-1.5 rounded-lg text-hug-muted hover:text-hug-text hover:bg-surface-subtle transition-colors cursor-pointer"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          )}
        </div>
      )
    }
  ];

  const pageSubtitle = isFarmManager
    ? 'Manage and review member field parcels within your assigned block farm.'
    : isSraAdmin
      ? 'Manage and review district cooperative block farms and landholding boundaries.'
      : 'System-wide inspection of cooperative block farms and member field parcels.';

  const pageBadge = isFarmManager
    ? 'Cooperative Parcels'
    : isSraAdmin
      ? 'District Jurisdictions'
      : 'Governance Oversight';

  if (isSuperAdmin) {
    return (
      <div className="p-8 max-w-md mx-auto text-center space-y-3">
        <ShieldCheck className="w-10 h-10 text-hug-muted mx-auto" />
        <h1 className="text-lg font-black text-hug-text">Agricultural Registry Restricted</h1>
        <p className="text-sm text-hug-muted">Super Admin access is limited to platform governance, accounts, support, telemetry, and system health.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Standardized Header (Rule 4) */}
      <CompactDashboardHeader
        category="Spatial Governance & Oversight"
        badge={pageBadge}
        title="Farm & Field Registry"
        subtitle={pageSubtitle}
        actions={headerActions}
      />

      {/* 2. Role-Aware Tabs matching Active Personnel / Pending Applications style exactly */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/80 pb-2.5">
        {/* SRA Admin or Super Admin: Block Farms tab */}
        {(isSraAdmin || isSuperAdmin) && (
          <button
            type="button"
            onClick={() => handleTabSwitch('blocks')}
            className={`px-4.5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'blocks'
                ? 'bg-primary text-white shadow-xs'
                : 'text-hug-muted hover:text-hug-text hover:bg-bg dark:hover:bg-gray-800'
            }`}
          >
            Block Farms ({blockFarmsState.blockFarms.length})
          </button>
        )}

        {/* Farm Manager, SRA Admin, or Super Admin: Field Registry tab */}
        {(isFarmManager || isSraAdmin || isSuperAdmin) && (
          <button
            type="button"
            onClick={() => handleTabSwitch('fields')}
            className={`px-4.5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'fields'
                ? 'bg-primary text-white shadow-xs'
                : 'text-hug-muted hover:text-hug-text hover:bg-bg dark:hover:bg-gray-800'
            }`}
          >
            Field Registry ({isFarmManager ? managerScopedFields.length : fieldsState.fields.length})
          </button>
        )}

        {/* Read-Only Governance Pill */}
        {isSuperAdmin ? (
          <div className="ml-auto flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-surface border border-border/80 text-xs font-semibold text-hug-muted shadow-2xs">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span>Read-Only Governance Mode</span>
          </div>
        ) : (isSraAdmin && activeTab === 'fields') ? (
          <div className="ml-auto flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-surface border border-border/80 text-xs font-semibold text-hug-muted shadow-2xs">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span>Read-Only Plot Registry</span>
          </div>
        ) : null}
      </div>

      {/* 3. Role-Aware Summary KPI Cards (Rules 5 & 6: Unified dark-green accent, no rainbow colors) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {summaryCards.map((card, idx) => (
          <div
            key={idx}
            className="bg-surface border border-border/80 rounded-2xl p-4 sm:p-5 shadow-2xs flex flex-col justify-between"
          >
            <div className="text-hug-muted mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">{card.label}</span>
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-black text-hug-text tracking-tight truncate">
                {card.value}
              </div>
              <p className="text-[11px] text-hug-muted mt-0.5 truncate">{card.subtext}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 4. Active View Content */}
      {activeTab === 'fields' ? (
        <div className="space-y-4">
          {/* Field Filter & Search Controls */}
          <div className="bg-surface border border-border/80 rounded-2xl p-4 shadow-2xs">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
              <div className={`${isSuperAdmin ? 'sm:col-span-6' : 'sm:col-span-8'} min-w-0`}>
                <Input
                  value={fieldSearchQuery}
                  onChange={(e) => {
                    setFieldSearchQuery(e.target.value);
                    setFieldCurrentPage(1);
                  }}
                  placeholder="Search by Field ID, Farm Member, Crop Variety..."
                  icon={Search}
                  className="w-full"
                />
              </div>

              {/* Super Admin Parent Block Farm filter */}
              {isSuperAdmin && (
                <div className="sm:col-span-3 min-w-0">
                  <Select
                    value={fieldFarmFilter}
                    onChange={(e) => {
                      setFieldFarmFilter(e.target.value);
                      setFieldCurrentPage(1);
                    }}
                    options={[
                      { value: 'ALL', label: 'All Block Farms' },
                      ...fieldsState.blockFarms.map(bf => ({
                        value: bf.id,
                        label: bf.name || bf.code || bf.id
                      }))
                    ]}
                  />
                </div>
              )}

              <div className={`${isSuperAdmin ? 'sm:col-span-3' : 'sm:col-span-4'} min-w-0`}>
                <Select
                  value={fieldStatusFilter}
                  onChange={(e) => {
                    setFieldStatusFilter(e.target.value);
                    setFieldCurrentPage(1);
                  }}
                  options={[
                    { value: 'ACTIVE', label: 'Status: Active Plots' },
                    { value: 'ARCHIVED', label: 'Status: Archived Plots' },
                    { value: 'ALL', label: 'Status: All Records' }
                  ]}
                />
              </div>
            </div>
          </div>

          {/* Fields Table */}
          <Table
            columns={fieldColumns}
            data={paginatedFields}
            isLoading={fieldsState.isLoading}
            error={fieldsState.error}
            onRowClick={(row) => setDetailField(row)}
            emptyMessage={
              isFarmManager
                ? 'No member field plots registered in your assigned block farm.'
                : 'No registered field plots match the filter criteria.'
            }
            emptySubtext={
              isFarmManager
                ? 'Click "Add Field" to enroll Farm Members and field coordinates.'
                : 'Enrolled parcels will display here once registered by farm managers.'
            }
            currentPage={fieldCurrentPage}
            totalPages={totalFieldPages}
            totalItems={filteredFields.length}
            onPageChange={setFieldCurrentPage}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Block Farm Filter & Search Controls */}
          <div className="bg-surface border border-border/80 rounded-2xl p-4 shadow-2xs">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
              <div className="sm:col-span-8 min-w-0">
                <Input
                  value={blockSearchQuery}
                  onChange={(e) => {
                    setBlockSearchQuery(e.target.value);
                    setBlockCurrentPage(1);
                  }}
                  placeholder="Search by Block Farm Code, Entity Name, Location, or Manager..."
                  icon={Search}
                  className="w-full"
                />
              </div>

              <div className="sm:col-span-4 min-w-0">
                <Select
                  value={blockStatusFilter}
                  onChange={(e) => {
                    setBlockStatusFilter(e.target.value);
                    setBlockCurrentPage(1);
                  }}
                  options={[
                    { value: 'ACTIVE', label: 'Status: Active Only' },
                    { value: 'ALL', label: 'Status: All Records' }
                  ]}
                />
              </div>
            </div>
          </div>

          {/* Block Farms Table */}
          <Table
            columns={blockColumns}
            data={paginatedBlockFarms}
            isLoading={blockFarmsState.isLoading}
            error={blockFarmsState.error}
            onRowClick={(row) => {
              if (isSraAdmin) {
                setEditingBlockFarm(row);
                setBlockFarmModalOpen(true);
              } else {
                setInspectBlockFarm(row);
              }
            }}
            emptyMessage="No block farm records match the filter criteria."
            emptySubtext="District cooperative block farms will appear here with certified landholdings."
            currentPage={blockCurrentPage}
            totalPages={totalBlockPages}
            totalItems={filteredBlockFarms.length}
            onPageChange={setBlockCurrentPage}
          />
        </div>
      )}

      {/* 5. Modals */}

      {/* Farm Manager: Field Enrollment Modal */}
      {isFarmManager && (
        <FieldEnrollmentModal
          isOpen={enrollFieldModalOpen}
          onClose={() => setEnrollFieldModalOpen(false)}
          blockFarms={assignedBlockFarm ? [assignedBlockFarm] : fieldsState.blockFarms}
          memberUsers={fieldsState.memberUsers}
          defaultBlockFarmId={assignedBlockFarm?.id || user?.blockFarmId || ''}
          onSuccess={() => {}}
        />
      )}

      {/* Farm Manager: Field Edit Modal */}
      {isFarmManager && (
        <FieldEditModal
          isOpen={Boolean(editField)}
          onClose={() => setEditField(null)}
          field={editField}
          blockFarms={assignedBlockFarm ? [assignedBlockFarm] : fieldsState.blockFarms}
          memberUsers={fieldsState.memberUsers}
          onSuccess={() => {}}
        />
      )}

      {/* SRA Admin: Block Farm Create/Edit Modal */}
      {isSraAdmin && (
        <BlockFarmModal
          isOpen={blockFarmModalOpen}
          onClose={() => {
            setBlockFarmModalOpen(false);
            setEditingBlockFarm(null);
          }}
          farm={editingBlockFarm}
          farmManagers={blockFarmsState.farmManagers}
        />
      )}

      {/* Read-Only Field Inspection Modal */}
      <FieldDetailModal
        isOpen={Boolean(detailField)}
        onClose={() => setDetailField(null)}
        field={detailField}
        cropCycles={(fieldsState.cropCycles || []).filter(cycle => cycle.fieldId === detailField?.id)}
        isManager={isFarmManager}
        onEdit={isFarmManager ? (f) => setEditField(f) : undefined}
      />

      {/* Read-Only Block Farm Inspection Modal (Super Admin / SRA inspect) */}
      <Modal
        isOpen={Boolean(inspectBlockFarm)}
        onClose={() => setInspectBlockFarm(null)}
        title={`Block Farm Overview: ${inspectBlockFarm?.code || inspectBlockFarm?.id || ''}`}
        maxWidth="max-w-lg"
      >
        {inspectBlockFarm && (
          <div className="space-y-4 pt-2">
            <div className="p-3 bg-surface-subtle border border-border/80 rounded-xl space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-primary dark:text-primary-light">
                  {inspectBlockFarm.code || inspectBlockFarm.id}
                </span>
                <StatusBadge status={inspectBlockFarm.status || 'ACTIVE'} />
              </div>
              <h3 className="text-base font-black text-hug-text">{inspectBlockFarm.name}</h3>
              {inspectBlockFarm.location && (
                <p className="text-xs text-hug-muted flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 shrink-0 text-hug-muted" />
                  <span>{inspectBlockFarm.location}</span>
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-surface border border-border/80 rounded-xl">
                <span className="text-[10px] font-bold text-hug-muted uppercase tracking-wider block mb-1">
                  Declared Area
                </span>
                <span className="font-bold text-sm text-hug-text">
                  {formatHectares(inspectBlockFarm.declaredAreaHa ?? inspectBlockFarm.declaredHa ?? 0)}
                </span>
              </div>

              <div className="p-3 bg-surface border border-border/80 rounded-xl">
                <span className="text-[10px] font-bold text-hug-muted uppercase tracking-wider block mb-1">
                  Enrolled Plots
                </span>
                <span className="font-bold text-sm text-hug-text">
                  {blockFarmsState.fields.filter(f => f.blockFarmId === inspectBlockFarm.id).length} plots
                </span>
              </div>
            </div>

            <div className="p-3 bg-surface border border-border/80 rounded-xl text-xs space-y-1">
              <span className="text-[10px] font-bold text-hug-muted uppercase tracking-wider block">
                Assigned Farm Manager
              </span>
              <p className="font-bold text-hug-text">
                {(() => {
                  const mgr = blockFarmsState.farmManagers?.find(
                    u => u.id === inspectBlockFarm.managerUserId || u.employeeId === inspectBlockFarm.managerUserId
                  );
                  return mgr?.displayName || mgr?.name || inspectBlockFarm.managerUserId || 'Unassigned';
                })()}
              </p>
            </div>

            <div className="flex justify-end pt-3 border-t border-border/80">
              <Button variant="secondary" size="md" onClick={() => setInspectBlockFarm(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Farm Manager: Archive Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(archiveTarget)}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={handleArchiveConfirm}
        isLoading={isArchiving}
        loadingText="Archiving Field..."
        title={`Archive field plot ${archiveTarget?.id}?`}
        message="This field parcel will be archived. All associated active Crop Year Cycles and historical operation records will remain preserved in compliance audit ledgers."
        confirmText="Archive Plot"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  );
}
