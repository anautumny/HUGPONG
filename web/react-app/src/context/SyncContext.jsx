import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { announceConnectionRestored } from '../services/apiClient';
import { flushCropStageOutbox } from '../services/cropStageOutbox';
import { API_STARTUP_TIMEOUT_MS, API_RECOVERY_RETRY_MS } from '../services/connectivityPolicy';

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
    let retryTimer = null;
    let activeController = null;

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
      if (!active) return;
      if (!navigator.onLine) {
        reconnectPendingRef.current = true;
        if (active) setApiReachable(false);
        return;
      }
      if (inFlight) return;
      window.clearTimeout(retryTimer);
      inFlight = true;
      const controller = new AbortController();
      activeController = controller;
      const timeout = window.setTimeout(() => controller.abort(), API_STARTUP_TIMEOUT_MS);
      try {
        const response = await fetch('/health/ready', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
        const result = await response.json().catch(() => ({}));
        const reachable = response.ok && result.success === true && result.status === 'ready';
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
        activeController = null;
        inFlight = false;
        if (active && navigator.onLine && reconnectPendingRef.current) {
          retryTimer = window.setTimeout(probeApi, API_RECOVERY_RETRY_MS);
        }
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
      activeController?.abort();
      window.clearTimeout(retryTimer);
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
