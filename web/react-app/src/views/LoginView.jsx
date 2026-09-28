import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogIn, Eye, EyeOff, Lock, User, AlertCircle, ShieldCheck, RefreshCw, ArrowLeft, Github, Sun, Moon, Monitor } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { ROLE_KEYS } from '../utils/authRouting';
import AccountRecoveryModal from '../components/auth/AccountRecoveryModal';
import FirstLoginVerifyModal from '../components/auth/FirstLoginVerifyModal';
import FirstLoginPasswordModal from '../components/auth/FirstLoginPasswordModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';

const LOGIN_LOCKOUT_STORAGE_KEY = 'hugpong_login_lockout_until';

function storedLoginLockoutUntil() {
  const stored = Number(localStorage.getItem(LOGIN_LOCKOUT_STORAGE_KEY) || 0);
  return Number.isFinite(stored) && stored > Date.now() ? stored : 0;
}

export default function LoginView() {
  const { login, saveSession, isAuthenticated, isLoading, roleKey, sessionExpiredNotice, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [lockoutUntil, setLockoutUntil] = useState(storedLoginLockoutUntil);
  const [lockoutRemaining, setLockoutRemaining] = useState(() => Math.max(0, Math.ceil((storedLoginLockoutUntil() - Date.now()) / 1000)));

  // Modals state
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [pendingAuthUser, setPendingAuthUser] = useState(null);
  const [pendingAuthToken, setPendingAuthToken] = useState(null);
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isSetupSignOutConfirmOpen, setIsSetupSignOutConfirmOpen] = useState(false);
  const [isSetupSigningOut, setIsSetupSigningOut] = useState(false);

  // If already authenticated and verified, redirect to dashboard
  useEffect(() => {
    if (!isLoading && isAuthenticated && roleKey !== ROLE_KEYS.MEMBER_FARMER) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, roleKey]);

  // Security lockout timer
  useEffect(() => {
    if (!lockoutUntil) return undefined;
    const updateRemaining = () => {
      const remaining = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
      setLockoutRemaining(remaining);
      if (remaining === 0) {
        localStorage.removeItem(LOGIN_LOCKOUT_STORAGE_KEY);
        setLockoutUntil(0);
        setErrorMessage('');
      }
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [lockoutUntil]);

  const applyServerLockout = (data = {}) => {
    const serverExpiry = Date.parse(data.lockoutUntil || data.windowResetsAt || '');
    const retrySeconds = Math.max(1, Number(data.retryAfterSeconds || 60));
    const expiry = Number.isFinite(serverExpiry) ? serverExpiry : Date.now() + (retrySeconds * 1000);
    localStorage.setItem(LOGIN_LOCKOUT_STORAGE_KEY, String(expiry));
    setLockoutUntil(expiry);
    setLockoutRemaining(Math.max(1, Math.ceil((expiry - Date.now()) / 1000)));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (lockoutRemaining > 0) {
      setErrorMessage('Too many login attempts. Please try again later.');
      return;
    }

    if (!identifier.trim()) {
      setErrorMessage('User ID or mobile number is required.');
      return;
    }

    if (!password) {
      setErrorMessage('Password is required.');
      return;
    }

    if (!consentChecked) {
      setErrorMessage('Please acknowledge and agree to the Privacy Policy (RA 10173) and Terms to proceed.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await login(identifier.trim(), password);
      localStorage.removeItem(LOGIN_LOCKOUT_STORAGE_KEY);
      setLockoutUntil(0);
      setLockoutRemaining(0);

      // Check for first-login phone verification gate
      if (result.needsVerification) {
        setPendingAuthUser(result.user);
        setPendingAuthToken(result.token);
        setIsSubmitting(false);
        setIsVerifyModalOpen(true);
        return;
      }

      // Check for first-login password change gate
      if (result.needsPasswordChange) {
        setPendingAuthUser(result.user);
        setPendingAuthToken(result.token);
        setIsSubmitting(false);
        setIsPasswordModalOpen(true);
        return;
      }

      // Returning verified user -> proceed to dashboard
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setIsSubmitting(false);
      if (err.code === 'LOGIN_RATE_LIMITED' || err.status === 429) {
        applyServerLockout(err.data);
        setErrorMessage(err.message || 'Too many login attempts. Please try again later.');
      } else {
        setErrorMessage(err.message || 'Invalid User ID or password.');
      }
    }
  };

  // Callback when phone verification succeeds in modal
  const handleVerificationSuccess = (data) => {
    setIsVerifyModalOpen(false);
    const updatedUser = data.user || pendingAuthUser;
    const nextToken = data.token || pendingAuthToken;

    // Check if password change is also needed
    if (updatedUser?.requiresPasswordChange === true && updatedUser?.passwordChanged !== true) {
      setPendingAuthUser(updatedUser);
      setPendingAuthToken(nextToken);
      setIsPasswordModalOpen(true);
    } else {
      // Save fully verified session
      saveSession(updatedUser, updatedUser.roleKey, nextToken);
      navigate('/dashboard', { replace: true });
    }
  };

  // Callback when password change succeeds in modal
  const handlePasswordChangeSuccess = (data) => {
    setIsPasswordModalOpen(false);
    const updatedUser = data.user || pendingAuthUser;
    const nextToken = data.token || pendingAuthToken;
    saveSession(updatedUser, updatedUser.roleKey, nextToken);
    navigate('/dashboard', { replace: true });
  };

  const handleModalCancel = () => {
    setIsSetupSignOutConfirmOpen(true);
  };

  const handleConfirmSetupSignOut = async () => {
    if (isSetupSigningOut) return;
    setIsSetupSigningOut(true);
    try {
      await logout();
      setIsSetupSignOutConfirmOpen(false);
      setIsVerifyModalOpen(false);
      setIsPasswordModalOpen(false);
      setPendingAuthUser(null);
      setPendingAuthToken(null);
    } finally {
      setIsSetupSigningOut(false);
    }
  };

  const handleCancelSetupSignOut = () => {
    if (isSetupSigningOut) return;
    setIsSetupSignOutConfirmOpen(false);
  };

  return (
    <div className="min-h-screen relative flex flex-col justify-between overflow-x-hidden bg-bg text-hug-text selection:bg-primary selection:text-white transition-colors duration-200">
      {/* Subtle Ambient Lighting & Dot Texture Backdrops */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-80 bg-gradient-to-b from-primary/10 via-primary/3 to-transparent blur-3xl pointer-events-none -z-10" />
      <div 
        className="absolute inset-0 bg-[radial-gradient(var(--color-primary,#2d5016)_1px,transparent_1px)] opacity-[0.035] dark:opacity-[0.06] [background-size:24px_24px] pointer-events-none -z-10" 
        aria-hidden="true" 
      />

      {/* Top Header (100% Consistent with Landing Page) */}
      <header className="w-full px-6 sm:px-10 lg:px-16 py-4 flex items-center justify-between border-b border-border relative z-30 bg-surface/90 backdrop-blur-md">
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="brand-logo-box w-10 h-10 rounded-xl bg-white border border-border/80 p-1 flex items-center justify-center shadow-xs overflow-hidden group-hover:border-primary/40 transition-colors">
            <img src="/logo.png" alt="HUGPONG Official Emblem" className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-col">
            <span className="font-display font-black text-xl tracking-tight text-hug-text leading-none">
              HUGPONG
            </span>
            <span className="text-[10px] font-bold text-hug-muted tracking-wider uppercase mt-0.5">
              Sugarcane Digital Governance
            </span>
          </div>
        </Link>

        {/* Navigation Links */}
        <nav className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm font-semibold text-hug-text2">
          <a
            href="https://github.com/Mattaeeee/HUGPONG/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors hidden sm:flex items-center gap-1.5"
          >
            <Github className="w-4 h-4 text-hug-muted shrink-0" />
            <span>GitHub Releases (APK)</span>
          </a>

          <Link
            to="/"
            className="px-5 py-2.5 rounded-xl bg-surface hover:bg-surface-subtle text-hug-text border border-border font-bold transition-all shadow-xs hover:shadow flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4 text-hug-muted" />
            <span>Home</span>
          </Link>

          {/* Theme Switcher: Light / Dark / System (Very Right) */}
          <button
            type="button"
            onClick={cycleTheme}
            className="p-2 sm:p-2.5 rounded-xl border border-border bg-surface text-hug-text2 hover:text-primary hover:bg-surface-subtle transition-colors cursor-pointer flex items-center justify-center shadow-2xs"
            title={'Current theme: ' + theme + '. Click to switch (Light, Dark, System).'}
            aria-label={'Current theme: ' + theme + '. Click to switch.'}
          >
            {theme === 'dark' ? (
              <Moon className="w-4 h-4 text-primary-light" />
            ) : theme === 'light' ? (
              <Sun className="w-4 h-4 text-amber-500" />
            ) : (
              <Monitor className="w-4 h-4 text-hug-muted" />
            )}
          </button>
        </nav>
      </header>

      {/* Main Login Card Container */}
      <main className="flex-1 w-full flex items-center justify-center p-4 sm:p-6 z-20 my-auto">
        <div className="max-w-md w-full bg-surface/95 dark:bg-surface/90 border border-border/90 rounded-3xl p-6 sm:p-8 shadow-xl shadow-black/[0.03] dark:shadow-black/25 backdrop-blur-md transition-all">
        {/* Header */}
        <div className="flex flex-col items-center text-center gap-3 mb-6">
          <div className="brand-logo-box w-14 h-14 rounded-2xl bg-white border border-border/80 p-2 flex items-center justify-center shadow-xs">
            <img src="/logo.png" alt="HUGPONG Official Emblem" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-black text-hug-text tracking-tight">
              Sign In to HUGPONG
            </h1>
            <p className="text-xs font-semibold text-hug-muted mt-1">
              Sugar Regulatory Administration &amp; Farm Console
            </p>
          </div>
        </div>

        {/* Session Expired / Status Notice */}
        {sessionExpiredNotice && (
          <div className="mb-4 p-3 rounded-xl bg-warning-bg text-warning text-xs font-semibold flex items-center gap-2 border border-warning/30 animate-in fade-in duration-200">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{sessionExpiredNotice}</span>
          </div>
        )}

        {/* Error Notice */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-danger-bg text-danger text-xs font-semibold flex items-center gap-2 border border-danger/30 animate-in fade-in duration-200">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* User ID / Contact Number */}
          <div>
            <label className="block text-xs font-bold text-hug-text2 uppercase tracking-wider mb-1.5" htmlFor="contact-input">
              User ID or Mobile Number
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 pointer-events-none text-hug-muted">
                <User className="w-4 h-4" />
              </div>
              <input
                id="contact-input"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g. 03000001 or 09170000003"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-border bg-surface-subtle/80 focus:bg-surface text-sm text-hug-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-medium placeholder:text-hug-muted/70"
                autoComplete="username"
                disabled={isSubmitting || lockoutRemaining > 0}
                required
              />
            </div>
          </div>

          {/* Password Input */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-xs font-bold text-hug-text2 uppercase tracking-wider" htmlFor="password-input">
                Password
              </label>
              <button
                type="button"
                onClick={() => setIsRecoveryModalOpen(true)}
                className="text-[11px] font-bold text-primary hover:underline cursor-pointer transition-colors"
              >
                Lost SIM or Password?
              </button>
            </div>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 pointer-events-none text-hug-muted">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="password-input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-border bg-surface-subtle/80 focus:bg-surface text-sm text-hug-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-medium placeholder:text-hug-muted/70"
                autoComplete="current-password"
                disabled={isSubmitting || lockoutRemaining > 0}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2.5 text-hug-muted hover:text-hug-text cursor-pointer p-1 rounded-md hover:bg-surface transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* RA 10173 Consent Checkbox */}
          <div className="pt-0.5">
            <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-surface-subtle/60 border border-border/60 hover:border-border cursor-pointer select-none text-[11px] text-hug-text2 transition-colors">
              <input
                type="checkbox"
                id="login-consent-checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-0.5 rounded border-border text-primary focus:ring-primary focus:ring-offset-0 focus:outline-none h-4 w-4 shrink-0 accent-primary cursor-pointer"
              />
              <span className="leading-snug">
                I acknowledge that my session and records are processed under the{' '}
                <Link to="/privacy" target="_blank" className="text-primary font-bold hover:underline">
                  Privacy Policy (RA 10173)
                </Link>{' '}
                and{' '}
                <Link to="/terms" target="_blank" className="text-primary font-bold hover:underline">
                  Terms
                </Link>.
              </span>
            </label>
          </div>

          {/* Submit Button */}
          <button
            id="submit-btn"
            type="submit"
            disabled={isSubmitting || lockoutRemaining > 0}
            className="w-full bg-primary hover:bg-primary-hover text-white font-bold text-sm rounded-xl py-3 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer shadow-sm hover:shadow active:scale-[0.99]"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>{lockoutRemaining > 0 ? 'Try Again Later' : 'Sign In'}</span>
              </>
            )}
          </button>
        </form>

        {/* Security Gateway Badge */}
        <div className="flex items-center justify-center gap-2 pt-4 text-[11px] font-semibold text-hug-muted border-t border-border mt-5">
          <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0" />
          <span>Authenticated HUGPONG session</span>
        </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full px-6 sm:px-10 lg:px-16 py-4 sm:py-5 border-t border-border flex flex-col md:flex-row items-center justify-between gap-3 text-xs font-semibold text-hug-muted relative z-30 bg-surface/90 backdrop-blur-md">
        <p>&copy; 2026 HUGPONG Agricultural Platform.</p>
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy (RA 10173)</Link>
          <Link to="/terms" className="hover:text-primary transition-colors">Terms of Use</Link>
          <Link to="/compliance" className="hover:text-primary transition-colors">Compliance</Link>
          <Link to="/cookies" className="hover:text-primary transition-colors">Cookie Policy</Link>
        </div>
      </footer>

      {/* Account Recovery Advisory Modal */}
      <AccountRecoveryModal
        isOpen={isRecoveryModalOpen}
        onClose={() => setIsRecoveryModalOpen(false)}
      />

      {/* First-Login Phone Verification Modal */}
      <FirstLoginVerifyModal
        isOpen={isVerifyModalOpen}
        pendingUser={pendingAuthUser}
        pendingToken={pendingAuthToken}
        onVerificationSuccess={handleVerificationSuccess}
        onCancel={handleModalCancel}
      />

      {/* First-Login Password Change Modal */}
      <FirstLoginPasswordModal
        isOpen={isPasswordModalOpen}
        pendingUser={pendingAuthUser}
        pendingToken={pendingAuthToken}
        onPasswordChangeSuccess={handlePasswordChangeSuccess}
        onCancel={handleModalCancel}
      />

      <ConfirmDialog
        isOpen={isSetupSignOutConfirmOpen}
        title="Sign out and stop account setup?"
        message="Your current setup session will end. You can sign in again later to finish verification or update your password."
        confirmText="Sign Out"
        cancelText="Continue Setup"
        type="danger"
        isLoading={isSetupSigningOut}
        loadingText="Signing out..."
        onConfirm={handleConfirmSetupSignOut}
        onCancel={handleCancelSetupSignOut}
      />
    </div>
  );
}
