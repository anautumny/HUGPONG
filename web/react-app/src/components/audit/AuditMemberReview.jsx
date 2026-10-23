import React, { useState } from 'react';
import { Phone } from 'lucide-react';
import { TablePagination } from '../ui';

export default function AuditMemberReview({ data }) {
  const members = data.memberFollowUps || [];
  const [requestedPage, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(members.length / 10));
  const page = Math.min(requestedPage, totalPages);
  return (
    <section className="space-y-3 text-sm">
      <div>
        <h3 className="font-bold text-hug-text">Review members before compiling</h3>
        <p className="mt-1 text-xs text-hug-muted">{data.periodKey} · {data.operationCount || 0} synchronized operations available.</p>
        <p className="mt-2 text-xs text-hug-muted">Call members with no recorded operations to check whether they had no work or still need to synchronize. Account inactivity is shown separately. You can continue with the available operations.</p>
      </div>
      {data.activityAvailable === false && <p role="status" className="text-xs text-amber-700">Account activity could not be loaded. The monthly operation check is still available.</p>}
      {members.length === 0 && <p className="rounded-xl border border-border p-3 text-hug-muted">No members need follow-up for this month.</p>}
      {members.slice((page - 1) * 10, page * 10).map(member => {
        const status = member.activity?.attentionStatus;
        const warning = status === 'CRITICAL' || status === 'NEEDS_ATTENTION';
        const phone = String(member.contactNumber || '').replace(/[^+\d]/g, '');
        return (
          <article key={member.memberId} className="rounded-xl border border-border bg-bg p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold text-hug-text">{member.memberName}</p>
              {warning && <span className={`rounded-lg px-2 py-1 text-xs font-bold ${status === 'CRITICAL' ? 'bg-danger-bg text-danger' : 'bg-warning-bg text-warning'}`}>{status === 'CRITICAL' ? 'Critical inactivity' : member.activity?.inactiveDays == null ? 'Activity not reported' : 'Inactivity warning'}</span>}
            </div>
            <p className="text-xs text-hug-muted">{member.hasMonthlyOperations ? 'Monthly operations recorded; review account activity.' : 'No recorded operations for this month.'}</p>
            <p className="text-xs text-hug-muted">{member.activityNote}</p>
            <p className="text-xs break-words text-hug-muted">{member.fieldIds.length ? `Plots: ${member.fieldIds.join(', ')}` : 'No active plot assigned.'}</p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-hug-muted">{member.contactNumber || 'No registered contact number'}</span>
              {phone ? <a href={`tel:${phone}`} aria-label={`Call ${member.memberName}`} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white"><Phone size={14} />Call Member</a>
                : <button type="button" disabled className="rounded-lg border border-border px-3 py-2 text-xs text-hug-muted opacity-60">Call unavailable</button>}
            </div>
          </article>
        );
      })}
      {members.length > 0 && <TablePagination currentPage={page} totalPages={totalPages} pageSize={10} totalItems={members.length} onPageChange={setPage} />}
      {data.canCompile === false && <p className="text-xs text-hug-muted">No eligible monthly operations are available yet. You can contact members, but an empty report cannot be compiled.</p>}
    </section>
  );
}
