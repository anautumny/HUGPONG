import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, Search, ShieldCheck, SquareTerminal } from 'lucide-react';
import { fetchDiagnostics } from '../../services/diagnosticsService';

const LEVEL_STYLES = {
  ERROR: 'text-red-300',
  WARN: 'text-amber-300',
  INFO: 'text-sky-300'
};

const EMPTY_FILTERS = { level: '', module: '', date: '', referenceId: '', search: '' };

function timeLabel(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function dateTimeLabel(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString();
}

function LogEntry({ entry }) {
  const levelClass = LEVEL_STYLES[entry.level] || 'text-slate-300';
  return (
    <article className="border-b border-slate-800/90 px-4 py-3 last:border-b-0 hover:bg-slate-900/80 transition-colors">
      <div className="font-mono text-xs sm:text-sm leading-6 break-words">
        <span className="text-slate-500">[{timeLabel(entry.timestamp)}]</span>{' '}
        <span className={levelClass}>[{entry.level || 'INFO'}]</span>{' '}
        <span className="text-emerald-300">[{entry.module || 'SYSTEM'}]</span>{' '}
        <span className="text-violet-300">{entry.referenceId || 'NO-REFERENCE'}</span>{' '}
        <span className="text-slate-200">{entry.technicalError || 'No diagnostic summary available.'}</span>
      </div>
      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[10px] sm:text-[11px] text-slate-500">
        <div><dt className="inline text-slate-600">time </dt><dd className="inline">{dateTimeLabel(entry.timestamp)}</dd></div>
        <div><dt className="inline text-slate-600">role </dt><dd className="inline">{entry.userRole || 'GUEST'}</dd></div>
        <div><dt className="inline text-slate-600">client </dt><dd className="inline">{entry.platform || 'unknown'} {entry.appVersion || 'unknown'}</dd></div>
        <div><dt className="inline text-slate-600">device </dt><dd className="inline">{entry.deviceModel || 'unknown'} / {entry.deviceOs || 'unknown'}</dd></div>
        <div><dt className="inline text-slate-600">sync </dt><dd className="inline">{entry.syncStatus || 'NOT_APPLICABLE'}</dd></div>
        <div><dt className="inline text-slate-600">operation </dt><dd className="inline">{entry.method || 'UNKNOWN'} {entry.endpoint || '/'}</dd></div>
      </dl>
    </article>
  );
}

export default function DiagnosticsConsoleView() {
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [entries, setEntries] = useState([]);
  const [levels, setLevels] = useState(['ERROR', 'WARN', 'INFO']);
  const [modules, setModules] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchDiagnostics(filters);
      setEntries(data.entries);
      if (data.levels.length) setLevels(data.levels);
      if (data.modules.length) setModules(data.modules);
      setError('');
    } catch (requestError) {
      setError(requestError.message || 'Diagnostics could not be loaded. Try again.');
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => ({
    ERROR: entries.filter(entry => entry.level === 'ERROR').length,
    WARN: entries.filter(entry => entry.level === 'WARN').length,
    INFO: entries.filter(entry => entry.level === 'INFO').length
  }), [entries]);

  const applyFilters = event => {
    event.preventDefault();
    setFilters({ ...draft });
  };

  const update = event => setDraft(current => ({ ...current, [event.target.name]: event.target.value }));

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
            <ShieldCheck className="h-4 w-4" /> Super Admin only
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-hug-text sm:text-3xl">Diagnostics Console</h1>
          <p className="mt-1 max-w-3xl text-sm text-hug-muted">
            Sanitized technical failures and synchronization issues. User and system actions remain in the separate Audit Ledger.
          </p>
        </div>
        <button type="button" onClick={load} disabled={isLoading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-bold text-hug-text hover:bg-surface-subtle disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <form onSubmit={applyFilters} className="grid gap-3 rounded-2xl border border-border bg-surface p-4 shadow-xs sm:grid-cols-2 lg:grid-cols-6">
        <label className="text-xs font-bold text-hug-muted">Level
          <select name="level" value={draft.level} onChange={update} className="mt-1.5 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-hug-text">
            <option value="">All levels</option>
            {levels.map(level => <option key={level} value={level}>{level === 'WARN' ? 'Warning' : level[0] + level.slice(1).toLowerCase()}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-hug-muted">Module
          <select name="module" value={draft.module} onChange={update} className="mt-1.5 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-hug-text">
            <option value="">All modules</option>
            {modules.map(module => <option key={module} value={module}>{module}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-hug-muted">Date
          <input name="date" type="date" value={draft.date} onChange={update} className="mt-1.5 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-hug-text" />
        </label>
        <label className="text-xs font-bold text-hug-muted">Reference ID
          <input name="referenceId" value={draft.referenceId} onChange={update} placeholder="AUTH-20260928…" className="mt-1.5 w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm text-hug-text" />
        </label>
        <label className="text-xs font-bold text-hug-muted lg:col-span-2">Search
          <div className="mt-1.5 flex gap-2">
            <input name="search" value={draft.search} onChange={update} placeholder="Message, endpoint, or code" className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-hug-text" />
            <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white"><Search className="h-4 w-4" /> Search</button>
          </div>
        </label>
      </form>

      {error && <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-bg/40 p-4 text-sm font-semibold text-danger"><AlertTriangle className="h-5 w-5 shrink-0" />{error}</div>}

      <section className="overflow-hidden rounded-2xl border border-slate-700 bg-[#080d12] shadow-xl" aria-label="Sanitized diagnostic logs">
        <header className="flex flex-col gap-3 border-b border-slate-700 bg-[#0d141c] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 font-mono text-sm font-bold text-emerald-300"><SquareTerminal className="h-4 w-4" /> hugpong://diagnostics</div>
          <div className="flex gap-3 font-mono text-[11px]">
            <span className="text-red-300">{counts.ERROR} error</span>
            <span className="text-amber-300">{counts.WARN} warning</span>
            <span className="text-sky-300">{counts.INFO} info</span>
          </div>
        </header>
        <div className="max-h-[620px] min-h-[320px] overflow-auto" aria-live="polite">
          {isLoading && !entries.length ? (
            <div className="p-8 font-mono text-sm text-slate-500">Loading sanitized diagnostic stream…</div>
          ) : entries.length ? entries.map(entry => <LogEntry key={entry.id || entry.referenceId} entry={entry} />) : (
            <div className="p-8 font-mono text-sm text-slate-500">No diagnostic events match these filters.</div>
          )}
        </div>
      </section>
    </div>
  );
}
