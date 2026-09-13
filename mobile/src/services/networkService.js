/**
 * networkService.js — Real-Time Network & Connectivity Monitor for HUGPONG
 * Handles connectivity detection, offline mode transitions, and automatic sync triggers.
 */

let currentNetworkOnline = true;
let listeners = [];
let checkInterval = null;
let onReconnectCallback = null;

export const setOnReconnectCallback = (cb) => {
  onReconnectCallback = cb;
};

export const getNetworkStatus = () => currentNetworkOnline;
export const isOnline = () => currentNetworkOnline;

export const subscribeToNetwork = (listener) => {
  listeners.push(listener);
  listener(currentNetworkOnline);
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
};

export const addNetworkListener = subscribeToNetwork;

const notifyListeners = (status) => {
  listeners.forEach(l => {
    try {
      l(status);
    } catch (e) {
      console.warn('[networkService] Listener error:', e);
    }
  });
};

export const setNetworkStatus = (newStatus, forceTrigger = false) => {
  const prev = currentNetworkOnline;
  currentNetworkOnline = Boolean(newStatus);
  if (prev !== currentNetworkOnline) {
    notifyListeners(currentNetworkOnline);
  }
  if (currentNetworkOnline && (!prev || forceTrigger)) {
    if (typeof onReconnectCallback === 'function') {
      try {
        onReconnectCallback();
      } catch (e) {
        console.warn('[networkService] Auto-sync callback error:', e);
      }
    }
  }
};

/**
 * Actively tests connectivity via a fast lightweight ping
 */
export const checkConnectivity = async (timeoutMs = 4000) => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Test connectivity using Google / SRA endpoint / fast DNS
    const res = await fetch('https://clients3.google.com/generate_204', {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store'
    });
    clearTimeout(timer);

    const online = res.status === 204 || res.ok;
    setNetworkStatus(online);
    return online;
  } catch (err) {
    // If fetch failed or timed out, we are offline
    setNetworkStatus(false);
    return false;
  }
};

/**
 * Starts background network heartbeat monitoring and auto-sync triggers
 */
export const startNetworkMonitor = (intervalMs = 15000) => {
  if (checkInterval) clearInterval(checkInterval);
  // Initial connectivity check + trigger auto-sync if online
  checkConnectivity().then(online => {
    if (online && typeof onReconnectCallback === 'function') {
      try {
        onReconnectCallback();
      } catch (_) {}
    }
  });
  checkInterval = setInterval(() => {
    checkConnectivity().then(online => {
      if (online && typeof onReconnectCallback === 'function') {
        try {
          onReconnectCallback();
        } catch (_) {}
      }
    });
  }, intervalMs);
};

export const stopNetworkMonitor = () => {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
};
