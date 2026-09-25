import React, { useState, useEffect, useMemo } from 'react';
import { Users, UserPlus, ShieldCheck, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { subscribeToUsersData, toggleUserStatus, approveOrProvisionUser, updateUser } from '../../services/usersService';
import { subscribeToFieldsData } from '../../services/fieldsService';
import UserTable from '../../components/users/UserTable';
import PendingApprovalsQueue from '../../components/users/PendingApprovalsQueue';
import UserFormModal from '../../components/users/UserFormModal';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

export default function UsersView() {
  const { user } = useAuth();
  const actorRole = String(user?.role || user?.roleKey || '').toUpperCase().replace(/ /g, '_');
  const isSuperAdmin = actorRole === 'SUPER_ADMIN';
  const isSraAdmin = actorRole === 'SRA_ADMIN';
  const isFarmManager = actorRole === 'FARM_MANAGER';

  // Data states
  const [users, setUsers] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [blockFarms, setBlockFarms] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Tab State: 'directory' | 'pending'
  const [activeTab, setActiveTab] = useState('directory');

  // Modal & Dialog States
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState(null);

  const [toggleConfirmTarget, setToggleConfirmTarget] = useState(null);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  // Subscriptions
  useEffect(() => {
    setIsLoading(true);
    const unsubUsers = subscribeToUsersData({
      user,
      onUpdate: (data) => {
        setUsers(data.users || []);
        setPendingUsers(data.pendingUsers || []);
        setIsLoading(data.isLoading);
        setError(data.error);
      },
      onError: (err) => {
        setError(err.message || 'Failed to load users.');
        setIsLoading(false);
      }
    });

    const unsubFields = subscribeToFieldsData({
      user,
      onUpdate: (data) => {
        setBlockFarms(data.blockFarms || []);
      }
    });

    return () => {
      if (typeof unsubUsers === 'function') unsubUsers();
      if (typeof unsubFields === 'function') unsubFields();
    };
  }, [user]);

  // Handle Edit User
  const handleEditUser = (targetUser) => {
    setSelectedUserForEdit(targetUser);
    setIsFormModalOpen(true);
  };

  // Handle Open Create User Modal
  const handleOpenCreate = () => {
    setSelectedUserForEdit(null);
    setIsFormModalOpen(true);
  };

  // Handle Toggle Status (Confirm Dialog)
  const handleInitiateToggle = (targetUser) => {
    setToggleConfirmTarget(targetUser);
  };

  const handleConfirmToggle = async () => {
    if (!toggleConfirmTarget) return;
    setIsTogglingStatus(true);
    try {
      await toggleUserStatus(toggleConfirmTarget.id, toggleConfirmTarget.status);
      setToggleConfirmTarget(null);
    } catch (err) {
      alert(`Failed to update account status: ${err.message}`);
    } finally {
      setIsTogglingStatus(false);
    }
  };

  // Handle Approve Pending User
  const handleApprovePending = async (pendingUser) => {
    return approveOrProvisionUser({
      id: pendingUser.id,
      role: pendingUser.canonicalRole || 'MEMBER_FARMER'
    });
  };

  // Handle Reject Pending User
  const handleRejectPending = async (pendingUser) => {
    return toggleUserStatus(pendingUser.id, 'ACTIVE'); // Disables or dismisses
  };

  // Dynamic titles based on role
  const getHeaderMeta = () => {
    if (isFarmManager) {
      return {
        badge: 'Cooperative Management',
        title: 'Farm Member Directory',
        subtitle: 'Manage and onboard registered cooperative Farm Members and field allocations.'
      };
    } else if (isSraAdmin) {
      return {
        badge: 'SRA Supervision',
        title: 'District Personnel & Farm Manager Directory',
        subtitle: 'Regulatory oversight of Farm Managers and cooperative personnel across district Block Farms.'
      };
    } else {
      return {
        badge: 'Central Administration',
        title: 'System User & Credentials Directory',
        subtitle: 'Global personnel directory across Super Admin, SRA Admin, Farm Managers, and Farm Members.'
      };
    }
  };

  const meta = getHeaderMeta();

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-primary dark:text-primary-light uppercase tracking-wider">
              {meta.badge}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light">
              Authoritative Directory
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-hug-text tracking-tight mt-1">
            {meta.title}
          </h1>
          <p className="text-xs sm:text-sm text-hug-muted mt-1 max-w-2xl">
            {meta.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="primary"
            size="md"
            onClick={handleOpenCreate}
            icon={UserPlus}
          >
            {isFarmManager ? 'Onboard Farm Member' : 'Provision Personnel'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-danger-bg/40 border border-danger/30 rounded-2xl flex items-start gap-3 text-xs sm:text-sm font-semibold text-danger">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Error loading user records</p>
            <p className="text-xs text-danger/80 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/80 pb-2.5">
        <button
          type="button"
          onClick={() => setActiveTab('directory')}
          className={`px-4.5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
            activeTab === 'directory'
              ? 'bg-primary text-white shadow-xs'
              : 'text-hug-muted hover:text-hug-text hover:bg-bg dark:hover:bg-gray-800'
          }`}
        >
          Active Personnel ({users.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`px-4.5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'pending'
              ? 'bg-primary text-white shadow-xs'
              : 'text-hug-muted hover:text-hug-text hover:bg-bg dark:hover:bg-gray-800'
          }`}
        >
          <span>Pending Applications</span>
          {pendingUsers.length > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
              activeTab === 'pending'
                ? 'bg-white text-primary'
                : 'bg-amber-500 text-white'
            }`}>
              {pendingUsers.length}
            </span>
          )}
        </button>
      </div>

      {/* Active Tab Content */}
      {activeTab === 'directory' ? (
        <UserTable
          users={users}
          isLoading={isLoading}
          currentUser={user}
          onEditUser={handleEditUser}
          onToggleStatus={handleInitiateToggle}
        />
      ) : (
        <PendingApprovalsQueue
          pendingUsers={pendingUsers}
          blockFarms={blockFarms}
          onApproveUser={handleApprovePending}
          onRejectUser={handleRejectPending}
        />
      )}

      {/* Provisioning / Editing Modal */}
      <UserFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setSelectedUserForEdit(null);
        }}
        initialUser={selectedUserForEdit}
        currentUser={user}
        blockFarms={blockFarms}
        onSaved={() => {
          // Firestore snapshot / API auto-refreshes state
        }}
      />

      {/* Toggle Account Status Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(toggleConfirmTarget)}
        title={toggleConfirmTarget?.status === 'ACTIVE' ? 'Disable User Access?' : 'Reactivate User Account?'}
        description={
          toggleConfirmTarget?.status === 'ACTIVE'
            ? `Are you sure you want to disable access for ${toggleConfirmTarget?.displayName || toggleConfirmTarget?.name} (${toggleConfirmTarget?.id})? The user will immediately be blocked from logging in.`
            : `Reactivate login access for ${toggleConfirmTarget?.displayName || toggleConfirmTarget?.name} (${toggleConfirmTarget?.id})?`
        }
        confirmText={toggleConfirmTarget?.status === 'ACTIVE' ? 'Disable Account' : 'Reactivate'}
        cancelText="Cancel"
        variant={toggleConfirmTarget?.status === 'ACTIVE' ? 'danger' : 'primary'}
        isLoading={isTogglingStatus}
        onConfirm={handleConfirmToggle}
        onCancel={() => setToggleConfirmTarget(null)}
      />
    </div>
  );
}
