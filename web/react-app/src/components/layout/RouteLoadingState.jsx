import React from 'react';

export default function RouteLoadingState() {
  return (
    <section role="status" aria-live="polite" aria-busy="true" className="mx-auto w-full max-w-7xl py-4">
      <div className="mb-6 flex items-center gap-3 text-hug-text">
        <span aria-hidden="true" className="h-5 w-5 shrink-0 rounded-full border-2 border-primary/25 border-t-primary motion-safe:animate-spin" />
        <p className="text-sm font-semibold">Loading page…</p>
      </div>
      <div aria-hidden="true" className="space-y-5 motion-safe:animate-pulse">
        <div className="h-8 w-52 rounded-lg bg-surface-subtle" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map(item => <div key={item} className="h-24 rounded-xl border border-border bg-surface" />)}
        </div>
        <div className="h-64 rounded-xl border border-border bg-surface" />
      </div>
    </section>
  );
}
