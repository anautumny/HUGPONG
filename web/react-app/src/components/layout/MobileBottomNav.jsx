import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  Building2,
  BarChart3,
  FileCheck,
  TrendingUp,
  RefreshCw,
  Users,
  Menu
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ROLE_KEYS } from '../../utils/authRouting';

/**
 * MobileBottomNav — Responsive bottom navigation bar for HUGPONG Web client on mobile viewports.
 * Synchronous parity with Mobile client:
 *  - Role-scoped quick navigation.
 *  - Active indicator pill and top pip.
 *  - 48px+ touch targets for field ergonomics.
 *  - More drawer launcher for secondary workspace items.
 */
export default function MobileBottomNav({ onOpenMobileDrawer = () => {} }) {
  const { roleKey } = useAuth();
  const location = useLocation();

  // Derive role-specific navigation items matching HUGPONG authority
  const getNavItems = () => {
    if (roleKey === ROLE_KEYS.FARM_MANAGER) {
      return [
        { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
        { label: 'Operation', to: '/operations', icon: ClipboardList },
        { label: 'Fields', to: '/fields', icon: Building2 },
        { label: 'Analytics', to: '/analytics', icon: BarChart3 },
      ];
    }
    if (roleKey === ROLE_KEYS.SRA_ADMIN) {
      return [
        { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
        { label: 'Audit', to: '/audit', icon: FileCheck },
        { label: 'Prices', to: '/prices', icon: TrendingUp },
        { label: 'Analytics', to: '/analytics', icon: BarChart3 },
      ];
    }
    // Super Admin or fallback
    return [
      { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
      { label: 'Users', to: '/users', icon: Users },
      { label: 'Sync Hub', to: '/sync', icon: RefreshCw },
      { label: 'Audit', to: '/audit', icon: FileCheck },
    ];
  };

  const navItems = getNavItems();

  return (
    <nav
      id="mobile-bottom-nav"
      aria-label="Mobile Bottom Navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface/95 dark:bg-[#1E2320]/95 backdrop-blur-md border-t border-border shadow-2xl print:hidden no-print"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}
    >
      <div className="flex items-center justify-around px-2 pt-1 pb-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all duration-150 min-h-[48px] ${
                isActive
                  ? 'text-primary dark:text-[#8FB870] font-bold'
                  : 'text-foreground-muted hover:text-foreground'
              }`}
            >
              {/* Top Accent Indicator Pip */}
              <div
                className={`w-6 h-1 rounded-full mb-1 transition-all ${
                  isActive ? 'bg-primary dark:bg-[#8FB870]' : 'bg-transparent'
                }`}
              />

              {/* Icon Capsule Pill */}
              <div
                className={`flex items-center justify-center w-11 h-7 rounded-full transition-all ${
                  isActive
                    ? 'bg-primary-bg dark:bg-primary/25'
                    : 'bg-transparent'
                }`}
              >
                <Icon className="w-5 h-5 stroke-[2.2]" />
              </div>

              {/* Label */}
              <span className="text-[11px] tracking-tight mt-0.5 truncate max-w-[72px]">
                {item.label}
              </span>
            </NavLink>
          );
        })}

        {/* More Button: opens slide-in Mobile Drawer */}
        <button
          type="button"
          onClick={onOpenMobileDrawer}
          className="flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all duration-150 min-h-[48px] text-foreground-muted hover:text-foreground cursor-pointer"
          aria-label="Open More Navigation Drawer"
        >
          <div className="w-6 h-1 rounded-full mb-1 bg-transparent" />
          <div className="flex items-center justify-center w-11 h-7 rounded-full bg-transparent">
            <Menu className="w-5 h-5 stroke-[2.2]" />
          </div>
          <span className="text-[11px] tracking-tight mt-0.5">More</span>
        </button>
      </div>
    </nav>
  );
}
