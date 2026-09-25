import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { roleKeyFromUser } from '../utils/authRouting';
import { signInWithCustomTokenSilently, signOutFirebase } from '../services/firebaseClient';
import { getWebClientInstanceId, reportWebActivity } from '../services/telemetryService';

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

  const saveSession = useCallback((sessionUser, canonicalRoleKey, token) => {
    setUser(sessionUser);
    setRoleKey(canonicalRoleKey);
    setSessionExpiredNotice('');
    if (token) localStorage.setItem('hugpong_auth_token', token);
    if (sessionUser) localStorage.setItem('hugpong_user', JSON.stringify(sessionUser));
    if (canonicalRoleKey) localStorage.setItem('hugpong_role', canonicalRoleKey);
  }, []);

  const refreshSession = useCallback(async () => {
    const existingToken = localStorage.getItem('hugpong_auth_token');
    try {
      const response = await fetch('/auth/session', {
        headers: {
          Authorization: `Bearer ${existingToken || ''}`,
          'x-client-platform': 'web'
        },
        credentials: 'include'
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok && data.authenticated && data.user) {
        const resolvedRole = roleKeyFromUser(data.user, data.roleKey);
        saveSession(data.user, resolvedRole, data.token || existingToken);
        if (data.firebaseCustomToken) {
          await signInWithCustomTokenSilently(data.firebaseCustomToken).catch(() => {});
        }
        return { user: data.user, roleKey: resolvedRole, authenticated: true };
      } else {
        if (existingToken) {
          clearSession('Your session expired. Please sign in again.');
        } else {
          clearSession();
        }
        return { user: null, roleKey: '', authenticated: false };
      }
    } catch (err) {
      console.warn('[AuthContext] Session resolution error:', err.message);
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
    if (!user) return undefined;
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
  }, [user?.employeeId]);

  const login = async (contactNumber, password) => {
    setSessionExpiredNotice('');
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-platform': 'web',
        'x-client-instance-id': getWebClientInstanceId()
      },
      body: JSON.stringify({ contactNumber, password, clientPlatform: 'web' }),
      credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Authentication failed. Please verify your credentials.');
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
      saveSession(data.user, resolvedRole, data.token);
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
    const token = authToken || localStorage.getItem('hugpong_auth_token');
    const res = await fetch('/auth/request-phone-verification', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to dispatch verification code.');
    }
    return data;
  };

  const verifyPhone = async (code, authToken) => {
    const token = authToken || localStorage.getItem('hugpong_auth_token');
    const res = await fetch('/auth/verify-phone', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ code }),
      credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Phone verification failed.');
    }

    if (data.user) {
      setUser(prev => ({ ...prev, ...data.user, phoneVerified: true, pendingFirstLoginVerification: false }));
    }
    return data;
  };

  const changePassword = async (newPassword, authToken) => {
    const token = authToken || localStorage.getItem('hugpong_auth_token');
    const res = await fetch('/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ newPassword }),
      credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Password update failed.');
    }

    if (data.user) {
      setUser(prev => ({ ...prev, ...data.user, requiresPasswordChange: false, passwordChanged: true }));
    }
    return data;
  };

  const logout = async () => {
    try {
      await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (e) {
      console.warn('[AuthContext] Logout warning:', e);
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
