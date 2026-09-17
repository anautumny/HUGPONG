export function Section({ title, description, actions, children }) {
  return <section className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h2 className="text-2xl font-black text-slate-900">{title}</h2>{description && <p className="mt-1 max-w-3xl text-sm leading-6 text-hug-muted">{description}</p>}</div>
      {actions}
    </div>
    {children}
  </section>;
}

export function Card({ children, className = '' }) {
  return <div className={`rounded-2xl border border-hug-border bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

export function Notice({ error, message }) {
  if (!error && !message) return null;
  return <p role={error ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm font-semibold ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-hug-primary'}`}>{error || message}</p>;
}

export function Field({ label, children }) {
  return <label className="block text-sm font-bold text-slate-700">{label}{children}</label>;
}

export const inputClass = 'mt-1.5 w-full rounded-xl border border-hug-border bg-white px-3 py-2.5 text-sm outline-none focus:border-hug-primary focus:ring-2 focus:ring-green-100';
export const buttonClass = 'rounded-xl bg-hug-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-hug-primary-light disabled:cursor-not-allowed disabled:opacity-50';
export const secondaryButtonClass = 'rounded-xl border border-hug-border bg-white px-4 py-2.5 text-sm font-bold text-hug-primary hover:bg-green-50 disabled:opacity-50';

export function Empty({ children = 'No records are available.' }) {
  return <div className="rounded-2xl border border-dashed border-hug-border bg-white p-10 text-center text-sm text-hug-muted">{children}</div>;
}

export function Table({ columns, rows, rowKey = 'id' }) {
  if (!rows.length) return <Empty />;
  return <div className="overflow-x-auto rounded-2xl border border-hug-border bg-white shadow-sm"><table className="min-w-full text-left text-sm">
    <thead className="bg-green-50 text-xs uppercase tracking-wide text-hug-primary"><tr>{columns.map(column => <th key={column.key} className="whitespace-nowrap px-4 py-3 font-extrabold">{column.label}</th>)}</tr></thead>
    <tbody className="divide-y divide-hug-border">{rows.map((row, index) => <tr key={row[rowKey] || index} className="align-top hover:bg-slate-50">{columns.map(column => <td key={column.key} className="px-4 py-3 text-slate-700">{column.render ? column.render(row) : String(row[column.key] ?? '—')}</td>)}</tr>)}</tbody>
  </table></div>;
}

export function Status({ value }) {
  const active = ['ACTIVE', 'CERTIFIED', 'RESOLVED'].includes(String(value).toUpperCase());
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${active ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{String(value || 'UNKNOWN').replaceAll('_', ' ')}</span>;
}

