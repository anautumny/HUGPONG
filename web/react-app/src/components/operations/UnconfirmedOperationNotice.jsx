import React, { useEffect, useRef, useState } from 'react';
import Button from '../ui/Button';

export default function UnconfirmedOperationNotice({ submission, grant, canRetry = true, onRecovered, onBusyChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(submission);
  active.current = submission;
  useEffect(() => {
    active.current = submission;
    setBusy(false); setError('');
    return () => { active.current = null; onBusyChange?.(false); };
  }, [submission]);
  const pending = submission.pending();
  if (!pending) return null;
  const retry = async () => {
    if (busy || !canRetry) return;
    setBusy(true); setError('');
    onBusyChange?.(true);
    try {
      await submission.retry(grant);
      if (active.current === submission) onRecovered?.(pending);
    } catch (err) { if (active.current === submission) setError(err.message || 'The server has not confirmed this operation.'); }
    finally { if (active.current === submission) { setBusy(false); onBusyChange?.(false); } }
  };
  return (
    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900 space-y-2">
      <p className="font-semibold">An earlier operation is awaiting confirmation.</p>
      <p>{pending.operationName} · {pending.performedOn} · PHP {Number(pending.totalCost || 0).toLocaleString()}</p>
      <p className="text-xs break-all">Reference: {pending.id}</p>
      <p>Review these details, then retry the saved operation. It uses the same reference to prevent a duplicate.</p>
      {!canRetry && <p>Renew Manager Takeover authorization for this plot to retry.</p>}
      {error && <p role="alert">{error}</p>}
      <Button type="button" onClick={retry} disabled={busy || !canRetry}>{busy ? 'Checking…' : 'Retry saved operation'}</Button>
    </div>
  );
}
