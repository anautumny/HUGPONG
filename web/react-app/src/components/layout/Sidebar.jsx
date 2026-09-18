import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  MapPin,
  ClipboardList,
  RefreshCw,
  Users,
  FileCheck,
  TrendingUp,
  BarChart3,
  History,
  LifeBuoy,
  ShieldCheck,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sun,
  Moon,
  Monitor,
  Shield,
  LogOut,
  X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { roleLabelFromKey, ROLE_KEYS } from '../../utils/authRouting';

export default function Sidebar({
  isCollapsed = false,
  onToggleCollapse = () => {},
  isMobileDrawer = false,
  onCloseMobileDrawer = () => {}
}) {
  const { user, roleKey, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Close user popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
    }
    if (isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isUserMenuOpen]);

  // Close user popover on Escape key
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsUserMenuOpen(false);
      }
    }
    if (isUserMenuOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isUserMenuOpen]);

  // Close user popover on route change
  useEffect(() => {
    setIsUserMenuOpen(false);
  }, [location.pathname]);

  // Close mobile drawer on navigation
  const handleNavClick = () => {
    if (isMobileDrawer) {
      onCloseMobileDrawer();
    }
  };

  // Determine role-based brand subtitle matching Stage 7
  let brandSubtitle = 'HUGPONG System';
  if (roleKey === ROLE_KEYS.SUPER_ADMIN) {
    brandSubtitle = 'System Management';
  } else if (roleKey === ROLE_KEYS.FARM_MANAGER) {
    brandSubtitle = 'Farm Management';
  } else if (roleKey === ROLE_KEYS.SRA_ADMIN) {
    brandSubtitle = 'Block Management';
  }

  // Derive role-specific navigation sections matching Stage 7
  const getNavSections = () => {
    const sections = [];

    // All authorized roles have Dashboard
    sections.push({
      header: 'Overview',
      items: [
        {
          label: 'Dashboard',
          to: '/dashboard',
          icon: LayoutDashboard,
          id: 'nav-dashboard'
        }
      ]
    });

    if (roleKey === ROLE_KEYS.FARM_MANAGER) {
      sections.push({
        header: 'Manager Workspace',
        items: [
          {
            label: 'Field Plot Registry',
            to: '/fields',
            icon: MapPin,
            id: 'nav-mgr-fields'
          },
          {
            label: 'Field Operations',
            to: '/operations',
            icon: ClipboardList,
            id: 'nav-operations'
          },
          {
            label: 'Operational Analytics',
            to: '/analytics',
            icon: BarChart3,
            id: 'nav-mgr-analytics'
          },
          {
            label: 'Sync Monitor',
            to: '/sync',
            icon: RefreshCw,
            id: 'nav-synctelemetry'
          },
          {
            label: 'User Management',
            to: '/users',
            icon: Users,
            id: 'nav-mgr-users'
          }
        ]
      });
    } else if (roleKey === ROLE_KEYS.SRA_ADMIN) {
      sections.push({
        header: 'SRA Supervision',
        items: [
          {
            label: 'SRA Audit Center',
            to: '/audit',
            icon: FileCheck,
            id: 'nav-audit'
          },
          {
            label: 'SRA Price Monitor',
            to: '/prices',
            icon: TrendingUp,
            id: 'nav-prices'
          },
          {
            label: 'Operational Analytics',
            to: '/analytics',
            icon: BarChart3,
            id: 'nav-sra-analytics'
          }
        ]
      });
      sections.push({
        header: 'District Cooperative Oversight',
        items: [
          {
            label: 'Block Farm Registry',
            to: '/fields',
            icon: MapPin,
            id: 'nav-fields'
          },
          {
            label: 'User Management',
            to: '/users',
            icon: Users,
            id: 'nav-users'
          }
        ]
      });
    } else if (roleKey === ROLE_KEYS.SUPER_ADMIN) {
      sections.push({
        header: 'District Data Monitoring',
        items: [
          {
            label: 'District Plot Registry',
            to: '/fields',
            icon: MapPin,
            id: 'nav-super-fields'
          },
          {
            label: 'User Directory Monitor',
            to: '/users',
            icon: Users,
            id: 'nav-super-users'
          },
          {
            label: 'System Audit Ledger',
            to: '/audit',
            icon: History,
            id: 'nav-history'
          },
          {
            label: 'SRA Price Monitor',
            to: '/prices',
            icon: TrendingUp,
            id: 'nav-super-prices'
          },
          {
            label: 'District Analytics',
            to: '/analytics',
            icon: BarChart3,
            id: 'nav-super-analytics'
          }
        ]
      });
      sections.push({
        header: 'System Telemetry & Health',
        items: [
          {
            label: 'Sync Monitor',
            to: '/sync',
            icon: RefreshCw,
            id: 'nav-sync'
          },
          {
            label: 'Support & Tickets Desk',
            to: '/support',
            icon: LifeBuoy,
            id: 'nav-tickets'
          }
        ]
      });
      sections.push({
        header: 'Platform Control',
        items: [
          {
            label: 'Maintenance & Security',
            to: '/maintenance',
            icon: ShieldCheck,
            id: 'nav-maintenance'
          }
        ]
      });
    }

    return sections;
  };

  const navSections = getNavSections();

  // User avatar initial matching Stage 7
  const userName = user?.name || (roleKey === ROLE_KEYS.SUPER_ADMIN ? 'Super Admin' : roleKey === ROLE_KEYS.FARM_MANAGER ? 'Farm Manager' : 'SRA Admin');
  const userInitial = (userName.trim()[0] || 'U').toUpperCase();

  const roleDisplay = roleLabelFromKey(roleKey);

  const collapsed = isCollapsed && !isMobileDrawer;

  return (
    <aside
      id="sidebar"
      className={`${
        collapsed ? 'w-16' : 'w-64'
      } bg-surface border-r border-border flex-shrink-0 flex flex-col h-full overflow-visible transition-all duration-200 z-30 select-none relative`}
      aria-label="Main Navigation"
    >
      {/* Brand Header (Aligned to h-16 shared header height, centered when collapsed) */}
      <div
        className={`h-16 flex items-center border-b border-border flex-shrink-0 ${
          collapsed ? 'justify-center px-0' : 'justify-between px-4 sm:px-5'
        }`}
      >
        <div className={`flex items-center gap-3 ${collapsed ? 'justify-center w-full' : 'min-w-0'}`}>
          <div
            className="brand-logo-box w-10 h-10 rounded-xl bg-white border border-border/80 p-1 flex items-center justify-center flex-shrink-0 shadow-xs"
            title="HUGPONG Official Emblem"
          >
            <img src="/logo.png" alt="HUGPONG Official Emblem" className="w-full h-full object-contain" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <span className="block text-primary font-black text-base tracking-widest leading-none">
                HUGPONG
              </span>
              <span id="sidebar-app-sub" className="block text-hug-muted text-[11px] font-medium mt-1 truncate">
                {brandSubtitle}
              </span>
            </div>
          )}
        </div>

        {/* Mobile close button OR desktop collapse toggle */}
        {isMobileDrawer ? (
          <button
            type="button"
            onClick={onCloseMobileDrawer}
            className="p-1.5 rounded-lg text-hug-muted hover:text-hug-text hover:bg-surface-subtle transition-colors"
            aria-label="Close navigation drawer"
          >
            <X className="w-5 h-5" />
          </button>
        ) : (
          !collapsed && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="p-1.5 rounded-lg text-hug-muted hover:text-primary hover:bg-surface-subtle transition-colors"
              title="Collapse sidebar (Ctrl+B)"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )
        )}
      </div>

      {/* Navigation Links (Scrollable) */}
      <nav className={`flex-1 ${collapsed ? 'p-2' : 'p-2'} flex flex-col ${collapsed ? 'gap-1.5' : 'gap-0.5'} overflow-y-auto overflow-x-hidden focus:outline-none`}>
        {navSections.map((section, idx) => (
          <div key={section.header || idx} className="flex flex-col gap-1">
            {!collapsed ? (
              <span className="text-hug-muted text-[10px] font-bold uppercase tracking-wider px-3 pt-3 pb-1">
                {section.header}
              </span>
            ) : (
              idx > 0 && <div className="h-px bg-border/60 my-1 mx-2" />
            )}

            {section.items.map(item => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  id={item.id}
                  onClick={handleNavClick}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    `nav-item flex items-center ${
                      collapsed
                        ? 'w-10 h-10 mx-auto justify-center'
                        : 'gap-2.5 px-3 py-2.5 w-full'
                    } rounded-xl text-sm transition-colors text-left cursor-pointer ${
                      isActive
                        ? 'bg-surface-subtle dark:bg-surface-elevated text-hug-text font-semibold border border-border/80 shadow-2xs'
                        : 'text-hug-muted hover:text-hug-text hover:bg-surface-subtle/80 font-medium border border-transparent'
                    }`
                  }
                  end={item.to === '/dashboard'}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              );
            })}
          </div>
        ))}

        {/* Collapsed Expand Trigger if collapsed */}
        {collapsed && (
          <div className="pt-2 flex justify-center">
            <button
              type="button"
              onClick={onToggleCollapse}
              className="w-10 h-10 mx-auto flex items-center justify-center rounded-xl text-hug-muted hover:text-hug-text hover:bg-surface-subtle transition-colors cursor-pointer border border-transparent hover:border-border/60"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </nav>

      {/* User Profile Area (Clean Popover + Trigger Card) */}
      <div className="p-2.5 border-t border-border bg-surface relative flex-shrink-0" ref={userMenuRef}>
        {/* User Popover Menu */}
        {isUserMenuOpen && (
          <div
            id="user-profile-popover"
            className={
              collapsed
                ? 'absolute left-full bottom-0 w-64 bg-surface border border-l-0 border-border rounded-r-2xl shadow-2xl p-2.5 flex flex-col gap-1 z-50 animate-in fade-in slide-in-from-left-2 duration-150'
                : 'absolute bottom-full left-0 right-0 mb-0 bg-surface border-t border-border rounded-t-2xl shadow-xl p-2.5 flex flex-col gap-1 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150'
            }
            role="menu"
            aria-label="User Account Options"
          >
            {/* User Identity Header */}
            <div className="px-2.5 py-1.5 border-b border-border/80">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="w-2 h-2 rounded-full bg-success flex-shrink-0" />
                <p className="text-xs font-bold text-hug-text truncate" id="popover-user-name">
                  {userName}
                </p>
              </div>
              <p className="text-[11px] text-hug-muted font-medium truncate" id="popover-user-role">
                {roleDisplay}
              </p>
            </div>

            {/* Settings Link */}
            <button
              type="button"
              id="popover-settings"
              onClick={() => {
                setIsUserMenuOpen(false);
                handleNavClick();
                navigate('/settings');
              }}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium text-hug-text hover:bg-surface-subtle hover:text-primary transition-colors cursor-pointer text-left"
              role="menuitem"
            >
              <span className="flex items-center gap-2">
                <Settings className="w-3.5 h-3.5 text-hug-muted" />
                <span>Settings</span>
              </span>
              <span className="text-[10px] text-hug-muted">Account &amp; Security</span>
            </button>

            {/* Appearance Segmented Control */}
            <div className="px-2 py-1.5 bg-surface-subtle rounded-xl border border-border/60">
              <div className="flex items-center justify-between mb-1 px-0.5">
                <span className="text-[10px] font-bold text-hug-muted uppercase tracking-wider">Appearance</span>
                <span className="text-[10px] font-semibold text-hug-text capitalize">{theme}</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={`flex items-center justify-center gap-1 py-1 px-1.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                    theme === 'light'
                      ? 'bg-surface text-hug-text shadow-2xs font-bold border border-border/80'
                      : 'text-hug-muted hover:text-hug-text'
                  }`}
                  title="Light Mode"
                >
                  <Sun className="w-3 h-3" />
                  <span>Light</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`flex items-center justify-center gap-1 py-1 px-1.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                    theme === 'dark'
                      ? 'bg-surface text-hug-text shadow-2xs font-bold border border-border/80'
                      : 'text-hug-muted hover:text-hug-text'
                  }`}
                  title="Dark Mode"
                >
                  <Moon className="w-3 h-3" />
                  <span>Dark</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('system')}
                  className={`flex items-center justify-center gap-1 py-1 px-1.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                    theme === 'system'
                      ? 'bg-surface text-hug-text shadow-2xs font-bold border border-border/80'
                      : 'text-hug-muted hover:text-hug-text'
                  }`}
                  title="System Preference"
                >
                  <Monitor className="w-3 h-3" />
                  <span>Auto</span>
                </button>
              </div>
            </div>

            {/* Privacy Policy Link */}
            <button
              type="button"
              id="popover-privacy"
              onClick={() => {
                setIsUserMenuOpen(false);
                handleNavClick();
                navigate('/privacy');
              }}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium text-hug-text hover:bg-surface-subtle hover:text-primary transition-colors cursor-pointer text-left"
              role="menuitem"
            >
              <span className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-hug-muted" />
                <span>Privacy &amp; Compliance</span>
              </span>
              <span className="text-[10px] text-hug-muted">RA 10173</span>
            </button>

            <div className="h-px bg-border/60 my-0.5" />

            {/* Sign Out Button (Restrained Red) */}
            <button
              type="button"
              id="popover-signout"
              onClick={async () => {
                setIsUserMenuOpen(false);
                await logout();
                navigate('/login');
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-semibold text-danger hover:bg-danger-bg/60 transition-colors cursor-pointer text-left"
              role="menuitem"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        )}

        {/* Trigger Card (Bottom of Sidebar) */}
        <button
          type="button"
          id="sidebar-profile-trigger"
          onClick={() => setIsUserMenuOpen(prev => !prev)}
          className={`flex items-center ${
            collapsed
              ? 'w-10 h-10 mx-auto justify-center p-0'
              : 'w-full justify-between px-2 py-1.5'
          } rounded-xl hover:bg-surface-subtle transition-colors cursor-pointer text-left group`}
          aria-haspopup="menu"
          aria-expanded={isUserMenuOpen}
          title={collapsed ? `${userName} (${roleDisplay})` : 'Open User Menu'}
        >
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2.5 min-w-0 flex-1'}`}>
            {/* Neutral Avatar Surface with Forest-Green Accent */}
            <div
              id="sidebar-admin-avatar"
              className="w-9 h-9 rounded-full bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light border border-primary/20 flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-2xs group-hover:scale-105 transition-transform"
            >
              {userInitial}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p id="sidebar-admin-name" className="text-hug-text text-xs sm:text-sm font-semibold truncate leading-tight">
                  {userName}
                </p>
                <p id="sidebar-admin-role" className="text-hug-muted text-[11px] truncate leading-tight mt-0.5">
                  {roleDisplay}
                </p>
              </div>
            )}
          </div>
          {!collapsed && (
            <ChevronDown
              className={`w-3.5 h-3.5 text-hug-muted group-hover:text-primary transition-transform duration-150 flex-shrink-0 ml-1.5 ${
                isUserMenuOpen ? 'rotate-180 text-primary' : ''
              }`}
            />
          )}
        </button>
      </div>
    </aside>
  );
}
