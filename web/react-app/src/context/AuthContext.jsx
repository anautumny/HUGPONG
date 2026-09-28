import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { roleKeyFromUser } from '../utils/authRouting';
import { signInWithCustomTokenSilently, signOutFirebase } from '../services/firebaseClient';
import { getWebClientInstanceId, reportWebActivity } from '../services/telemetryService';
import { responseErrorFromPayload, webClientHeaders } from '../services/apiClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('hugpong_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [roleKey, setRoleKey] = useState(() => {
    return localStorage.getItem('hugpong_role') || '';
  });
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const clearSession = useCallback((notice = '') => {
    setUser(null);
    setRoleKey('');
    if (notice) setSessionExpiredNotice(notice);
    localStorage.removeItem('hugpong_auth_token');
    localStorage.removeItem('hugpong_user');
    localStorage.removeItem('hugpong_role');
    signOutFirebase().catch(() => {});
  }, []);

  const saveSession = useCallback((sessionUser, canonicalRoleKey) => {
    setUser(sessionUser);
    setRoleKey(canonicalRoleKey);
    setSessionExpiredNotice('');
    // Browser authentication is held only in the server's HttpOnly cookie.
    // Remove any token left by an older client build.
    localStorage.removeItem('hugpong_auth_token');
    if (sessionUser) localStorage.setItem('hugpong_user', JSON.stringify(sessionUser));
    if (canonicalRoleKey) localStorage.setItem('hugpong_role', canonicalRoleKey);
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch('/auth/session', {
        headers: webClientHeaders(),
        credentials: 'include'
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok && data.authenticated && data.user) {
        const resolvedRole = roleKeyFromUser(data.user, data.roleKey);
        saveSession(data.user, resolvedRole);
        if (data.firebaseCustomToken) {
          await signInWithCustomTokenSilently(data.firebaseCustomToken).catch(() => {});
        }
        return { user: data.user, roleKey: resolvedRole, authenticated: true };
      } else if (response.status === 401 || response.status === 403 || response.ok) {
        if (user) {
          clearSession(responseErrorFromPayload(data, response.status, 'Your session expired. Please sign in again.').message);
        } else {
          clearSession();
        }
        return { user: null, roleKey: '', authenticated: false };
      } else {
        // A gateway/API outage is not an authentication decision. Keep the
        // previously issued local session and let the connectivity UI explain
        // that live, server-authoritative actions are temporarily unavailable.
        console.warn(`[AuthContext] Session endpoint unavailable (${response.status}); retaining cached session.`);
        return { user, roleKey, authenticated: Boolean(user) };
      }
    } catch (err) {
      console.warn('[AuthContext] Session resolution is temporarily unavailable.');
      // If server unreachable, retain cached session for offline degradation if previously saved
      return { user, roleKey, authenticated: Boolean(user) };
    } finally {
      setIsLoading(false);
    }
  }, [clearSession, saveSession, user, roleKey]);

  useEffect(() => {
    refreshSession();
  }, []);

  useEffect(() => {
    const handleRevokedSession = event => {
      clearSession(event?.detail?.message || 'Your session ended. Please sign in again.');
    };
    window.addEventListener('hugpong:session-revoked', handleRevokedSession);
    return () => window.removeEventListener('hugpong:session-revoked', handleRevokedSession);
  }, [clearSession]);

  useEffect(() => {
    // A cached user can exist briefly while the server cookie is being
    // validated. Wait for that authoritative check so an expired browser
    // session does not generate a second, avoidable telemetry 401.
    if (isLoading || !user) return undefined;
    const report = () => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) {
        reportWebActivity().catch(() => {});
      }
    };
    report();
    const interval = window.setInterval(report, 5 * 60 * 1000);
    const onVisibility = () => report();
    window.addEventListener('focus', report);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', report);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isLoading, user?.employeeId]);

  const login = async (contactNumber, password) => {
    setSessionExpiredNotice('');
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...webClientHeaders(),
        'x-client-instance-id': getWebClientInstanceId()
      },
      body: JSON.stringify({ contactNumber, password, clientPlatform: 'web' }),
      credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      throw responseErrorFromPayload(data, res.status, 'Authentication failed. Check your sign-in details and try again.');
    }

    const resolvedRole = roleKeyFromUser(data.user, data.roleKey);
    if (resolvedRole === 'member') {
      try {
        await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
      } finally {
        clearSession();
      }
      throw new Error('Farm Member accounts are restricted to the HUGPONG mobile application.');
    }
    if (data.firebaseCustomToken) {
      await signInWithCustomTokenSilently(data.firebaseCustomToken).catch(() => {});
    }

    // Check verification and password change requirements
    const isVerified = data.user && data.user.phoneVerified === true;
    const isSuperAdminDefault =
      data.user &&
      (data.user.role === 'Super Admin' || resolvedRole === 'superadmin') &&
      data.user.phoneVerified !== false;
    const needsVerification =
      data.user &&
      (data.user.phoneVerified === false ||
        data.user.pendingFirstLoginVerification === true ||
        (!isVerified && !isSuperAdminDefault));
    const needsPasswordChange =
      data.user && data.user.requiresPasswordChange === true && data.user.passwordChanged !== true;

    if (!needsVerification && !needsPasswordChange) {
      saveSession(data.user, resolvedRole);
    }

    return {
      user: data.user,
      roleKey: resolvedRole,
      token: data.token,
      needsVerification,
      needsPasswordChange
    };
  };

  const requestPhoneVerification = async (authToken) => {
    const token = authToken || '';
    const res = await fetch('/auth/request-phone-verification', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...webClientHeaders(),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw responseErrorFromPayload(data, res.status, 'The verification code could not be sent.');
    }
    return data;
  };

  const verifyPhone = async (code, authToken) => {
    const token = authToken || '';
    const res = await fetch('/auth/verify-phone', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...webClientHeaders(),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ code }),
      credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw responseErrorFromPayload(data, res.status, 'Phone verification failed.');
    }

    if (data.user) {
      setUser(prev => ({ ...prev, ...data.user, phoneVerified: true, pendingFirstLoginVerification: false }));
    }
    return data;
  };

  const changePassword = async (newPassword, authToken, sessionAction = 'KEEP_CURRENT') => {
    const token = authToken || '';
    const res = await fetch('/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...webClientHeaders(),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ newPassword, sessionAction }),
      credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw responseErrorFromPayload(data, res.status, 'Password update failed.');
    }

    if (data.signOutRequired === true) {
      clearSession('Your password was changed and all devices were signed out. Sign in with your new password.');
    } else if (data.user) {
      setUser(prev => ({ ...prev, ...data.user, requiresPasswordChange: false, passwordChanged: true }));
    }
    return data;
  };

  const logout = async () => {
    try {
      await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (e) {
      console.warn('[AuthContext] Remote sign-out was not acknowledged.');
    } finally {
      clearSession();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        roleKey,
        isAuthenticated: Boolean(user && user.phoneVerified !== false && (user.requiresPasswordChange !== true || user.passwordChanged === true)),
        hasPendingVerificationUser: user,
        sessionExpiredNotice,
        isLoading,
        login,
        logout,
        requestPhoneVerification,
        verifyPhone,
        changePassword,
        refreshSession,
        saveSession,
        clearSession
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
