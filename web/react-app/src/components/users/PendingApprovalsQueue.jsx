import React, { useState } from 'react';
import { UserCheck, CheckCircle2, Clock, Phone, MapPin, AlertCircle, Check, X } from 'lucide-react';
import Button from '../ui/Button';

export default function PendingApprovalsQueue({
  pendingUsers = [],
  blockFarms = [],
  onApproveUser,
  onRejectUser,
  className = ''
}) {
  const [processingId, setProcessingId] = useState(null);

  const farmMap = new Map(blockFarms.map(f => [f.id, f.name || f.id]));

  if (pendingUsers.length === 0) {
    return (
      <div className={`bg-white dark:bg-surface rounded-2xl border border-border p-6 shadow-xs text-center text-xs text-hug-muted ${className}`}>
        <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
        <h4 className="text-sm font-bold text-hug-text">No Pending Registrations</h4>
        <p className="mt-0.5">All cooperative member and personnel onboarding requests have been reviewed.</p>
      </div>
    );
  }

  const handleApprove = async (user) => {
    setProcessingId(user.id);
    try {
      await onApproveUser(user);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (user) => {
    setProcessingId(user.id);
    try {
      await onRejectUser(user);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className={`bg-white dark:bg-surface rounded-2xl border border-border shadow-xs overflow-hidden ${className}`}>
      <div className="p-4 sm:p-5 border-b border-border/80 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-hug-text flex items-center gap-2">
            <span>Pending Registration Queue</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60">
              {pendingUsers.length} awaiting review
            </span>
          </h3>
          <p className="text-xs text-hug-muted mt-0.5">
            Review onboarding applicant credentials before granting cooperative database access.
          </p>
        </div>
      </div>

      <div className="divide-y divide-border/50">
        {pendingUsers.map((p) => {
          const farmName = farmMap.get(p.requestedBlockFarmId) || p.requestedBlockFarmId || 'Unassigned Farm';
          const isProcessing = processingId === p.id;

          return (
            <div
              key={p.id}
              className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-bg/30 transition-colors"
            >
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-bold text-hug-text">
                    {p.displayName || p.name}
                  </h4>
                  <span className="font-mono text-xs font-semibold text-primary dark:text-primary-light bg-primary-bg/50 px-1.5 py-0.2 rounded">
                    {p.id}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-bg dark:bg-gray-800 text-hug-text border border-border">
                    {p.role || p.canonicalRole || 'Member Farmer'}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-hug-muted mt-1.5 flex-wrap">
                  <span className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-hug-muted" />
                    {p.phone}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-hug-muted" />
                    Applied Farm: <strong className="text-hug-text font-semibold">{farmName}</strong>
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1 font-mono">
                    <Clock className="w-3.5 h-3.5 text-hug-muted" />
                    {p.createdAt ? p.createdAt.slice(0, 10) : 'Recent'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleReject(p)}
                  disabled={isProcessing}
                  icon={X}
                >
                  Decline
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleApprove(p)}
                  isLoading={isProcessing}
                  icon={Check}
                >
                  Approve Application
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
