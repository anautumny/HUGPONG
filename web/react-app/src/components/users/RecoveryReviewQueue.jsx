import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { decideRecoveryReview, fetchRecoveryReviews } from '../../services/recoveryReviewService';
import { subscribeToResourceInvalidation } from '../../services/apiClient';
import { useAuth } from '../../context/AuthContext';
import useConfirmation from '../ui/useConfirmation';

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
}

export default function RecoveryReviewQueue() {
  const { user } = useAuth();
  const [requestConfirmation, confirmationDialog] = useConfirmation(user);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState('');
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState(null);
  const refresh = useRef({ active: true, generation: 0, running: false, queued: false, timer: null, notBefore: 0, attempts: 0 });
  const loadRef = useRef(null);
  const schedule = delay => {
    const state = refresh.current;
    clearTimeout(state.timer);
    if (state.active) state.timer = setTimeout(() => { state.timer = null; state.queued = false; void loadRef.current({ force: true }); }, Math.max(1, delay));
  };

  const load = async ({ force = false, append = false } = {}) => {
    const state = refresh.current, generation = state.generation;
    if (!state.active) return;
    if (state.running) { state.queued = true; return; }
    if (Date.now() < state.notBefore) { schedule(state.notBefore - Date.now()); return; }
    state.running = true;
    clearTimeout(state.timer); state.timer = null;
    setLoading(true);
    try {
      const response = await fetchRecoveryReviews({ force, cursor: append ? cursor : null });
      if (!state.active || state.generation !== generation) return;
      const next = Array.isArray(response.data) ? response.data : [];
      setReviews(current => append ? [...current, ...next.filter(item => !current.some(existing => existing.id === item.id))] : next);
      setCursor(response.nextCursor || null);
      setError(''); state.attempts = 0; state.notBefore = 0;
    } catch (loadError) {
      if (!state.active || state.generation !== generation || loadError.code === 'AUTH_CONTEXT_CHANGED') return;
      setError(loadError.status === 429 ? 'Recovery reviews will refresh automatically. Your other work can continue.' : loadError.message || 'Recovery reviews could not be loaded.');
      if (![401, 403].includes(loadError.status)) {
        const delay = Math.max(Number(loadError.retryAfterMs) || 0, Math.min(30000, 1000 * 2 ** Math.min(state.attempts++, 5)));
        state.notBefore = Date.now() + delay; schedule(delay);
      }
    } finally {
      if (state.active && state.generation === generation) {
        state.running = false; setLoading(false);
        if (state.queued) { state.queued = false; schedule(Math.max(100, state.notBefore - Date.now())); }
      }
    }
  };
  loadRef.current = load;

  useEffect(() => {
    const state = refresh.current;
    state.active = true; state.generation++;
    void load();
    const unsubscribe = subscribeToResourceInvalidation(['recovery-reviews'], () => { void loadRef.current({ force: true }); });
    return () => { state.active = false; state.generation++; state.running = false; clearTimeout(state.timer); unsubscribe(); };
  }, []);

  const decide = async (review, approve) => {
    const confirmed = await requestConfirmation({
      title: approve ? 'Approve password recovery?' : 'Reject password recovery?',
      message: approve
        ? `Confirm that you met ${review.displayName} in person, checked valid identification, and confirmed the registered mobile number. Approve a 15-minute password reset window?`
        : `Reject the assisted recovery request for ${review.displayName}?`,
      confirmText: approve ? 'Approve Recovery' : 'Reject Request', type: approve ? 'primary' : 'danger'
    });
    if (!confirmed) return;
    setProcessingId(review.id);
    setError('');
    try {
      await decideRecoveryReview(review.id, approve);
      setReviews(current => current.filter(item => item.id !== review.id));
    } catch (decisionError) {
      setError(decisionError.message || 'The recovery decision could not be saved.');
    } finally {
      setProcessingId('');
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-surface shadow-xs overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border p-4 sm:p-5">
        <div>
          <h3 className="flex items-center gap-2 font-bold text-hug-text"><ShieldCheck className="h-5 w-5 text-primary" /> Password Recovery Reviews</h3>
          <p className="mt-1 text-xs text-hug-muted">Smart/TNT or unavailable-SMS requests require in-person identity verification. You never create or see the user’s new password.</p>
        </div>
        <button type="button" onClick={() => void load({ force: true })} disabled={loading} className="rounded-xl border border-border p-2 text-hug-muted hover:text-primary disabled:opacity-50" aria-label="Refresh recovery reviews">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {error && <div className="m-4 flex gap-2 rounded-xl border border-danger/30 bg-danger-bg/40 p-3 text-xs font-semibold text-danger"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
      {!loading && !error && reviews.length === 0 && !cursor && (
        <div className="p-8 text-center text-xs text-hug-muted"><CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-success" /><p className="font-bold text-hug-text">No recovery reviews pending</p></div>
      )}
      <div className="divide-y divide-border/60">
        {reviews.map(review => (
          <article key={review.id} className="p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-hug-text">{review.displayName}</strong><span className="font-mono text-xs text-primary">{review.userId}</span><span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-bold text-hug-muted">{review.role}</span></div>
                <p className="mt-1 text-xs text-hug-muted">Registered mobile: <span className="font-mono font-bold text-hug-text2">{review.registeredPhone || 'Unavailable'}</span></p>
                <p className="mt-1 text-xs text-hug-muted">Block Farm: {review.blockFarmId || 'Not assigned'} · Requested {formatTime(review.requestedAt)}</p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-warning"><Clock3 className="h-3.5 w-3.5" />Request expires {formatTime(review.expiresAt)}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => void decide(review, false)} disabled={Boolean(processingId)} className="inline-flex items-center gap-1.5 rounded-xl border border-danger/30 px-3 py-2 text-xs font-bold text-danger disabled:opacity-50"><XCircle className="h-4 w-4" />Reject</button>
                <button type="button" onClick={() => void decide(review, true)} disabled={Boolean(processingId)} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><ShieldCheck className="h-4 w-4" />{processingId === review.id ? 'Saving…' : 'Approve after in-person check'}</button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {cursor && <button type="button" disabled={loading || Boolean(processingId)} onClick={() => void load({ force: true, append: true })} className="m-4 rounded-xl border border-border px-4 py-2 text-xs font-bold text-primary disabled:opacity-50">{loading ? 'Loading…' : 'Load more recovery reviews'}</button>}
      {confirmationDialog}
    </section>
  );
}
