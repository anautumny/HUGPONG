import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SyncProvider } from './context/SyncContext';
import AppShell from './components/layout/AppShell';
import { ROLE_KEYS } from './utils/authRouting';
import UsersView from './views/users/UsersView';
import { createClientReference, reportClientDiagnostic } from './services/clientDiagnostics';
import { lazyWithRecovery } from './utils/lazyWithRecovery';
import LandingView from './views/LandingView';

const LoginView = lazyWithRecovery(() => import('./views/LoginView'), 'login');
const PrivacyPolicyView = lazyWithRecovery(() => import('./views/LegalViews').then(module => ({ default: module.PrivacyPolicyView })), 'privacy-policy');
const TermsView = lazyWithRecovery(() => import('./views/LegalViews').then(module => ({ default: module.TermsView })), 'terms');
const ComplianceView = lazyWithRecovery(() => import('./views/LegalViews').then(module => ({ default: module.ComplianceView })), 'compliance');
const CookiePolicyView = lazyWithRecovery(() => import('./views/LegalViews').then(module => ({ default: module.CookiePolicyView })), 'cookie-policy');
const DashboardView = lazyWithRecovery(() => import('./views/dashboard/DashboardView'), 'dashboard');
const FarmFieldRegistryView = lazyWithRecovery(() => import('./views/fields/FarmFieldRegistryView'), 'field-registry');
const OperationsView = lazyWithRecovery(() => import('./views/operations/OperationsView'), 'operations');
const TakeOverView = lazyWithRecovery(() => import('./views/operations/TakeOverView'), 'takeover');
const AuditCenterView = lazyWithRecovery(() => import('./views/audit/AuditCenterView'), 'audit-center');
const PricesView = lazyWithRecovery(() => import('./views/prices/PricesView'), 'prices');
const AnalyticsView = lazyWithRecovery(() => import('./views/analytics/AnalyticsView'), 'analytics');
const SyncView = lazyWithRecovery(() => import('./views/sync/SyncView'), 'sync');
const TicketsView = lazyWithRecovery(() => import('./views/support/TicketsView'), 'support');
const MaintenanceView = lazyWithRecovery(() => import('./views/maintenance/MaintenanceView'), 'maintenance');
const DiagnosticsConsoleView = lazyWithRecovery(() => import('./views/diagnostics/DiagnosticsConsoleView'), 'diagnostics');
const BackupManagementView = lazyWithRecovery(() => import('./views/backups/BackupManagementView'), 'backups');
const SettingsView = lazyWithRecovery(() => import('./views/settings/SettingsView'), 'settings');

function RouteLoadingState() {
  return (
    <div role="status" className="flex min-h-[40vh] items-center justify-center text-sm text-hug-muted">
      Loading page…
    </div>
  );
}

function RootRoute() {
  // The public website can render while the server checks a saved session.
  // Protected routes keep their own authentication guard in AppShell.
  return <LandingView />;
}

function RoleRoute({ allowed, children }) {
  const { roleKey, isLoading } = useAuth();
  if (isLoading) return null;
  return allowed.includes(roleKey) ? children : <Navigate to="/dashboard" replace />;
}

function reloadLatestWebApplication() {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('_hugpong_refresh', Date.now().toString());
  window.location.replace(nextUrl.toString());
}

function renderFailureMessage(error, info, fallback) {
  return [
    `${error?.name || 'RenderError'}: ${error?.message || fallback}`,
    error?.stack || '',
    info?.componentStack || '',
    `Route: ${window.location.pathname}`
  ].filter(Boolean).join('\n');
}

class UsersRouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    const referenceId = createClientReference('WEB');
    this.setState({ referenceId });
    void reportClientDiagnostic({
      referenceId,
      module: 'WEB',
      message: renderFailureMessage(error, info, 'User directory render failed.'),
      errorCode: 'USER_DIRECTORY_RENDER_FAILURE'
    });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-danger/30 bg-danger-bg/30 p-6 text-hug-text">
        <h1 className="text-xl font-black">User directory could not be displayed</h1>
        <p className="mt-2 text-sm text-hug-muted">
          The user directory could not be displayed. Reload the directory to request a fresh copy.
        </p>
        {this.state.referenceId && <p className="mt-2 font-mono text-xs text-hug-muted">Reference ID: {this.state.referenceId}</p>}
        <button
          type="button"
          className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white"
          onClick={reloadLatestWebApplication}
        >
          Reload User Directory
        </button>
      </div>
    );
  }
}

class ApplicationErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, referenceId: '' };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    const referenceId = createClientReference('WEB');
    this.setState({ referenceId });
    void reportClientDiagnostic({
      referenceId,
      module: 'WEB',
      message: renderFailureMessage(error, info, 'Web application render failed.'),
      errorCode: 'WEB_RENDER_FAILURE'
    });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg p-5 text-hug-text dark:bg-[#0C1015]">
        <section className="w-full max-w-xl rounded-2xl border border-danger/30 bg-surface p-6 shadow-lg">
          <h1 className="text-xl font-black">HUGPONG could not display this page</h1>
          <p className="mt-2 text-sm text-hug-muted">Refresh the application files and try again. If the problem continues, contact support with the reference ID.</p>
          {this.state.referenceId && <p className="mt-3 font-mono text-xs text-hug-muted">Reference ID: {this.state.referenceId}</p>}
          <button type="button" onClick={reloadLatestWebApplication} className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white">Refresh HUGPONG</button>
        </section>
      </main>
    );
  }
}

const AGRICULTURAL_ROLES = [ROLE_KEYS.FARM_MANAGER, ROLE_KEYS.SRA_ADMIN];
const GOVERNANCE_ROLES = [ROLE_KEYS.SUPER_ADMIN];
const MANAGEMENT_ROLES = [ROLE_KEYS.FARM_MANAGER, ROLE_KEYS.SRA_ADMIN, ROLE_KEYS.SUPER_ADMIN];
const SYNC_MONITOR_ROLES = [ROLE_KEYS.FARM_MANAGER, ROLE_KEYS.SUPER_ADMIN];

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SyncProvider>
          <BrowserRouter>
            <Suspense fallback={<RouteLoadingState />}>
              <ApplicationErrorBoundary>
              <Routes>
              {/* Public Surfaces */}
              <Route path="/" element={<RootRoute />} />
              <Route path="/login" element={<LoginView />} />
              <Route path="/privacy" element={<PrivacyPolicyView />} />
              <Route path="/terms" element={<TermsView />} />
              <Route path="/compliance" element={<ComplianceView />} />
              <Route path="/cookies" element={<CookiePolicyView />} />

              {/* Authenticated Application Shell */}
              <Route element={<AppShell />}>
                <Route path="/dashboard" element={<DashboardView />} />
                <Route path="/fields" element={<RoleRoute allowed={AGRICULTURAL_ROLES}><FarmFieldRegistryView /></RoleRoute>} />
                <Route path="/block-farms" element={<RoleRoute allowed={AGRICULTURAL_ROLES}><FarmFieldRegistryView /></RoleRoute>} />
                <Route path="/registry" element={<RoleRoute allowed={AGRICULTURAL_ROLES}><FarmFieldRegistryView /></RoleRoute>} />
                <Route path="/operations" element={<RoleRoute allowed={[ROLE_KEYS.FARM_MANAGER]}><OperationsView /></RoleRoute>} />
                <Route path="/takeover" element={<RoleRoute allowed={[ROLE_KEYS.FARM_MANAGER]}><TakeOverView /></RoleRoute>} />
                <Route path="/prices" element={<RoleRoute allowed={AGRICULTURAL_ROLES}><PricesView /></RoleRoute>} />
                <Route path="/audit" element={<RoleRoute allowed={AGRICULTURAL_ROLES}><AuditCenterView /></RoleRoute>} />
                <Route path="/users" element={<RoleRoute allowed={MANAGEMENT_ROLES}><UsersRouteErrorBoundary><UsersView /></UsersRouteErrorBoundary></RoleRoute>} />
                <Route path="/sync" element={<RoleRoute allowed={SYNC_MONITOR_ROLES}><SyncView /></RoleRoute>} />
                <Route path="/support" element={<RoleRoute allowed={MANAGEMENT_ROLES}><TicketsView /></RoleRoute>} />
                <Route path="/maintenance" element={<RoleRoute allowed={GOVERNANCE_ROLES}><MaintenanceView /></RoleRoute>} />
                <Route path="/diagnostics" element={<RoleRoute allowed={GOVERNANCE_ROLES}><DiagnosticsConsoleView /></RoleRoute>} />
                <Route path="/backups" element={<RoleRoute allowed={GOVERNANCE_ROLES}><BackupManagementView /></RoleRoute>} />
                <Route path="/settings" element={<SettingsView />} />
                <Route path="/analytics" element={<RoleRoute allowed={AGRICULTURAL_ROLES}><AnalyticsView /></RoleRoute>} />
              </Route>

              {/* Catch-all fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              </ApplicationErrorBoundary>
            </Suspense>
          </BrowserRouter>
        </SyncProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
