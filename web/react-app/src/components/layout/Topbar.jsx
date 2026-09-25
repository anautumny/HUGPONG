import React from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, Sun, Moon, Monitor } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ROLE_KEYS } from '../../utils/authRouting';
import SyncIndicator from './SyncIndicator';

export default function Topbar({ onOpenMobileDrawer = () => {} }) {
  const { pathname, search } = useLocation();
  const { roleKey, user } = useAuth();
  const { theme, setTheme, isDark } = useTheme();

  // Resolve route heading & subtitle matching Stage 7
  const getRouteMeta = () => {
    switch (pathname) {
      case '/dashboard':
        return {
          title: 'Dashboard',
          subtitle: 'Overview of block farm operations & price trends'
        };
      case '/block-farms':
      case '/registry':
      case '/fields':
        return {
          title: 'Farm & Field Registry',
          subtitle: 'Manage and review block farm and member field records'
        };
      case '/operations':
        return {
          title: 'Field Operations',
          subtitle: 'Log, verify, and track sugarcane field activities'
        };
      case '/prices':
        return {
          title: 'SRA Price Monitor',
          subtitle: 'Official Sugar Regulatory Administration price records'
        };
      case '/audit':
        return {
          title: 'SRA Audit Center',
          subtitle: 'Digital validation, QR verification, and compliance certificates'
        };
      case '/users':
        return {
          title: roleKey === ROLE_KEYS.SUPER_ADMIN ? 'User Directory Monitor' : 'User Management',
          subtitle: 'Directory of Farm Members, Farm Managers, and staff'
        };
      case '/sync':
        return {
          title: roleKey === ROLE_KEYS.SUPER_ADMIN ? 'System Sync Monitor' : 'Sync Monitor',
          subtitle: roleKey === ROLE_KEYS.SUPER_ADMIN
            ? 'Platform-wide terminal activity and synchronization health'
            : 'Network telemetry, offline replication, and outbox state'
        };
      case '/support':
        return {
          title: 'Support & Tickets Desk',
          subtitle: 'Operational support, system alerts, and assistance'
        };
      case '/maintenance':
        return {
          title: 'Maintenance & Security',
          subtitle: 'Platform diagnostics, access logs, and integrity controls'
        };
      case '/settings':
        return {
          title: 'Settings & Security',
          subtitle: 'User preferences, password updates, and sessions'
        };
      case '/analytics':
        return {
          title: 'Analytics',
          subtitle: 'Five-domain sugarcane operational intelligence'
        };
      default:
        return {
          title: 'HUGPONG',
          subtitle: 'Agricultural Management & SRA Authority Console'
        };
    }
  };

  const { title, subtitle } = getRouteMeta();

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  return (
    <header
      className="h-16 bg-surface border-b border-border flex items-center justify-between px-4 sm:px-6 gap-3 flex-shrink-0 z-20"
      role="banner"
    >
      {/* Left: Mobile Menu Toggle + Route Heading */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileDrawer}
          className="lg:hidden p-2 rounded-xl text-hug-text2 hover:text-primary hover:bg-surface-subtle transition-colors -ml-1 cursor-pointer"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          <h1
            id="page-heading"
            className="text-lg sm:text-xl font-bold text-hug-text truncate leading-tight tracking-tight"
          >
            {title}
          </h1>
          <p id="page-sub" className="text-xs text-hug-muted truncate hidden xs:block mt-0.5">
            {subtitle}
          </p>
        </div>
      </div>

      {/* Right: Sync Indicator + Quick Theme Switch */}
      <div className="flex items-center gap-2.5 flex-shrink-0">
        <SyncIndicator compact={false} />

        {/* Quick theme toggle button */}
        <button
          type="button"
          onClick={cycleTheme}
          className="p-2 rounded-xl border border-border bg-surface text-hug-text2 hover:text-primary hover:bg-surface-subtle transition-colors cursor-pointer"
          title={`Current theme: ${theme}. Click to switch.`}
          aria-label={`Current theme: ${theme}. Click to toggle.`}
        >
          {theme === 'dark' ? (
            <Moon className="w-4 h-4 text-primary-light" />
          ) : theme === 'light' ? (
            <Sun className="w-4 h-4 text-amber-600" />
          ) : (
            <Monitor className="w-4 h-4 text-hug-muted" />
          )}
        </button>
      </div>
    </header>
  );
}
