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
  X,
  Building2,
  SquareTerminal,
  DatabaseBackup
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { roleLabelFromKey, ROLE_KEYS } from '../../utils/authRouting';
import ConfirmDialog from '../ui/ConfirmDialog';

export default function Sidebar({
  isCollapsed = false,
  onToggleCollapse = () => {},
  isMobileDrawer = false,
  onCloseMobileDrawer = () => {}
}) {
  const { user, roleKey, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSignOutConfirmOpen, setIsSignOutConfirmOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
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

  const handleConfirmSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await logout();
      setIsSignOutConfirmOpen(false);
      navigate('/login', { replace: true });
    } finally {
      setIsSigningOut(false);
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
            label: 'Farm & Field Registry',
            to: '/fields',
            icon: Building2,
            id: 'nav-farm-field-registry'
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
            label: 'Farm & Field Registry',
            to: '/fields',
            icon: Building2,
            id: 'nav-farm-field-registry'
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
        header: 'Platform Governance',
        items: [
          {
            label: 'User Directory Monitor',
            to: '/users',
            icon: Users,
            id: 'nav-super-users'
          }
        ]
      });
      sections.push({
        header: 'System Telemetry & Health',
        items: [
          {
            label: 'System Sync Monitor',
            to: '/sync',
            icon: RefreshCw,
            id: 'nav-system-sync'
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
          },
          {
            label: 'Diagnostics Console',
            to: '/diagnostics',
            icon: SquareTerminal,
            id: 'nav-diagnostics'
          },
          {
            label: 'Backup & Recovery',
            to: '/backups',
            icon: DatabaseBackup,
            id: 'nav-backups'
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
    <>
    <aside
      id="sidebar"
      className={`${
        collapsed ? 'w-16' : 'w-64'
      } bg-surface border-r border-border flex-shrink-0 flex flex-col h-full overflow-visible transition-all duration-200 z-30 select-none relative`}
      aria-label="Main Navigation"
    >
      {/* Semi-Circle Tab Toggle: Right half when collapsed (protruding into canvas), Left half when expanded (flush inside sidebar) */}
      {!isMobileDrawer && (
        <button
          type="button"
          onClick={onToggleCollapse}
          className={`absolute top-5 ${
            collapsed
              ? 'left-full -ml-px w-5 h-7 rounded-r-full border border-l-0 pl-0.5'
              : '-right-px w-5 h-7 rounded-l-full border border-r-0 pr-0.5'
          } border-border bg-surface flex items-center justify-center text-hug-muted hover:text-primary dark:hover:text-primary-light hover:bg-primary-bg dark:hover:bg-primary/20 hover:border-primary/40 shadow-2xs hover:shadow-xs transition-all z-40 cursor-pointer group`}
          title={collapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5 text-hug-muted group-hover:text-primary dark:group-hover:text-primary-light group-hover:translate-x-0.5 transition-transform" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5 text-hug-muted group-hover:text-primary dark:group-hover:text-primary-light group-hover:-translate-x-0.5 transition-transform" />
          )}
        </button>
      )}

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

        {/* Mobile close button (only displayed in mobile drawer mode) */}
        {isMobileDrawer && (
          <button
            type="button"
            onClick={onCloseMobileDrawer}
            className="p-1.5 rounded-lg text-hug-muted hover:text-hug-text hover:bg-surface-subtle transition-colors"
            aria-label="Close navigation drawer"
          >
            <X className="w-5 h-5" />
          </button>
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
              const currentPathWithSearch = location.pathname + location.search;
              const isItemActive = (navIsActive) => {
                if (item.to === '/fields') {
                  return location.pathname === '/fields' || location.pathname === '/block-farms' || location.pathname === '/registry';
                }
                return navIsActive;
              };

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  id={item.id}
                  onClick={handleNavClick}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) => {
                    const active = isItemActive(isActive);
                    return `nav-item group relative flex items-center ${
                      collapsed
                        ? 'w-10 h-10 mx-auto justify-center'
                        : 'gap-2.5 px-3 py-2.5 w-full'
                    } rounded-xl text-sm transition-all text-left cursor-pointer ${
                      active
                        ? 'bg-primary-bg text-primary dark:bg-primary/20 dark:text-primary-light font-bold border border-primary/25 dark:border-primary/40 shadow-2xs'
                        : 'text-hug-muted hover:text-hug-text hover:bg-surface-subtle/80 font-medium border border-transparent'
                    }`;
                  }}
                  end={item.to === '/dashboard'}
                >
                  {({ isActive }) => {
                    const active = isItemActive(isActive);
                    return (
                      <>
                        {active && !collapsed && (
                          <span
                            className="w-1 h-3.5 rounded-full bg-primary dark:bg-primary-light -ml-0.5 flex-shrink-0"
                            aria-hidden="true"
                          />
                        )}
                        <Icon
                          className={`w-4 h-4 flex-shrink-0 transition-colors ${
                            active ? 'text-primary dark:text-primary-light' : 'text-hug-muted group-hover:text-hug-text'
                          }`}
                        />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </>
                    );
                  }}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User Profile Area (Clean Popover + Trigger Card) */}
      <div className="p-2.5 border-t border-border bg-surface relative flex-shrink-0" ref={userMenuRef}>
        {/* User Popover Menu */}
        {isUserMenuOpen && (
          <div
            id="user-profile-popover"
            className={
              collapsed
                ? 'absolute left-full bottom-0 w-60 ml-2.5 bg-surface border border-border rounded-2xl shadow-xl p-1.5 flex flex-col gap-1 z-50 animate-in fade-in slide-in-from-left-2 duration-150'
                : 'absolute bottom-full inset-x-2.5 mb-2 bg-surface border border-border rounded-2xl shadow-xl p-1.5 flex flex-col gap-1 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150'
            }
            role="menu"
            aria-label="User Account Options"
          >

            {/* Settings Link */}
            <button
              type="button"
              id="popover-settings"
              onClick={() => {
                setIsUserMenuOpen(false);
                handleNavClick();
                navigate('/settings', { state: { from: location.pathname } });
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold text-hug-text hover:bg-surface-subtle hover:text-primary transition-colors cursor-pointer text-left group"
              role="menuitem"
            >
              <Settings className="w-4 h-4 text-hug-muted group-hover:text-primary transition-colors shrink-0" />
              <span>Settings</span>
            </button>

            {/* Appearance Segmented Control */}
            <div className="p-1 bg-surface-subtle/70 rounded-xl border border-border/50 my-0.5">
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                    theme === 'light'
                      ? 'bg-surface text-hug-text font-bold shadow-2xs border border-border/70'
                      : 'text-hug-muted hover:text-hug-text hover:bg-surface/40'
                  }`}
                  title="Light Mode"
                >
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                  <span>Light</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                    theme === 'dark'
                      ? 'bg-surface text-hug-text font-bold shadow-2xs border border-border/70'
                      : 'text-hug-muted hover:text-hug-text hover:bg-surface/40'
                  }`}
                  title="Dark Mode"
                >
                  <Moon className="w-3.5 h-3.5 text-primary-light" />
                  <span>Dark</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('system')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                    theme === 'system'
                      ? 'bg-surface text-hug-text font-bold shadow-2xs border border-border/70'
                      : 'text-hug-muted hover:text-hug-text hover:bg-surface/40'
                  }`}
                  title="System Preference"
                >
                  <Monitor className="w-3.5 h-3.5" />
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
                navigate('/privacy', { state: { from: location.pathname } });
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold text-hug-text hover:bg-surface-subtle hover:text-primary transition-colors cursor-pointer text-left group"
              role="menuitem"
            >
              <Shield className="w-4 h-4 text-hug-muted group-hover:text-primary transition-colors shrink-0" />
              <span>Privacy &amp; Compliance</span>
            </button>

            <div className="h-px bg-border/60 my-0.5" />

            {/* Sign Out Button (Restrained Red) */}
            <button
              type="button"
              id="popover-signout"
              onClick={() => {
                setIsUserMenuOpen(false);
                setIsSignOutConfirmOpen(true);
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold text-danger hover:bg-danger-bg/50 transition-colors cursor-pointer text-left group"
              role="menuitem"
            >
              <LogOut className="w-4 h-4 group-hover:translate-x-0.5 transition-transform shrink-0" />
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
    <ConfirmDialog
      isOpen={isSignOutConfirmOpen}
      title="Sign out of HUGPONG?"
      message="Your current session will end and you will return to the sign-in page."
      confirmText="Sign Out"
      cancelText="Stay Signed In"
      type="danger"
      isLoading={isSigningOut}
      loadingText="Signing out..."
      onConfirm={handleConfirmSignOut}
      onCancel={() => setIsSignOutConfirmOpen(false)}
    />
    </>
  );
}
