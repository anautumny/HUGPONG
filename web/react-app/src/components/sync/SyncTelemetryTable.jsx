import React, { useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import Input from '../ui/Input';
import { PaginationFooter } from '../ui/Table';
import { activityAttentionPresentation, formatActivity, formatPhilippineTime, syncStatusPresentation } from '../../services/telemetryService';

const PAGE_SIZE = 10;

export default function SyncTelemetryTable({
  subjects = [],
  isLoading = false,
  title = 'Member Synchronization',
  description = 'Counts are the latest centrally reported device state, not a live inspection of an offline phone.',
  emptyTitle = 'No assigned members found',
  searchPlaceholder = 'Search members...',
  showIcons = true,
  statusMode = 'sync'
}) {
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? subjects.filter(subject => subject.displayName.toLowerCase().includes(query)) : subjects;
  }, [subjects, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const validPage = Math.min(currentPage, totalPages);
  const pagedSubjects = useMemo(() => {
    const start = (validPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, validPage]);

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-xs overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-hug-text">{title}</h2>
          <p className="text-xs text-hug-muted mt-0.5">{description}</p>
        </div>
        <div className="w-full sm:w-64">
          <Input
            value={search}
            onChange={event => {
              setSearch(event.target.value);
              setCurrentPage(1);
            }}
            placeholder={searchPlaceholder}
            icon={showIcons ? Search : undefined}
          />
        </div>
      </div>

      <div className="divide-y divide-border/60">
        {isLoading ? Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse bg-bg/40" />
        )) : filtered.length === 0 ? (
          <div className="py-12 text-center text-hug-muted">
            {showIcons && <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />}
            <p className="text-sm font-bold text-hug-text">{emptyTitle}</p>
          </div>
        ) : pagedSubjects.map(subject => {
          const status = statusMode === 'activity'
            ? activityAttentionPresentation(subject.activity)
            : syncStatusPresentation(subject.sync?.state, subject.sync?.pendingMutationCount, subject.sync?.failedMutationCount);
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
      {!isLoading && filtered.length > 0 && (
        <PaginationFooter
          currentPage={validPage}
          totalPages={totalPages}
          totalItems={filtered.length}
          onPageChange={setCurrentPage}
        />
      )}
    </section>
  );
}
