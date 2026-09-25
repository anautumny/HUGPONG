import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ROLE_KEYS } from '../../utils/authRouting';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import MobileBottomNav from './MobileBottomNav';

const STORAGE_COLLAPSED_KEY = 'hugpong_sidebar_collapsed';

export default function AppShell() {
  const { user, roleKey, isAuthenticated, isLoading, logout } = useAuth();
  const navigate = useNavigate();
  const [isReturningToLogin, setIsReturningToLogin] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const location = useLocation();

  // Close mobile drawer whenever route changes
  useEffect(() => {
    setIsMobileDrawerOpen(false);
  }, [location.pathname]);

  // Handle keyboard events: Escape closes drawer, Ctrl+B toggles sidebar
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isMobileDrawerOpen) {
        e.preventDefault();
        setIsMobileDrawerOpen(false);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        handleToggleCollapse();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileDrawerOpen]);

  const handleToggleCollapse = useCallback(() => {
    setIsCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_COLLAPSED_KEY, String(next));
      } catch (err) {
        console.warn('[AppShell] localStorage error:', err);
      }
      return next;
    });
  }, []);

  const handleReturnToLogin = async () => {
    if (isReturningToLogin) return;
    setIsReturningToLogin(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setIsReturningToLogin(false);
    }
  };

  // Show clean loading skeleton while session resolves
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg text-hug-text">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-surface border border-border p-1.5 flex items-center justify-center shadow-xs">
            <img src="/logo.png" alt="HUGPONG" className="w-full h-full object-contain animate-pulse" />
          </div>
          <p className="text-xs font-semibold text-hug-muted">Resolving HUGPONG Security Session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // If user is Farm Member, redirect with explanation (Farm Member is mobile-only in Stage 7)
  if (isAuthenticated && roleKey === ROLE_KEYS.MEMBER_FARMER) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg p-6 text-hug-text">
        <div className="max-w-md w-full bg-surface border border-border rounded-2xl p-6 text-center shadow-lg">
          <h2 className="text-lg font-bold text-primary mb-2">Mobile Access Only</h2>
          <p className="text-sm text-hug-text2 mb-4">
            Farm Member accounts use the HUGPONG mobile application for field management and harvest monitoring.
          </p>
          <button
            type="button"
            onClick={handleReturnToLogin}
            disabled={isReturningToLogin}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl shadow-xs hover:bg-primary-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isReturningToLogin && (
              <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden="true" />
            )}
            {isReturningToLogin ? 'Signing out...' : 'Return to Login'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-hug-text font-sans print:h-auto print:overflow-visible print:bg-white print:block">
      {/* Desktop Persistent Sidebar */}
      <div className="hidden lg:block h-full flex-shrink-0 print:hidden no-print">
        <Sidebar
          isCollapsed={isCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />
      </div>

      {/* Mobile Drawer (<= 1024px) */}
      {isMobileDrawerOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex print:hidden no-print"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation"
        >
          {/* Backdrop overlay with blur */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-200"
            onClick={() => setIsMobileDrawerOpen(false)}
            aria-hidden="true"
          />

          {/* Sliding Drawer Container */}
          <div className="relative z-10 h-full w-64 max-w-[80vw] shadow-2xl flex flex-col bg-white dark:bg-surface">
            <Sidebar
              isCollapsed={false}
              isMobileDrawer={true}
              onCloseMobileDrawer={() => setIsMobileDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden print:h-auto print:overflow-visible print:block">
        <div className="print:hidden no-print">
          <Topbar onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)} />
        </div>

        {/* Page Content Outlet without forced card wrapping */}
        <main
          id="page-content"
          className="flex-1 min-w-0 w-full overflow-y-auto p-4 sm:p-6 pb-20 lg:pb-6 focus:outline-none print:p-0 print:m-0 print:overflow-visible print:h-auto print:block"
          tabIndex={-1}
        >
          <Outlet />
        </main>

        {/* Responsive Mobile Bottom Navigation Bar (<= 1024px) */}
        <MobileBottomNav onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)} />
      </div>
    </div>
  );
}
