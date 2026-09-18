import React, { useState, useMemo } from 'react';
import { Search, User, CheckCircle2, AlertCircle, Edit2, ShieldAlert, ShieldCheck, ChevronLeft, ChevronRight, Phone } from 'lucide-react';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';

export default function UserTable({
  users = [],
  blockFarms = [],
  fields = [],
  isLoading = false,
  currentUser = null,
  onEditUser,
  onToggleStatus,
  className = ''
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const actorRole = String(currentUser?.role || currentUser?.roleKey || '').toUpperCase().replace(/ /g, '_');
  const isSuperAdmin = actorRole === 'SUPER_ADMIN';
  const isSraAdmin = actorRole === 'SRA_ADMIN';
  const isFarmManager = actorRole === 'FARM_MANAGER';

  // Map of block farms by id and manager
  const farmMap = useMemo(() => new Map(blockFarms.map(f => [f.id, f])), [blockFarms]);
  const farmByManagerMap = useMemo(() => new Map(blockFarms.map(f => [f.managerUserId, f])), [blockFarms]);

  // Map of fields by member
  const fieldsByMemberMap = useMemo(() => {
    const map = new Map();
    fields.forEach(f => {
      if (f.memberUserId) {
        const existing = map.get(f.memberUserId) || [];
        existing.push(f);
        map.set(f.memberUserId, existing);
      }
    });
    return map;
  }, [fields]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    let result = [...users];

    if (roleFilter !== 'ALL') {
      result = result.filter(u => u.canonicalRole === roleFilter);
    }

    if (statusFilter !== 'ALL') {
      result = result.filter(u => u.status === statusFilter);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(u =>
        (u.id && u.id.toLowerCase().includes(q)) ||
        (u.displayName && u.displayName.toLowerCase().includes(q)) ||
        (u.phone && u.phone.toLowerCase().includes(q)) ||
        (u.role && u.role.toLowerCase().includes(q))
      );
    }

    return result;
  }, [users, roleFilter, statusFilter, searchTerm]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const validPage = Math.min(currentPage, totalPages);
  const pagedUsers = useMemo(() => {
    const start = (validPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, validPage, pageSize]);

  // Role options for filter
  const roleOptions = [
    { value: 'ALL', label: 'All Roles' },
    { value: 'MEMBER_FARMER', label: 'Member Farmer' },
    { value: 'FARM_MANAGER', label: 'Farm Manager' },
    ...(isSuperAdmin ? [
      { value: 'SRA_ADMIN', label: 'SRA Admin' },
      { value: 'SUPER_ADMIN', label: 'Super Admin' }
    ] : isSraAdmin ? [
      { value: 'SRA_ADMIN', label: 'SRA Admin' }
    ] : [])
  ];

  const statusOptions = [
    { value: 'ALL', label: 'All Statuses' },
    { value: 'ACTIVE', label: 'Active Accounts' },
    { value: 'DISABLED', label: 'Disabled Accounts' }
  ];

  // Role badge styles
  const getRoleBadgeClass = (canonicalRole) => {
    switch (canonicalRole) {
      case 'SUPER_ADMIN':
        return 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200 dark:border-purple-800/60';
      case 'SRA_ADMIN':
        return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60';
      case 'FARM_MANAGER':
        return 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800/60';
      default:
        return 'bg-bg text-hug-text dark:bg-gray-800 border-border';
    }
  };

  // Check if current user can edit a given user
  const canEditUser = (target) => {
    if (isSuperAdmin) return true;
    if (isSraAdmin) return target.canonicalRole === 'FARM_MANAGER' || target.canonicalRole === 'MEMBER_FARMER';
    if (isFarmManager) return target.canonicalRole === 'MEMBER_FARMER';
    return false;
  };

  // Check if current user can revoke/toggle a given user
  const canToggleUser = (target) => {
    if (target.id === currentUser?.id || target.id === currentUser?.employeeId) return false;
    if (isSuperAdmin) return target.canonicalRole !== 'SUPER_ADMIN';
    if (isSraAdmin) return target.canonicalRole === 'FARM_MANAGER' || target.canonicalRole === 'MEMBER_FARMER';
    if (isFarmManager) return target.canonicalRole === 'MEMBER_FARMER';
    return false;
  };

  return (
    <div className={`bg-white dark:bg-surface rounded-2xl border border-border shadow-xs overflow-hidden ${className}`}>
      {/* Header & Filter Controls */}
      <div className="p-4 sm:p-5 border-b border-border/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-hug-text flex items-center gap-2">
            <span>Personnel & Member Directory</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-bg dark:bg-gray-800 text-hug-muted border border-border">
              {filteredUsers.length} accounts
            </span>
          </h3>
          <p className="text-xs text-hug-muted mt-0.5">
            Authorized HUGPONG personnel, managers, and registered member farmers.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="w-full sm:w-52">
            <Input
              type="text"
              placeholder="Search by name, ID, phone..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              icon={Search}
            />
          </div>

          <div className="w-full sm:w-40">
            <Select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setCurrentPage(1);
              }}
              options={roleOptions}
            />
          </div>

          <div className="w-full sm:w-36">
            <Select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              options={statusOptions}
            />
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-bg/60 dark:bg-[#0C1015]/60 border-b border-border/80 text-hug-muted font-bold text-xs uppercase tracking-wider">
              <th scope="col" className="px-4 py-3.5">User ID</th>
              <th scope="col" className="px-4 py-3.5">Personnel / Member</th>
              <th scope="col" className="px-4 py-3.5">Role</th>
              <th scope="col" className="px-4 py-3.5">Assigned Block Farm / Plot</th>
              <th scope="col" className="px-4 py-3.5">Status</th>
              <th scope="col" className="px-4 py-3.5 text-right">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border/50 text-hug-text">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, idx) => (
                <tr key={idx} className="animate-pulse">
                  <td className="px-4 py-4"><div className="h-4 w-16 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                  <td className="px-4 py-4"><div className="h-4 w-32 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                  <td className="px-4 py-4"><div className="h-4 w-20 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                  <td className="px-4 py-4"><div className="h-4 w-28 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                  <td className="px-4 py-4"><div className="h-4 w-16 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                  <td className="px-4 py-4 text-right"><div className="h-4 w-12 bg-gray-200 dark:bg-gray-800 rounded ml-auto" /></td>
                </tr>
              ))
            ) : pagedUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 px-4 text-hug-muted text-xs">
                  <User className="w-8 h-8 mx-auto text-hug-muted/50 mb-2" />
                  <p className="font-semibold text-hug-text text-sm">No accounts found</p>
                  <p className="text-xs text-hug-muted mt-0.5">
                    {searchTerm ? 'No accounts matched your search terms.' : 'Registered users will appear here once provisioned.'}
                  </p>
                </td>
              </tr>
            ) : (
              pagedUsers.map((u) => {
                const isUserActive = u.status === 'ACTIVE';
                const canEdit = canEditUser(u);
                const canToggle = canToggleUser(u);

                // Compute farm and plot details
                let farmPlotDisplay = 'Unassigned';
                if (u.canonicalRole === 'SUPER_ADMIN') {
                  farmPlotDisplay = 'Central District Oversight';
                } else if (u.canonicalRole === 'SRA_ADMIN') {
                  farmPlotDisplay = 'SRA Regulatory Oversight';
                } else if (u.canonicalRole === 'FARM_MANAGER') {
                  const farm = farmByManagerMap.get(u.id) || farmMap.get(u.blockFarmId);
                  farmPlotDisplay = farm ? `${farm.name} (Manager)` : 'Unassigned Farm';
                } else {
                  // Member Farmer: lookup fields
                  const userFields = fieldsByMemberMap.get(u.id) || [];
                  if (userFields.length > 0) {
                    const farmId = userFields[0].blockFarmId;
                    const farm = farmMap.get(farmId);
                    const farmName = farm?.name || farmId || 'Block Farm';
                    const plotsStr = userFields.map(f => f.id).join(', ');
                    farmPlotDisplay = `${farmName} · ${plotsStr}`;
                  } else {
                    farmPlotDisplay = u.blockFarmName || 'Unassigned';
                  }
                }

                return (
                  <tr key={u.id} className="hover:bg-bg/40 dark:hover:bg-gray-800/30 transition-colors">
                    {/* User ID */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="font-mono text-xs font-bold text-primary dark:text-primary-light bg-primary-bg/50 dark:bg-primary/20 px-2 py-0.5 rounded border border-primary/20">
                        {u.id}
                      </span>
                    </td>

                    {/* Personnel / Member Name & Contact */}
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-hug-text text-sm">
                        {u.displayName || u.name}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-hug-muted mt-0.5">
                        <Phone className="w-3 h-3 text-hug-muted" />
                        <span>{u.phone || 'No mobile linked'}</span>
                        {u.phone && (
                          u.phoneVerified ? (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
                              <CheckCircle2 className="w-2.5 h-2.5" /> Verified
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-semibold text-hug-muted border border-border">
                              Unverified
                            </span>
                          )
                        )}
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${getRoleBadgeClass(u.canonicalRole)}`}>
                        {u.role || u.canonicalRole}
                      </span>
                    </td>

                    {/* Block Farm / Plot */}
                    <td className="px-4 py-3.5 text-xs text-hug-text2 max-w-[220px] truncate" title={farmPlotDisplay}>
                      {farmPlotDisplay}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {isUserActive ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
                          <CheckCircle2 className="w-3 h-3" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-danger-bg text-danger border border-danger/20">
                          <AlertCircle className="w-3 h-3" /> Disabled
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => onEditUser(u)}
                            className="p-1.5 text-hug-muted hover:text-primary hover:bg-primary-bg/30 rounded-lg transition-colors cursor-pointer"
                            title="Edit Personnel Profile"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {canToggle && (
                          <button
                            type="button"
                            onClick={() => onToggleStatus(u)}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              isUserActive
                                ? 'text-hug-muted hover:text-danger hover:bg-danger-bg/40'
                                : 'text-hug-muted hover:text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={isUserActive ? 'Disable User Access' : 'Reactivate User Access'}
                          >
                            {isUserActive ? (
                              <ShieldAlert className="w-3.5 h-3.5" />
                            ) : (
                              <ShieldCheck className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}

                        {!canEdit && !canToggle && (
                          <span className="text-[10px] text-hug-muted italic px-2">Read Only</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="px-4 sm:px-5 py-3 border-t border-border/80 flex items-center justify-between gap-3 text-xs">
          <span className="text-hug-muted font-medium">
            Showing {(validPage - 1) * pageSize + 1} to{' '}
            {Math.min(validPage * pageSize, filteredUsers.length)} of {filteredUsers.length} accounts
          </span>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={validPage === 1}
              icon={ChevronLeft}
            >
              Prev
            </Button>

            <span className="px-2 py-1 font-semibold text-hug-text">
              {validPage} / {totalPages}
            </span>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={validPage === totalPages}
              icon={ChevronRight}
              iconPosition="right"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
