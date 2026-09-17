import { selectLatestPrice, selectOverviewMetrics } from '../domain/dashboardSelectors';

export default function OverviewPage({ replica, session }) {
  const metrics = selectOverviewMetrics(replica, session);
  const latestPrice = selectLatestPrice(replica);
  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Workspace totals">
        {metrics.map(metric => (
          <article key={metric.id} className="rounded-2xl border border-hug-border bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold text-hug-muted">{metric.label}</p>
            <p className="mt-3 text-4xl font-black text-slate-900">{metric.value}</p>
          </article>
        ))}
      </section>
      <section className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-2xl border border-hug-border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-slate-900">Current data connection</h2>
          <p className="mt-3 text-sm leading-6 text-hug-muted">This overview reads the same authenticated Firestore replica used by the existing workspaces. Realtime snapshots refresh these totals without creating client mutations.</p>
        </article>
        <article className="rounded-2xl border border-hug-border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-slate-900">Latest SRA price</h2>
          {latestPrice ? (
            <div className="mt-3 text-sm text-hug-muted">
              <p className="font-bold text-slate-800">Effective {latestPrice.effectiveDate}</p>
              <p className="mt-1">The complete canonical price record remains available in the current role workspace.</p>
            </div>
          ) : <p className="mt-3 text-sm text-hug-muted">No published price is available.</p>}
        </article>
      </section>
    </div>
  );
}

