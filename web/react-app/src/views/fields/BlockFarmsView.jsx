import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ROLE_KEYS } from '../../utils/authRouting';
import { subscribeToBlockFarmsData } from '../../services/blockFarmsService';
import CompactDashboardHeader from '../../components/dashboard/CompactDashboardHeader';
import {
  Table,
  TablePagination,
  Input,
  Select,
  Button,
  StatusBadge
} from '../../components/ui';
import BlockFarmModal from '../../components/fields/BlockFarmModal';
import { formatHectares } from '../../utils/formatters';
import {
  Building2,
  Plus,
  Search,
  Filter,
  Layers,
  MapPin,
  Users,
  Edit3,
  ArrowRight,
  ShieldAlert,
  AlertCircle
} from 'lucide-react';

export default function BlockFarmsView() {
  const { user, roleKey } = useAuth();
  const navigate = useNavigate();

  const isSraAdmin = roleKey === ROLE_KEYS.SRA_ADMIN;
  const isAuthorized = isSraAdmin;

  // Real-time block farms data state
  const [data, setData] = useState({
    blockFarms: [],
    fields: [],
    farmManagers: [],
    isLoading: true,
    error: null
  });

  // Filter & Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingFarm, setEditingFarm] = useState(null);

  // Subscribe to real-time block farms telemetry
  useEffect(() => {
    let active = true;

    const unsubscribe = subscribeToBlockFarmsData({
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
  }, [user]);

  // Filter block farms
  const filteredFarms = useMemo(() => {
    return data.blockFarms.filter(bf => {
      // Status filter
      if (statusFilter !== 'ALL' && (bf.status || 'ACTIVE').toUpperCase() !== statusFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const idMatch = (bf.id || '').toLowerCase().includes(q);
        const codeMatch = (bf.code || '').toLowerCase().includes(q);
        const nameMatch = (bf.name || '').toLowerCase().includes(q);
        const locMatch = (bf.location || '').toLowerCase().includes(q);
        const mgrMatch = (bf.managerUserId || '').toLowerCase().includes(q);
        return idMatch || codeMatch || nameMatch || locMatch || mgrMatch;
      }

      return true;
    });
  }, [data.blockFarms, statusFilter, searchQuery]);

  // Paginated slice
  const paginatedFarms = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredFarms.slice(start, start + pageSize);
  }, [filteredFarms, currentPage]);

  const totalPages = Math.max(1, Math.ceil(filteredFarms.length / pageSize));

  // Summary Metrics
  const totalDeclaredArea = useMemo(() => {
    return filteredFarms.reduce((sum, bf) => sum + Number(bf.declaredAreaHa ?? bf.declaredHa ?? 0), 0);
  }, [filteredFarms]);

  const totalAssignedManagers = useMemo(() => {
    const managerIds = new Set(filteredFarms.map(bf => bf.managerUserId).filter(Boolean));
    return managerIds.size;
  }, [filteredFarms]);

  const totalEnrolledPlots = useMemo(() => {
    const farmIds = new Set(filteredFarms.map(f => f.id));
    return data.fields.filter(f => farmIds.has(f.blockFarmId)).length;
  }, [filteredFarms, data.fields]);

  // If unauthorized (e.g. Farm Manager navigating directly), present access guidance
  if (!isAuthorized) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-hug-text">Access Restricted</h2>
        <p className="text-sm text-hug-muted leading-relaxed">
          The Block Farm Registry is reserved for SRA Administrators overseeing district-level cooperative jurisdictions.
        </p>
        <Button variant="primary" size="md" onClick={() => navigate('/fields')}>
          Return to Field Plot Registry
        </Button>
      </div>
    );
  }

  // Header Actions (HUGPONG green)
  const headerActions = [
    {
      label: 'Register Block Farm',
      icon: Plus,
      variant: 'primary',
      onClick: () => {
        setEditingFarm(null);
        setModalOpen(true);
      }
    }
  ];

  // Table Columns
  const columns = [
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
        const mgr = data.farmManagers?.find(u => u.id === row.managerUserId || u.employeeId === row.managerUserId);
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
      header: 'Enrolled Member Plots',
      width: '180px',
      render: (_, row) => {
        const farmPlots = data.fields.filter(f => f.blockFarmId === row.id);
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
      width: '100px',
      render: (val) => <StatusBadge status={val || 'ACTIVE'} />
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      width: '170px',
      render: (_, row) => (
        <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => {
              setEditingFarm(row);
              setModalOpen(true);
            }}
            title="Edit Block Farm Parameters"
            className="p-1.5 rounded-lg text-hug-muted hover:text-hug-text hover:bg-surface-subtle transition-colors cursor-pointer"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => navigate(`/fields?farmId=${encodeURIComponent(row.id)}`)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-primary dark:text-primary-light hover:bg-primary-bg dark:hover:bg-primary/20 flex items-center gap-1 transition-colors cursor-pointer"
            title="View member plots enrolled under this block farm"
          >
            <span>View Plots</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Authoritative Page Header */}
      <CompactDashboardHeader
        category="District Cooperative Oversight"
        badge="Block Farm Entities"
        title="Block Farm Registry"
        subtitle={`District Cooperative Jurisdictions · ${filteredFarms.length} registered block farms (${formatHectares(totalDeclaredArea)} declared)`}
        actions={headerActions}
      />

      {/* 2. Top Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-surface border border-border/80 rounded-2xl p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between text-hug-muted mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Registered Farms</span>
            <Building2 className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-black text-hug-text tracking-tight">
            {data.blockFarms.length}
          </div>
          <p className="text-[11px] text-hug-muted mt-0.5">District block farm entities</p>
        </div>

        <div className="bg-surface border border-border/80 rounded-2xl p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between text-hug-muted mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Declared Area</span>
            <MapPin className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-hug-text tracking-tight">
            {formatHectares(totalDeclaredArea)}
          </div>
          <p className="text-[11px] text-hug-muted mt-0.5">Total cooperative acreage</p>
        </div>

        <div className="bg-surface border border-border/80 rounded-2xl p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between text-hug-muted mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Enrolled Plots</span>
            <Layers className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-hug-text tracking-tight">
            {totalEnrolledPlots}
          </div>
          <p className="text-[11px] text-hug-muted mt-0.5">Member parcels linked</p>
        </div>

        <div className="bg-surface border border-border/80 rounded-2xl p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between text-hug-muted mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Assigned Managers</span>
            <Users className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-black text-hug-text tracking-tight">
            {totalAssignedManagers}
          </div>
          <p className="text-[11px] text-hug-muted mt-0.5">Supervising personnel</p>
        </div>
      </div>

      {/* Error Notice */}
      {data.error && (
        <div className="p-4 bg-danger-bg/40 border border-danger/30 rounded-2xl flex items-start gap-3 text-xs sm:text-sm font-semibold text-danger">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Error loading block farm registry</p>
            <p className="text-xs text-danger/80 mt-0.5">{data.error}</p>
          </div>
        </div>
      )}

      {/* 3. Controls & Filter Bar */}
      <div className="bg-surface border border-border/80 rounded-2xl p-4 sm:p-5 shadow-2xs">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4 items-center">
          <div className="md:col-span-8">
            <Input
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by Block Farm Code, Name, Location, or Manager..."
              icon={Search}
              className="w-full"
            />
          </div>

          <div className="md:col-span-4">
            <Select
              value={statusFilter}
              onChange={e => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ACTIVE">Status: Active Only</option>
              <option value="ALL">Status: All Records</option>
            </Select>
          </div>
        </div>
      </div>

      {/* 4. Block Farm Table */}
      <Table
        columns={columns}
        data={paginatedFarms}
        isLoading={data.isLoading}
        emptyMessage="No block farms match the current filter criteria."
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filteredFarms.length}
        onPageChange={setCurrentPage}
      />

      {/* 5. Register / Edit Block Farm Modal */}
      <BlockFarmModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingFarm(null);
        }}
        farm={editingFarm}
        farmManagers={data.farmManagers}
      />
    </div>
  );
}
