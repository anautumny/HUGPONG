import React, { useState, useMemo } from 'react';
import { UserCheck, CheckCircle2, Clock, Phone, MapPin, AlertCircle, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import Button from '../ui/Button';
import {
  DEFAULT_PHONE_VERIFICATION_REASON,
  PHONE_VERIFICATION_REASONS,
  isOtherPhoneVerificationReason
} from '../../domain/phoneVerification';

export default function PendingApprovalsQueue({
  pendingUsers = [],
  blockFarms = [],
  onApproveUser,
  currentUser = null,
  className = ''
}) {
  const [processingId, setProcessingId] = useState(null);
  const [processingAction, setProcessingAction] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [farmSelections, setFarmSelections] = useState({});
  const [verificationReasonCodes, setVerificationReasonCodes] = useState({});
  const [verificationReasonDetails, setVerificationReasonDetails] = useState({});
  const [verificationDecisions, setVerificationDecisions] = useState({});
  const [actionError, setActionError] = useState(null);
  const pageSize = 8;

  const farmMap = new Map(blockFarms.map(f => [f.id, f.name || f.id]));
  const actorRole = String(currentUser?.canonicalRole || currentUser?.roleKey || currentUser?.role || '')
    .trim().toUpperCase().replace(/ /g, '_');

  const canVerifyUser = (target) => {
    const targetRole = String(target?.canonicalRole || target?.role || 'MEMBER_FARMER').trim().toUpperCase().replace(/ /g, '_');
    if (String(target?.id || '') === String(currentUser?.id || currentUser?.employeeId || '')) return false;
    if (actorRole === 'SUPER_ADMIN') return true;
    if (actorRole === 'SRA_ADMIN') return ['MEMBER_FARMER', 'FARM_MANAGER'].includes(targetRole);
    if (actorRole !== 'FARM_MANAGER' || targetRole !== 'MEMBER_FARMER') return false;
    return Boolean(target?.requestedBlockFarmId || target?.affiliatedBlockFarmId || target?.assignment?.blockFarmId);
  };

  const totalPages = Math.max(1, Math.ceil(pendingUsers.length / pageSize));
  const validPage = Math.min(currentPage, totalPages);
  const pagedUsers = useMemo(() => {
    const start = (validPage - 1) * pageSize;
    return pendingUsers.slice(start, start + pageSize);
  }, [pendingUsers, validPage, pageSize]);

  if (pendingUsers.length === 0) {
    return (
      <div className={`bg-white dark:bg-surface rounded-2xl border border-border p-6 shadow-xs text-center text-xs text-hug-muted ${className}`}>
        <CheckCircle2 className="w-8 h-8 text-success mx-auto mb-2 opacity-80" />
        <h4 className="text-sm font-bold text-hug-text">No Pending Users</h4>
        <p className="mt-0.5">All account approvals and phone-verification requests in your scope have been reviewed.</p>
      </div>
    );
  }

  const handleApprove = async (user) => {
    const selectedFarmId = farmSelections[user.id] ?? user.requestedBlockFarmId ?? '';
    const isPendingRegistration = user.status === 'PENDING';
    const targetRole = user.canonicalRole || 'MEMBER_FARMER';
    const acceptUserNow = verificationDecisions[user.id] !== 'LATER';
    if (isPendingRegistration && acceptUserNow && ['MEMBER_FARMER', 'FARM_MANAGER'].includes(targetRole) && !selectedFarmId) {
      setActionError(`Select a Block Farm before approving this ${targetRole === 'FARM_MANAGER' ? 'Farm Manager' : 'Farm Member'}.`);
      return;
    }
    const requiresPhoneVerification = !user.phoneVerified;
    const verificationReasonCode = verificationReasonCodes[user.id] || DEFAULT_PHONE_VERIFICATION_REASON;
    const verificationReasonDetail = String(verificationReasonDetails[user.id] || '').trim();
    if (requiresPhoneVerification && !canVerifyUser(user)) {
      setActionError('Your role or Block Farm assignment does not authorize this phone verification.');
      return;
    }
    if (requiresPhoneVerification && isOtherPhoneVerificationReason(verificationReasonCode) && verificationReasonDetail.length < 10) {
      setActionError('Add a reviewer comment of at least 10 characters when using another verification method.');
      return;
    }
    setProcessingId(user.id);
    setProcessingAction('approve');
    setActionError(null);
    try {
      const result = requiresPhoneVerification
        ? await onApproveUser(user, selectedFarmId, {
          verificationReasonCode,
          verificationReasonDetails: verificationReasonDetail || undefined,
          acceptUserNow
        })
        : await onApproveUser(user, selectedFarmId);
      if (!result?.success) setActionError(result?.error || 'The registration could not be approved.');
    } catch (error) {
      setActionError(error.message || 'The registration could not be approved.');
    } finally {
      setProcessingId(null);
      setProcessingAction(null);
    }
  };

  return (
    <div className={`bg-white dark:bg-surface rounded-2xl border border-border shadow-xs overflow-hidden ${className}`}>
      <div className="p-4 sm:p-5 border-b border-border/80 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-hug-text flex items-center gap-2">
            <span>Pending Users</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60">
              {pendingUsers.length} awaiting review
            </span>
          </h3>
          <p className="text-xs text-hug-muted mt-0.5">
            Review account approvals and phone numbers that could not be verified by SMS.
          </p>
        </div>
      </div>

      {actionError && (
        <div className="mx-4 mt-4 rounded-xl border border-danger/30 bg-danger-bg/40 p-3 text-xs font-semibold text-danger">
          {actionError}
        </div>
      )}

      <div className="divide-y divide-border/50">
        {pagedUsers.map((p) => {
          const farmName = farmMap.get(p.requestedBlockFarmId) || p.requestedBlockFarmId || 'Unassigned Farm';
          const isProcessing = processingId === p.id;
          const selectedFarmId = farmSelections[p.id] ?? p.requestedBlockFarmId ?? '';
          const requiresPhoneVerification = !p.phoneVerified;
          const isPendingRegistration = p.status === 'PENDING';
          const verificationReasonCode = verificationReasonCodes[p.id] || DEFAULT_PHONE_VERIFICATION_REASON;
          const verificationDetail = verificationReasonDetails[p.id] || '';
          const verificationDecision = verificationDecisions[p.id] || 'NOW';
          const canVerify = canVerifyUser(p);
          const targetRole = p.canonicalRole || 'MEMBER_FARMER';
          const requiresFarmAssignment = isPendingRegistration && ['MEMBER_FARMER', 'FARM_MANAGER'].includes(targetRole);

          return (
            <div
              key={p.id}
              className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-bg/30 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-bold text-hug-text">
                    {p.displayName || p.name}
                  </h4>
                  <span className="font-mono text-xs font-semibold text-primary dark:text-primary-light bg-primary-bg/50 px-1.5 py-0.2 rounded">
                    {p.id}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-bg dark:bg-gray-800 text-hug-text border border-border">
                    {p.role || p.canonicalRole || 'Farm Member'}
                  </span>
                </div>

                {requiresFarmAssignment && (
                  <label className="mt-3 block max-w-sm text-xs font-semibold text-hug-text">
                    Assign Block Farm {targetRole === 'FARM_MANAGER' ? 'for Management' : ''}
                    <select
                      value={selectedFarmId}
                      onChange={(event) => {
                        setFarmSelections(current => ({ ...current, [p.id]: event.target.value }));
                        setActionError(null);
                      }}
                      disabled={isProcessing}
                      className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-hug-text outline-none focus:border-primary"
                    >
                      <option value="">Select a Block Farm</option>
                      {blockFarms.filter(farm => String(farm.status || 'ACTIVE').toUpperCase() === 'ACTIVE').map(farm => (
                        <option key={farm.id} value={farm.id}>{farm.name || farm.id}</option>
                      ))}
                    </select>
                    {targetRole === 'MEMBER_FARMER' && !p.requestedBlockFarmId && (
                      <span className="mt-1 block font-normal text-amber-700">
                        The member registered without a Block Farm. Confirm the correct assignment before approval.
                      </span>
                    )}
                  </label>
                )}

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

                {requiresPhoneVerification && (
                  <div className="mt-3 max-w-xl rounded-xl border border-amber-300/70 bg-amber-50/80 dark:bg-amber-950/20 p-3">
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                      Phone not verified by SMS
                    </p>
                    {canVerify ? (
                      <div className="mt-2 text-xs font-semibold text-hug-text">
                        <label className="block">
                          Reviewer comment {isOtherPhoneVerificationReason(verificationReasonCode) ? '(required)' : '(optional)'}
                          <textarea
                            value={verificationDetail}
                            onChange={(event) => {
                              setVerificationReasonDetails(current => ({ ...current, [p.id]: event.target.value }));
                              setActionError(null);
                            }}
                            disabled={isProcessing}
                            maxLength={500}
                            rows={3}
                            placeholder="Add a short note about how you confirmed this number."
                            className="mt-1.5 w-full resize-y rounded-xl border border-border bg-surface px-3 py-2.5 text-sm font-normal text-hug-text outline-none focus:border-primary"
                          />
                        </label>
                        <fieldset className="mt-3">
                          <legend className="text-xs font-semibold text-hug-text">How did you verify the number?</legend>
                          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                            {PHONE_VERIFICATION_REASONS.map(reason => {
                              const selected = verificationReasonCode === reason.value;
                              return (
                                <button
                                  key={reason.value}
                                  type="button"
                                  disabled={isProcessing}
                                  onClick={() => {
                                    setVerificationReasonCodes(current => ({ ...current, [p.id]: reason.value }));
                                    setActionError(null);
                                  }}
                                  aria-pressed={selected}
                                  className={`rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition-colors ${selected
                                    ? 'border-primary bg-primary-bg text-primary'
                                    : 'border-border bg-surface text-hug-muted hover:border-primary/50'}`}
                                >
                                  {reason.label}
                                </button>
                              );
                            })}
                          </div>
                        </fieldset>
                        {isPendingRegistration && (
                          <div className="mt-3">
                            <span className="block text-xs font-semibold text-hug-text">After verifying the number</span>
                            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                              {[
                                { value: 'NOW', label: 'Verify and accept now' },
                                { value: 'LATER', label: 'Verify number only—accept later' }
                              ].map(option => (
                                <button
                                  key={option.value}
                                  type="button"
                                  disabled={isProcessing}
                                  onClick={() => setVerificationDecisions(current => ({ ...current, [p.id]: option.value }))}
                                  className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors ${verificationDecision === option.value
                                    ? 'border-primary bg-primary-bg text-primary'
                                    : 'border-border bg-surface text-hug-muted'}`}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        <span className="mt-1 block font-normal text-hug-muted">
                          Confirm identity and SIM ownership before verifying. This action is audited.
                        </span>
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                        Awaiting an authorized reviewer for this role and Block Farm.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleApprove(p)}
                  isLoading={isProcessing && processingAction === 'approve'}
                  disabled={isProcessing
                    || (requiresFarmAssignment && verificationDecision !== 'LATER' && !selectedFarmId)
                    || (requiresPhoneVerification && (!canVerify
                      || (isOtherPhoneVerificationReason(verificationReasonCode) && verificationDetail.trim().length < 10)))}
                  icon={Check}
                >
                  {requiresPhoneVerification
                    ? (isPendingRegistration
                      ? (verificationDecision === 'LATER' ? 'Verify Phone Only' : 'Verify & Approve')
                      : 'Verify Phone')
                    : 'Approve Application'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Footer */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-t border-border/60 bg-bg/30 dark:bg-black/10 text-xs">
        <div className="text-hug-muted font-medium">
          <span>
            Showing page <strong className="text-hug-text">{validPage}</strong> of{' '}
            <strong className="text-hug-text">{totalPages}</strong>{' '}
            <span className="text-hug-muted">({pendingUsers.length} pending)</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={validPage === 1}
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            aria-label="Previous page"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border
              text-hug-muted bg-surface hover:bg-bg hover:text-hug-text transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Prev</span>
          </button>
          <button
            type="button"
            disabled={validPage === totalPages}
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            aria-label="Next page"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border
              text-hug-muted bg-surface hover:bg-bg hover:text-hug-text transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
