import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SyncProvider } from './context/SyncContext';
import AppShell from './components/layout/AppShell';
import LandingView from './views/LandingView';
import LoginView from './views/LoginView';
import { PrivacyPolicyView, TermsView, CookiePolicyView } from './views/LegalViews';
import DashboardView from './views/dashboard/DashboardView';
import ComponentShowcaseView from './views/ComponentShowcaseView';
import FarmFieldRegistryView from './views/fields/FarmFieldRegistryView';
import OperationsView from './views/operations/OperationsView';
import TakeOverView from './views/operations/TakeOverView';
import AuditCenterView from './views/audit/AuditCenterView';
import PricesView from './views/prices/PricesView';
import AnalyticsView from './views/analytics/AnalyticsView';
import UsersView from './views/users/UsersView';
import SyncView from './views/sync/SyncView';
import TicketsView from './views/support/TicketsView';
import MaintenanceView from './views/maintenance/MaintenanceView';
import SettingsView from './views/settings/SettingsView';

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

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SyncProvider>
          <BrowserRouter>
            <Routes>
              {/* Public Surfaces */}
              <Route path="/" element={<RootRoute />} />
              <Route path="/login" element={<LoginView />} />
              <Route path="/privacy" element={<PrivacyPolicyView />} />
              <Route path="/terms" element={<TermsView />} />
              <Route path="/cookies" element={<CookiePolicyView />} />

              {/* Authenticated Application Shell */}
              <Route element={<AppShell />}>
                <Route path="/dashboard" element={<DashboardView />} />
                <Route path="/showcase" element={<ComponentShowcaseView />} />
                <Route path="/fields" element={<FarmFieldRegistryView />} />
                <Route path="/block-farms" element={<FarmFieldRegistryView />} />
                <Route path="/registry" element={<FarmFieldRegistryView />} />
                <Route path="/operations" element={<OperationsView />} />
                <Route path="/takeover" element={<TakeOverView />} />
                <Route path="/prices" element={<PricesView />} />
                <Route path="/audit" element={<AuditCenterView />} />
                <Route path="/users" element={<UsersView />} />
                <Route path="/sync" element={<SyncView />} />
                <Route path="/support" element={<TicketsView />} />
                <Route path="/maintenance" element={<MaintenanceView />} />
                <Route path="/settings" element={<SettingsView />} />
                <Route path="/analytics" element={<AnalyticsView />} />
              </Route>

              {/* Catch-all fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </SyncProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
