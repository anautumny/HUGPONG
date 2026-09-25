import React, { useEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { subscribeToTerminalDiagnostics } from '../../services/telemetryService';
import SyncDiagnosticsSummary from '../../components/sync/SyncDiagnosticsSummary';
import SyncTelemetryTable from '../../components/sync/SyncTelemetryTable';
import { useAuth } from '../../context/AuthContext';
import { getPendingTicketMutationCount } from '../../services/ticketsService';

export default function SyncView() {
  const { user } = useAuth();
  const [subjects, setSubjects] = useState([]);
  const [scope, setScope] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [localPending, setLocalPending] = useState(() => getPendingTicketMutationCount(user));

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

  useEffect(() => {
    const update = () => setLocalPending(getPendingTicketMutationCount(user));
    update();
    window.addEventListener('hugpong:ticket-outbox', update);
    return () => window.removeEventListener('hugpong:ticket-outbox', update);
  }, [user]);

  const ownStatus = subjects.find(subject => subject.isSelf) || null;
  const members = subjects.filter(subject => !subject.isSelf);
  const farmName = scope.blockFarms?.map(farm => farm.name).join(', ') || 'Assigned Block Farm';

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div>
        <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
          <RefreshCw className="w-4 h-4" />
          Agricultural synchronization
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-hug-text tracking-tight mt-1">Sync Monitor</h1>
        <p className="text-sm text-hug-muted mt-1">{farmName}</p>
      </div>

      {error && (
        <div className="p-4 bg-danger-bg/40 border border-danger/30 rounded-2xl flex items-start gap-3 text-sm font-semibold text-danger">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <SyncDiagnosticsSummary subject={ownStatus} localPending={localPending} isLoading={isLoading} />
      <SyncTelemetryTable subjects={members} isLoading={isLoading} />
    </div>
  );
}
