import React from 'react';
import { activityAttentionPresentation, formatActivity, formatPhilippineTime } from '../../services/telemetryService';

export default function SyncDiagnosticsSummary({ subject, isLoading = false }) {
  if (isLoading) return <div className="h-44 rounded-2xl border border-border bg-white dark:bg-surface animate-pulse" />;
  if (!subject) return <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 text-sm text-hug-muted">Your activity has not been reported yet.</div>;

  const status = activityAttentionPresentation(subject.activity);
  const tone = {
    success: 'bg-success-bg text-success border-success/30',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-danger-bg text-danger border-danger/30',
    info: 'bg-blue-50 text-blue-700 border-blue-200',
    muted: 'bg-bg text-hug-muted border-border'
  }[status.tone];
  const details = [
    { label: 'Last Active', value: formatActivity(subject.activity?.lastActiveAt) },
    { label: 'Activity Status', value: status.label },
    { label: 'Last Successful Sync', value: formatPhilippineTime(subject.sync?.lastSuccessfulSyncAt) },
    { label: 'Last Sync Report', value: formatPhilippineTime(subject.sync?.lastReportedAt) }
  ];

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-xs p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-[11px] uppercase tracking-wider font-bold text-hug-muted">Your Status</p>
          <h2 className="text-lg font-black text-hug-text">{subject.displayName}</h2>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${tone}`}>{status.label}</span>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {details.map(({ label, value }) => (
          <div key={label} className="rounded-xl bg-bg/60 dark:bg-black/10 border border-border/70 p-3">
            <p className="text-[10px] uppercase tracking-wider font-bold text-hug-muted">{label}</p>
            <p className="text-sm font-extrabold text-hug-text mt-0.5">{value}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-hug-muted mt-4">An account not active for 3 days needs attention. At 5 days, it becomes critical.</p>
    </section>
  );
}
