import { NavLink } from 'react-router-dom';
import { allowedSections } from '../domain/workspaceConfig';
import { roleLabel, workspacePath } from '../services/roleRouting';

export default function WorkspaceLayout({ session, section, onLogout, children }) {
  const sections = allowedSections(session.roleKey);
  const title = sections.find(([key]) => key === section)?.[1] || 'Workspace';
  return (
    <div className="min-h-screen bg-hug-background lg:flex">
      <aside className="flex w-full flex-col bg-hug-primary px-6 py-6 text-white lg:min-h-screen lg:w-72">
        <NavLink to="/" className="text-2xl font-black tracking-tight">HUGPONG</NavLink>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-green-100">Farm Management System</p>
        <nav className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1" aria-label="Workspace navigation">
          {sections.map(([key, label]) => <NavLink key={key} to={workspacePath(session.roleKey, key)} className={({ isActive }) => `rounded-xl px-4 py-3 text-sm font-semibold ${isActive ? 'bg-white/15 text-white' : 'text-green-50 hover:bg-white/10'}`} end>{label}</NavLink>)}
        </nav>
        <div className="mt-8 border-t border-white/20 pt-5 lg:mt-auto">
          <p className="truncate text-sm font-bold">{session.user.displayName || session.user.name || session.user.employeeId}</p>
          <p className="mt-1 text-xs text-green-100">{roleLabel(session.roleKey)}</p>
          <button type="button" onClick={onLogout} className="mt-4 w-full rounded-lg border border-white/30 px-3 py-2 text-sm font-bold hover:bg-white/10">Sign out</button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="border-b border-hug-border bg-white px-6 py-5 lg:px-10">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-hug-primary-light">{roleLabel(session.roleKey)} workspace</p>
          <h1 className="mt-1 text-2xl font-black text-slate-900">{title}</h1>
        </header>
        <main className="p-6 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
