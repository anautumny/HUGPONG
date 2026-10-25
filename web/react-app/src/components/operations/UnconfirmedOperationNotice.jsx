import React, { useEffect, useRef, useState } from 'react';
import Button from '../ui/Button';

export default function UnconfirmedOperationNotice({ submission, grant, canRetry = true, onRecovered, onBusyChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const active = useRef(submission);
  active.current = submission;
  useEffect(() => {
    active.current = submission;
    setBusy(false); setError('');
    return () => { active.current = null; onBusyChange?.(false); };
  }, [submission]);
  const pending = submission.pending();
  const conflict = submission.conflict?.();
  if (!pending) return null;
  const retry = async () => {
    if (busy || !canRetry) return;
    setBusy(true); setError('');
    onBusyChange?.(true);
    try {
      const response = await submission.retry(grant);
      if (active.current === submission) onRecovered?.(response?.data || pending);
    } catch (err) { if (active.current === submission) setError(err.message || 'The server has not confirmed this operation.'); }
    finally { if (active.current === submission) { setBusy(false); onBusyChange?.(false); } }
  };
  const resolve = async separate => {
    if (busy || (separate && !canRetry)) return;
    setBusy(true); setError(''); onBusyChange?.(true);
    try {
      let record;
      if (separate) record = (await submission.recordSeparate(reason, grant))?.data;
      else { record = conflict.records[0]; submission.acceptExisting(); }
      if (active.current === submission) onRecovered?.(record || pending);
    } catch (err) { if (active.current === submission) setError(err.message); }
    finally { if (active.current === submission) { setBusy(false); onBusyChange?.(false); } }
  };
  return (
    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900 space-y-2">
      <p className="font-semibold">{conflict ? 'Another user already recorded matching work' : 'An earlier operation is awaiting confirmation.'}</p>
      <p>{pending.operationName} · {pending.performedOn} · PHP {Number(pending.totalCost || 0).toLocaleString()}</p>
      <p className="text-xs break-all">Reference: {pending.id}</p>
      {conflict ? <>
        <p>Compare your entry with these server records. Keep the saved copy until you decide.</p>
        {conflict.records.map(record => <p key={record.id} className="text-xs break-all">{record.id} · {record.performedOn} · PHP {Number(record.totalCost).toLocaleString()} · {record.submittedByUserId}</p>)}
        <Button type="button" disabled={busy} onClick={() => resolve(false)}>Already recorded — remove saved copy</Button>
        {conflict.canRecordSeparate !== false && <>
          <label className="block">Reason this is separate work<input value={reason} onChange={event => setReason(event.target.value)} maxLength={500} className="block w-full rounded border p-2" /></label>
          <Button type="button" disabled={busy || !canRetry || reason.trim().length < 3} onClick={() => resolve(true)}>Record separate work after review</Button>
        </>}
      </> : <p>Review these details, then retry the saved operation. It uses the same reference to prevent a duplicate.</p>}
      {!canRetry && <p>Renew Manager Takeover authorization for this plot to retry.</p>}
      {error && <p role="alert">{error}</p>}
      {!conflict && <Button type="button" onClick={retry} disabled={busy || !canRetry}>{busy ? 'Checking…' : 'Retry saved operation'}</Button>}
    </div>
  );
}
