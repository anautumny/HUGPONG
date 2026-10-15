import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { decideRecoveryReview, fetchRecoveryReviews } from '../../services/recoveryReviewService';

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
}

export default function RecoveryReviewQueue() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState('');
  const [error, setError] = useState('');

  const load = async ({ force = false } = {}) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetchRecoveryReviews({ force });
      setReviews(Array.isArray(response.data) ? response.data : []);
    } catch (loadError) {
      setError(loadError.message || 'Recovery reviews could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const decide = async (review, approve) => {
    const confirmed = window.confirm(approve
      ? `Confirm that you met ${review.displayName} in person, checked valid identification, and confirmed the registered mobile number. Approve a 15-minute password reset window?`
      : `Reject the assisted recovery request for ${review.displayName}?`);
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
      {!loading && reviews.length === 0 && (
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
    </section>
  );
}
