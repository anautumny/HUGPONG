import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { announceConnectionRestored } from '../services/apiClient';
import { flushCropStageOutbox } from '../services/cropStageOutbox';

const SyncContext = createContext({
  isOnline: true,
  networkOnline: true,
  apiReachable: null,
  syncStatus: 'idle', // Browser plus HUGPONG API reachability.
  reconnectNotice: null,
  dismissReconnectNotice: () => {}
});

export function SyncProvider({ children }) {
  const { user } = useAuth();
  const [networkOnline, setNetworkOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [apiReachable, setApiReachable] = useState(null);
  const [reconnectNotice, setReconnectNotice] = useState(null);
  const userRef = useRef(user);
  const reconnectPendingRef = useRef(false);
  const noticeTimerRef = useRef(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    let active = true;
    let inFlight = false;

    async function finishReconnect() {
      const startedAt = Date.now();
      setReconnectNotice({ phase: 'reconnecting' });
      let outboxResult = { processed: 0, remaining: 0, failedEntry: null };
      try {
        outboxResult = await flushCropStageOutbox(userRef.current || {});
      } catch (error) {
        outboxResult = { processed: 0, remaining: 1, failedEntry: { lastError: error.message } };
      }
      if (!active) return;
      const remainingLoadingMs = Math.max(0, 600 - (Date.now() - startedAt));
      if (remainingLoadingMs > 0) {
        await new Promise(resolve => window.setTimeout(resolve, remainingLoadingMs));
      }
      if (!active) return;
      announceConnectionRestored();
      const needsAttention = Number(outboxResult.remaining || 0) > 0 || Boolean(outboxResult.failedEntry);
      setReconnectNotice({
        phase: needsAttention ? 'attention' : 'restored',
        processedCount: Number(outboxResult.processed || 0),
        remainingCount: Number(outboxResult.remaining || 0)
      });
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
      if (!needsAttention) {
        noticeTimerRef.current = window.setTimeout(() => setReconnectNotice(null), 5000);
      }
    }

    async function probeApi() {
      if (!navigator.onLine) {
        reconnectPendingRef.current = true;
        if (active) setApiReachable(false);
        return;
      }
      if (inFlight) return;
      inFlight = true;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch('/health', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
        const result = await response.json().catch(() => ({}));
        const reachable = response.ok && result.success === true;
        if (active) setApiReachable(reachable);
        if (reachable && reconnectPendingRef.current) {
          reconnectPendingRef.current = false;
          await finishReconnect();
        } else if (!reachable) {
          reconnectPendingRef.current = true;
          if (active) setReconnectNotice(previous => previous?.phase === 'reconnecting' ? { phase: 'failed' } : previous);
        }
      } catch {
        reconnectPendingRef.current = true;
        if (active) {
          setApiReachable(false);
          setReconnectNotice(previous => previous?.phase === 'reconnecting' ? { phase: 'failed' } : previous);
        }
      } finally {
        window.clearTimeout(timeout);
        inFlight = false;
      }
    }

    function handleOnline() {
      setNetworkOnline(true);
      setApiReachable(null);
      if (reconnectPendingRef.current) setReconnectNotice({ phase: 'reconnecting' });
      probeApi();
    }
    function handleOffline() {
      reconnectPendingRef.current = true;
      setNetworkOnline(false);
      setApiReachable(false);
      setReconnectNotice(null);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', probeApi);
    probeApi();
    const interval = window.setInterval(probeApi, 2 * 60 * 1000);

    return () => {
      active = false;
      window.clearInterval(interval);
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', probeApi);
    };
  }, []);

  const isOnline = networkOnline && apiReachable !== false;
  const syncStatus = !networkOnline
    ? 'offline'
    : apiReachable === null
      ? 'syncing'
      : apiReachable
        ? 'idle'
        : 'failed';

  return (
    <SyncContext.Provider
      value={{
        isOnline,
        networkOnline,
        apiReachable,
        syncStatus,
        reconnectNotice,
        dismissReconnectNotice: () => setReconnectNotice(null)
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  return useContext(SyncContext);
}
