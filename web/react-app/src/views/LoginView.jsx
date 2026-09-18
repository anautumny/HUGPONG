import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogIn, Eye, EyeOff, Lock, AlertCircle, ShieldCheck, RefreshCw, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ROLE_KEYS } from '../utils/authRouting';
import AccountRecoveryModal from '../components/auth/AccountRecoveryModal';
import FirstLoginVerifyModal from '../components/auth/FirstLoginVerifyModal';
import FirstLoginPasswordModal from '../components/auth/FirstLoginPasswordModal';

export default function LoginView() {
  const { login, saveSession, isAuthenticated, sessionExpiredNotice, clearSession } = useAuth();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  // Modals state
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [pendingAuthUser, setPendingAuthUser] = useState(null);
  const [pendingAuthToken, setPendingAuthToken] = useState(null);
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  // If already authenticated and verified, redirect to dashboard
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Security lockout timer
  useEffect(() => {
    if (lockoutRemaining <= 0) return;
    const timer = setInterval(() => {
      setLockoutRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutRemaining]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (lockoutRemaining > 0) {
      setErrorMessage(`Security lockout active: Please wait ${lockoutRemaining} seconds before retrying.`);
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

      // Check if user is Member Farmer
      if (result.roleKey === ROLE_KEYS.MEMBER_FARMER) {
        setIsSubmitting(false);
        setErrorMessage('Member Farmer accounts use the HUGPONG mobile application.');
        return;
      }

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
      const nextFail = failedAttempts + 1;
      setFailedAttempts(nextFail);

      if (nextFail >= 5) {
        setLockoutRemaining(60);
        setErrorMessage('Too many failed login attempts. Access temporarily locked for 60 seconds.');
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
    setIsVerifyModalOpen(false);
    setIsPasswordModalOpen(false);
    setPendingAuthUser(null);
    setPendingAuthToken(null);
    clearSession();
  };

  // Quick Shell Preview for testing different roles
  const handleQuickRoleSwitch = (roleKey, name, phoneNum) => {
    const mockUser = {
      employeeId: `DEV-${roleKey.toUpperCase()}`,
      name,
      phone: phoneNum,
      canonicalRole: roleKey,
      role: roleKey === ROLE_KEYS.SUPER_ADMIN ? 'Super Admin' : roleKey === ROLE_KEYS.FARM_MANAGER ? 'Farm Manager' : 'SRA Admin',
      phoneVerified: true,
      passwordChanged: true
    };
    saveSession(mockUser, roleKey, 'dev-mock-session-token');
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col justify-between items-center p-4 sm:p-6 bg-bg text-hug-text selection:bg-primary selection:text-white">
      {/* Top Brand Link */}
      <div className="w-full max-w-md pt-4 flex justify-between items-center">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-hug-muted hover:text-hug-text transition-colors"
          aria-label="Back to landing page"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back</span>
        </Link>
        <span className="text-[11px] font-bold text-hug-muted uppercase tracking-wider">
          SRA Gateway
        </span>
      </div>

      {/* Main Login Card */}
      <div className="max-w-md w-full my-auto bg-surface border border-border rounded-2xl p-6 sm:p-8 shadow-sm">
        {/* Header */}
        <div className="flex flex-col items-center text-center gap-3 mb-6">
          <div className="brand-logo-box w-12 h-12 rounded-xl bg-white border border-border/80 p-1.5 flex items-center justify-center shadow-xs">
            <img src="/logo.png" alt="HUGPONG Official Emblem" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-black text-hug-text tracking-tight">
              Sign In to HUGPONG
            </h1>
            <p className="text-xs font-semibold text-hug-muted mt-0.5">
              Sugar Regulatory Administration &amp; Farm Console
            </p>
          </div>
        </div>

        {/* Session Expired / Status Notice */}
        {sessionExpiredNotice && (
          <div className="mb-4 p-3 rounded-xl bg-warning-bg text-warning text-xs font-medium flex items-center gap-2 border border-warning/30">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{sessionExpiredNotice}</span>
          </div>
        )}

        {/* Error Notice */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-danger-bg text-danger text-xs font-medium flex items-center gap-2 border border-danger/30">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* User ID / Contact Number */}
          <div>
            <label className="block text-xs font-semibold text-hug-text2 mb-1.5" htmlFor="contact-input">
              User ID or Mobile Number
            </label>
            <input
              id="contact-input"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="e.g. 03000001 or 09170000003"
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-surface-subtle text-sm text-hug-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono"
              autoComplete="username"
              disabled={isSubmitting || lockoutRemaining > 0}
              required
            />
          </div>

          {/* Password Input */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-xs font-semibold text-hug-text2" htmlFor="password-input">
                Password
              </label>
              <button
                type="button"
                onClick={() => setIsRecoveryModalOpen(true)}
                className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
              >
                Lost SIM or Password?
              </button>
            </div>
            <div className="relative">
              <input
                id="password-input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-border bg-surface-subtle text-sm text-hug-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                autoComplete="current-password"
                disabled={isSubmitting || lockoutRemaining > 0}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-hug-muted hover:text-hug-text cursor-pointer p-1"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* RA 10173 Consent Checkbox */}
          <div className="pt-1">
            <label className="flex items-start gap-2.5 cursor-pointer select-none text-[11px] text-hug-text2">
              <input
                type="checkbox"
                id="login-consent-checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-0.5 rounded border-border text-primary focus:ring-primary focus:ring-offset-0 focus:outline-none h-3.5 w-3.5 shrink-0"
              />
              <span className="leading-tight">
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
            className="w-full bg-primary hover:bg-primary-hover text-white font-bold text-sm rounded-xl py-3 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer shadow-xs hover:shadow"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>{lockoutRemaining > 0 ? `Locked (${lockoutRemaining}s)` : 'Sign In'}</span>
              </>
            )}
          </button>
        </form>

        {/* Security Gateway Badge */}
        <div className="flex items-center justify-center gap-2 pt-4 text-[11px] text-hug-muted border-t border-border mt-4">
          <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0" />
          <span>Encrypted Session &middot; SRA Certified Gateway</span>
        </div>

        {/* Quick Shell Preview Switcher for Development / Batch Verification */}
        <div className="mt-5 pt-4 border-t border-border">
          <p className="text-[10px] font-bold text-hug-muted uppercase tracking-wider mb-2 text-center">
            Development Role Preview
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => handleQuickRoleSwitch(ROLE_KEYS.FARM_MANAGER, 'Jose Reyes', '09170000003')}
              className="px-2 py-1.5 rounded-lg border border-border bg-surface-subtle hover:bg-surface hover:border-primary/50 text-[11px] font-semibold text-hug-text2 hover:text-primary transition-colors text-center cursor-pointer"
            >
              Farm Manager
            </button>
            <button
              type="button"
              onClick={() => handleQuickRoleSwitch(ROLE_KEYS.SRA_ADMIN, 'Maria Santos', '09170000002')}
              className="px-2 py-1.5 rounded-lg border border-border bg-surface-subtle hover:bg-surface hover:border-primary/50 text-[11px] font-semibold text-hug-text2 hover:text-primary transition-colors text-center cursor-pointer"
            >
              SRA Admin
            </button>
            <button
              type="button"
              onClick={() => handleQuickRoleSwitch(ROLE_KEYS.SUPER_ADMIN, 'Super Admin', '09170000001')}
              className="px-2 py-1.5 rounded-lg border border-border bg-surface-subtle hover:bg-surface hover:border-primary/50 text-[11px] font-semibold text-hug-text2 hover:text-primary transition-colors text-center cursor-pointer"
            >
              Super Admin
            </button>
          </div>
        </div>
      </div>

      {/* Footer Legal Links */}
      <div className="flex flex-col items-center gap-2 py-4 text-xs text-hug-muted text-center">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
          <span>&middot;</span>
          <Link to="/terms" className="hover:text-primary transition-colors">Terms of Use</Link>
          <span>&middot;</span>
          <Link to="/cookies" className="hover:text-primary transition-colors">Cookie Policy</Link>
        </div>
        <p className="text-[11px]">
          Silay Sugar Regulatory Administration &middot; Cloud-Synchronized Network
        </p>
      </div>

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
    </div>
  );
}
