import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SyncProvider } from './context/SyncContext';
import AppShell from './components/layout/AppShell';
import { ROLE_KEYS } from './utils/authRouting';
import UsersView from './views/users/UsersView';

const LandingView = lazy(() => import('./views/LandingView'));
const LoginView = lazy(() => import('./views/LoginView'));
const PrivacyPolicyView = lazy(() => import('./views/LegalViews').then(module => ({ default: module.PrivacyPolicyView })));
const TermsView = lazy(() => import('./views/LegalViews').then(module => ({ default: module.TermsView })));
const ComplianceView = lazy(() => import('./views/LegalViews').then(module => ({ default: module.ComplianceView })));
const CookiePolicyView = lazy(() => import('./views/LegalViews').then(module => ({ default: module.CookiePolicyView })));
const DashboardView = lazy(() => import('./views/dashboard/DashboardView'));
const FarmFieldRegistryView = lazy(() => import('./views/fields/FarmFieldRegistryView'));
const OperationsView = lazy(() => import('./views/operations/OperationsView'));
const TakeOverView = lazy(() => import('./views/operations/TakeOverView'));
const AuditCenterView = lazy(() => import('./views/audit/AuditCenterView'));
const PricesView = lazy(() => import('./views/prices/PricesView'));
const AnalyticsView = lazy(() => import('./views/analytics/AnalyticsView'));
const SyncView = lazy(() => import('./views/sync/SyncView'));
const TicketsView = lazy(() => import('./views/support/TicketsView'));
const MaintenanceView = lazy(() => import('./views/maintenance/MaintenanceView'));
const SettingsView = lazy(() => import('./views/settings/SettingsView'));

function RouteLoadingState() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm font-semibold text-hug-muted">
      Loading workspace…
    </div>
  );
}

function RootRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg dark:bg-[#0C1015] text-hug-text">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white border border-border p-1.5 flex items-center justify-center shadow-xs">
            <img src="/logo.png" alt="HUGPONG" className="w-full h-full object-contain animate-pulse" />
          </div>
          <p className="text-xs font-semibold text-hug-muted">Loading HUGPONG...</p>
        </div>
      </div>
    );
  }
  return <LandingView />;
}

function RoleRoute({ allowed, children }) {
  const { roleKey, isLoading } = useAuth();
  if (isLoading) return null;
  return allowed.includes(roleKey) ? children : <Navigate to="/dashboard" replace />;
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
    console.error('[UsersView] Render failed:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-danger/30 bg-danger-bg/30 p-6 text-hug-text">
        <h1 className="text-xl font-black">User directory could not be displayed</h1>
        <p className="mt-2 text-sm text-hug-muted">
          The page encountered an invalid or outdated browser state. Reload the directory to request a fresh copy.
        </p>
        <button
          type="button"
          className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white"
          onClick={() => window.location.reload()}
        >
          Reload User Directory
        </button>
      </div>
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
                <Route path="/prices" element={<RoleRoute allowed={[ROLE_KEYS.SRA_ADMIN]}><PricesView /></RoleRoute>} />
                <Route path="/audit" element={<RoleRoute allowed={AGRICULTURAL_ROLES}><AuditCenterView /></RoleRoute>} />
                <Route path="/users" element={<RoleRoute allowed={MANAGEMENT_ROLES}><UsersRouteErrorBoundary><UsersView /></UsersRouteErrorBoundary></RoleRoute>} />
                <Route path="/sync" element={<RoleRoute allowed={SYNC_MONITOR_ROLES}><SyncView /></RoleRoute>} />
                <Route path="/support" element={<RoleRoute allowed={MANAGEMENT_ROLES}><TicketsView /></RoleRoute>} />
                <Route path="/maintenance" element={<RoleRoute allowed={GOVERNANCE_ROLES}><MaintenanceView /></RoleRoute>} />
                <Route path="/settings" element={<SettingsView />} />
                <Route path="/analytics" element={<RoleRoute allowed={AGRICULTURAL_ROLES}><AnalyticsView /></RoleRoute>} />
              </Route>

              {/* Catch-all fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </SyncProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
