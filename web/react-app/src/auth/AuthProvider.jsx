import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as platform from '../services/platformAdapter';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [status, setStatus] = useState('resolving');
  const [session, setSession] = useState(null);

  useEffect(() => {
    let active = true;
    platform.restoreSession()
      .then(restored => {
        if (!active) return;
        setSession(restored);
        setStatus(restored ? 'authenticated' : 'guest');
      })
      .catch(() => {
        if (!active) return;
        setSession(null);
        setStatus('guest');
      });
    return () => { active = false; };
  }, []);

  const signIn = useCallback(async (identifier, password) => {
    const result = await platform.login(identifier, password);
    if (!result.completionRequired) {
      setSession(result);
      setStatus('authenticated');
    }
    return result;
  }, []);

  const requestFirstLoginOtp = useCallback(pending => platform.requestFirstLoginOtp(pending), []);

  const verifyFirstLoginOtp = useCallback(async (pending, code) => {
    const result = await platform.verifyFirstLoginOtp(pending, code);
    if (!result.completionRequired) {
      setSession(result);
      setStatus('authenticated');
    }
    return result;
  }, []);

  const completeFirstLoginPassword = useCallback(async (pending, newPassword) => {
    const result = await platform.completeFirstLoginPassword(pending, newPassword);
    if (!result.completionRequired) {
      setSession(result);
      setStatus('authenticated');
    }
    return result;
  }, []);

  const signOut = useCallback(async () => {
    await platform.logout();
    setSession(null);
    setStatus('guest');
  }, []);

  const value = useMemo(() => ({
    status, session, signIn, signOut, requestFirstLoginOtp, verifyFirstLoginOtp, completeFirstLoginPassword
  }), [status, session, signIn, signOut, requestFirstLoginOtp, verifyFirstLoginOtp, completeFirstLoginPassword]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider.');
  return value;
}
