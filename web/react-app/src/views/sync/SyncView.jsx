import React, { useEffect, useState } from 'react';
import { subscribeToTerminalDiagnostics } from '../../services/telemetryService';
import SyncDiagnosticsSummary from '../../components/sync/SyncDiagnosticsSummary';
import SyncTelemetryTable from '../../components/sync/SyncTelemetryTable';
import { useAuth } from '../../context/AuthContext';
import { ROLE_KEYS } from '../../utils/authRouting';

function SystemSyncSummary({ subjects, isLoading }) {
  if (isLoading) return <div className="h-32 rounded-2xl border border-border bg-white dark:bg-surface animate-pulse" />;

  const activeAccountCount = subjects.length;
  const withinWindowCount = subjects.filter(subject => subject.activity?.attentionStatus === 'WITHIN_WINDOW').length;
  const attentionCount = subjects.filter(subject => subject.activity?.attentionStatus === 'NEEDS_ATTENTION').length;
  const criticalCount = subjects.filter(subject => subject.activity?.attentionStatus === 'CRITICAL').length;
  const metrics = [
    { label: 'Active Accounts', value: activeAccountCount },
    { label: 'Within 3-Day Window', value: withinWindowCount },
    { label: 'Needs Attention', value: attentionCount },
    { label: 'Critical', value: criticalCount }
  ];

  return (
    <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {metrics.map(({ label, value }) => (
        <div key={label} className="rounded-2xl border border-border bg-white dark:bg-surface shadow-xs p-4">
          <p className="text-2xl font-black text-hug-text">{value.toLocaleString()}</p>
          <p className="text-[11px] uppercase tracking-wider font-bold text-hug-muted mt-1">{label}</p>
        </div>
      ))}
    </section>
  );
}

export default function SyncView() {
  const { roleKey } = useAuth();
  const [subjects, setSubjects] = useState([]);
  const [scope, setScope] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => subscribeToTerminalDiagnostics({
    onUpdate: data => {
      setSubjects(data.subjects);
      setScope(data.scope);
      setIsLoading(false);
      setError(null);
    },
    onError: err => {
      setError(err.message || 'Failed to load synchronization status.');
      setIsLoading(false);
    }
  }), []);

  const ownStatus = subjects.find(subject => subject.isSelf) || null;
  const members = subjects.filter(subject => !subject.isSelf);
  const farmName = scope.blockFarms?.map(farm => farm.name).join(', ') || 'Assigned Block Farm';
  const isSystemMonitor = roleKey === ROLE_KEYS.SUPER_ADMIN;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div>
        <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
          {isSystemMonitor ? 'System synchronization' : 'Agricultural synchronization'}
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-hug-text tracking-tight mt-1">
          {isSystemMonitor ? 'System Sync Monitor' : 'Sync Monitor'}
        </h1>
        <p className="text-sm text-hug-muted mt-1">
          {isSystemMonitor ? 'Account activity monitoring based on the latest server report.' : farmName}
        </p>
      </div>

      {error && (
        <div className="p-4 bg-danger-bg/40 border border-danger/30 rounded-2xl flex items-start gap-3 text-sm font-semibold text-danger">
          <span>{error}</span>
        </div>
      )}

      {isSystemMonitor ? (
        <>
          <SystemSyncSummary subjects={subjects} isLoading={isLoading} />
          <SyncTelemetryTable
            subjects={subjects}
            isLoading={isLoading}
            title="Account Activity Status"
            description="An account not active for 3 days needs attention. At 5 days, it becomes critical."
            emptyTitle="No active accounts found"
            searchPlaceholder="Search accounts..."
            showIcons={false}
            statusMode="activity"
          />
        </>
      ) : (
        <>
          <SyncDiagnosticsSummary subject={ownStatus} isLoading={isLoading} />
          <SyncTelemetryTable
            subjects={members}
            isLoading={isLoading}
            title="Member Activity Status"
            description="An account not active for 3 days needs attention. At 5 days, it becomes critical."
            emptyTitle="No assigned active members found"
            searchPlaceholder="Search members..."
            showIcons={false}
            statusMode="activity"
          />
        </>
      )}
    </div>
  );
}
