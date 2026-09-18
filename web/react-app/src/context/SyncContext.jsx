import React, { createContext, useContext, useState, useEffect, useCallback, useTransition } from 'react';

const SyncContext = createContext({
  isOnline: true,
  syncStatus: 'idle', // 'idle' | 'syncing' | 'failed' | 'offline'
  lastSyncedAt: null,
  activeOperationsCount: 0,
  beginSync: () => {},
  endSync: () => {}
});

export function SyncProvider({ children }) {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [activeOperationsCount, setActiveOperationsCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [hasSyncError, setHasSyncError] = useState(false);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const beginSync = useCallback(() => {
    setActiveOperationsCount(prev => prev + 1);
    setHasSyncError(false);
  }, []);

  const endSync = useCallback((success = true) => {
    setActiveOperationsCount(prev => Math.max(0, prev - 1));
    if (success) {
      setLastSyncedAt(new Date());
      setHasSyncError(false);
    } else {
      setHasSyncError(true);
    }
  }, []);

  let syncStatus = 'idle';
  if (!isOnline) {
    syncStatus = 'offline';
  } else if (activeOperationsCount > 0) {
    syncStatus = 'syncing';
  } else if (hasSyncError) {
    syncStatus = 'failed';
  }

  return (
    <SyncContext.Provider
      value={{
        isOnline,
        syncStatus,
        lastSyncedAt,
        activeOperationsCount,
        beginSync,
        endSync
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  return useContext(SyncContext);
}
