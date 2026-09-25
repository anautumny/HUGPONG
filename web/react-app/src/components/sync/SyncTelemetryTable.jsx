import React, { useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import Input from '../ui/Input';
import { formatActivity, formatPhilippineTime, syncStatusPresentation } from '../../services/telemetryService';

export default function SyncTelemetryTable({ subjects = [], isLoading = false }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? subjects.filter(subject => subject.displayName.toLowerCase().includes(query)) : subjects;
  }, [subjects, search]);

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-xs overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-hug-text">Member Synchronization</h2>
          <p className="text-xs text-hug-muted mt-0.5">Counts are the latest centrally reported device state, not a live inspection of an offline phone.</p>
        </div>
        <div className="w-full sm:w-64">
          <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search members..." icon={Search} />
        </div>
      </div>

      <div className="divide-y divide-border/60">
        {isLoading ? Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse bg-bg/40" />
        )) : filtered.length === 0 ? (
          <div className="py-12 text-center text-hug-muted">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-bold text-hug-text">No assigned members found</p>
          </div>
        ) : filtered.map(subject => {
          const status = syncStatusPresentation(subject.sync?.state, subject.sync?.pendingMutationCount, subject.sync?.failedMutationCount);
          const tone = {
            success: 'text-success bg-success-bg',
            warning: 'text-amber-700 bg-amber-50',
            danger: 'text-danger bg-danger-bg',
            info: 'text-blue-700 bg-blue-50',
            muted: 'text-hug-muted bg-bg'
          }[status.tone];
          return (
            <div key={subject.userId} className="p-4 sm:p-5 grid gap-3 sm:grid-cols-[minmax(180px,1.4fr)_1fr_1fr_auto] sm:items-center">
              <div>
                <p className="font-extrabold text-hug-text">{subject.displayName}</p>
                <p className="text-xs text-hug-muted">Last active {formatActivity(subject.activity?.lastActiveAt)} · {subject.activity?.lastPlatform || 'platform not reported'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold tracking-wider text-hug-muted">Last Successful Sync</p>
                <p className="text-xs font-semibold text-hug-text mt-1">{formatPhilippineTime(subject.sync?.lastSuccessfulSyncAt)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold tracking-wider text-hug-muted">Last Reported</p>
                <p className="text-xs font-semibold text-hug-text mt-1">{formatPhilippineTime(subject.sync?.lastReportedAt)}</p>
              </div>
              <span className={`justify-self-start sm:justify-self-end rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{status.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
