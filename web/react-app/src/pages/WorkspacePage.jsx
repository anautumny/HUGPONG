import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import WorkspaceLayout from '../components/WorkspaceLayout';
import { defaultSection, sectionAllowed } from '../domain/workspaceConfig';
import { OperationsSection, CyclesSection } from '../features/OperationsSections';
import { ReportsSection, PricesSection } from '../features/RegulatorySections';
import { UsersSection, FarmsSection, FieldsSection } from '../features/RegistrySections';
import { DiagnosticsSection, HistorySection, SettingsSection, SupportSection } from '../features/SystemSections';
import { useReplica } from '../hooks/useReplica';
import { workspaceGuardDestination, workspacePath } from '../services/roleRouting';
import OverviewPage from './OverviewPage';

function Feature({ section, replica, session, signOut }) {
  const common = { replica, session };
  if (section === 'overview') return <OverviewPage {...common} />;
  if (section === 'users') return <UsersSection {...common} />;
  if (section === 'farms') return <FarmsSection {...common} />;
  if (section === 'farm') return <FarmsSection {...common} assignedOnly />;
  if (section === 'fields') return <FieldsSection {...common} />;
  if (section === 'operations') return <OperationsSection {...common} />;
  if (section === 'cycles') return <CyclesSection {...common} />;
  if (section === 'prices') return <PricesSection {...common} />;
  if (section === 'reports') return <ReportsSection {...common} />;
  if (section === 'history') return <HistorySection {...common} />;
  if (section === 'diagnostics') return <DiagnosticsSection {...common} />;
  if (section === 'support') return <SupportSection {...common} />;
  if (section === 'settings') return <SettingsSection {...common} onLogout={signOut} />;
  return null;
}

export default function WorkspacePage() {
  const { workspace, section } = useParams();
  const { status, session, signOut } = useAuth();
  const replica = useReplica(session);

  if (status !== 'authenticated') return <Navigate replace to="/login" />;
  const guardDestination = workspaceGuardDestination(session.roleKey, workspace);
  if (guardDestination) return <Navigate replace to={guardDestination} />;
  const activeSection = section || defaultSection(session.roleKey);
  if (!section || !sectionAllowed(session.roleKey, activeSection)) return <Navigate replace to={workspacePath(session.roleKey, defaultSection(session.roleKey))} />;

  if (session.roleKey === 'member') {
    return <main className="grid min-h-screen place-items-center bg-hug-background p-6"><section className="max-w-lg rounded-3xl border border-hug-border bg-white p-9 text-center shadow-xl shadow-green-950/5">
      <p className="text-2xl font-black text-hug-primary">HUGPONG</p><h1 className="mt-5 text-2xl font-black text-slate-900">Member Farmer workspace</h1>
      <p className="mt-3 text-sm leading-6 text-hug-muted">Member Farmer field operations are provided by the offline-first HUGPONG mobile application. This web route verifies the same authenticated role without exposing another role's workspace.</p>
      <button type="button" onClick={signOut} className="mt-6 rounded-xl bg-hug-primary px-5 py-3 text-sm font-bold text-white">Sign out</button>
    </section></main>;
  }

  return <WorkspaceLayout session={session} section={activeSection} onLogout={signOut}><Feature section={activeSection} replica={replica} session={session} signOut={signOut} /></WorkspaceLayout>;
}
