import React, { createContext, useContext, useState, useEffect } from 'react';

const SyncContext = createContext({
  isOnline: true,
  networkOnline: true,
  apiReachable: null,
  syncStatus: 'idle' // Browser plus HUGPONG API reachability.
});

export function SyncProvider({ children }) {
  const [networkOnline, setNetworkOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [apiReachable, setApiReachable] = useState(null);

  useEffect(() => {
    let active = true;
    let inFlight = false;

    async function probeApi() {
      if (!navigator.onLine) {
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
        if (active) setApiReachable(response.ok && result.success === true);
      } catch {
        if (active) setApiReachable(false);
      } finally {
        window.clearTimeout(timeout);
        inFlight = false;
      }
    }

    function handleOnline() {
      setNetworkOnline(true);
      setApiReachable(null);
      probeApi();
    }
    function handleOffline() {
      setNetworkOnline(false);
      setApiReachable(false);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', probeApi);
    probeApi();
    const interval = window.setInterval(probeApi, 30000);

    return () => {
      active = false;
      window.clearInterval(interval);
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
        syncStatus
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  return useContext(SyncContext);
}
