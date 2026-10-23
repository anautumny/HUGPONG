/**
 * Application connectivity monitor. "Online" means both internet access and
 * the configured HUGPONG API are reachable; outbox replay never starts from a
 * generic network signal alone.
 */
import { probeServerConnectivity } from './authService';
import { logApiDiagnostic } from '../config/apiConfig';

let NetInfo = null;
try {
  const netInfoModule = require('@react-native-community/netinfo');
  NetInfo = netInfoModule.default || netInfoModule;
} catch (error) {
  logApiDiagnostic('Native NetInfo is unavailable; using the server health probe.', error);
}

export const CONNECTIVITY_STATUS = Object.freeze({
  CHECKING: 'CHECKING',
  ONLINE: 'ONLINE',
  NO_INTERNET: 'NO_INTERNET',
  SERVER_UNAVAILABLE: 'SERVER_UNAVAILABLE'
});

const API_RETRY_DELAY_MS = 15000;

let currentConnectivity = {
  status: CONNECTIVITY_STATUS.CHECKING,
  internetReachable: null,
  apiReachable: false
};
let listeners = [];
let netInfoUnsubscribe = null;
let onReconnectCallback = null;
let connectivityCheckPromise = null;
let connectivityCheckGeneration = 0;
let gatewayRetryTimer = null;
let reconnectPending = false;
let reconnectListeners = [];
let reconnectStatus = { phase: 'IDLE', result: null };

export const setOnReconnectCallback = (cb) => {
  onReconnectCallback = cb;
};

export const getNetworkStatus = () => currentConnectivity.apiReachable === true;
export const isOnline = getNetworkStatus;
export const getConnectivityDetails = () => ({ ...currentConnectivity });

export const networkStateHasInternet = (state = {}) => (
  state.isConnected === true && state.isInternetReachable !== false
);

export const subscribeToNetwork = (listener) => {
  listeners.push(listener);
  listener(getNetworkStatus(), getConnectivityDetails());
  return () => {
    listeners = listeners.filter(item => item !== listener);
  };
};

export const subscribeToReconnectStatus = (listener) => {
  reconnectListeners.push(listener);
  // Reconnection notices are events, not persistent account state. A newly
  // mounted dashboard must not replay a completion from a previous login.
  listener({ phase: 'IDLE', result: null });
  return () => {
    reconnectListeners = reconnectListeners.filter(item => item !== listener);
  };
};

function publishReconnectStatus(phase, result = null) {
  reconnectStatus = { phase, result };
  reconnectListeners.forEach(listener => {
    try {
      listener({ ...reconnectStatus });
    } catch (error) {
      logApiDiagnostic('A reconnect-status listener failed.', error);
    }
  });
}

export const addNetworkListener = subscribeToNetwork;

function notifyListeners() {
  const online = getNetworkStatus();
  const details = getConnectivityDetails();
  listeners.forEach(listener => {
    try {
      listener(online, details);
    } catch (error) {
      logApiDiagnostic('A connectivity listener failed.', error);
    }
  });
}

function clearGatewayRetry() {
  if (gatewayRetryTimer) clearTimeout(gatewayRetryTimer);
  gatewayRetryTimer = null;
}

function scheduleGatewayRetry() {
  if (
    gatewayRetryTimer || !netInfoUnsubscribe ||
    currentConnectivity.internetReachable !== true || currentConnectivity.apiReachable
  ) return;
  gatewayRetryTimer = setTimeout(() => {
    gatewayRetryTimer = null;
    checkConnectivity({ force: true }).catch(() => {});
  }, API_RETRY_DELAY_MS);
}

function applyConnectivity(next, forceReconnect = false) {
  const wasOnline = getNetworkStatus();
  const previousStatus = currentConnectivity.status;
  currentConnectivity = { ...currentConnectivity, ...next };
  const online = getNetworkStatus();

  if (!online && currentConnectivity.status !== CONNECTIVITY_STATUS.CHECKING) {
    reconnectPending = true;
  }

  if (online || currentConnectivity.status === CONNECTIVITY_STATUS.CHECKING) clearGatewayRetry();
  else scheduleGatewayRetry();

  if (wasOnline !== online || previousStatus !== currentConnectivity.status) notifyListeners();
  const shouldRunReconnect = online && (reconnectPending || forceReconnect);
  if (shouldRunReconnect) reconnectPending = false;
  if (shouldRunReconnect && typeof onReconnectCallback === 'function') {
    publishReconnectStatus('RECONNECTING');
    Promise.resolve(onReconnectCallback('NETWORK_RESTORED'))
      .then(result => {
        publishReconnectStatus(result?.reason === 'AUTO_SYNC_DISABLED' ? 'MANUAL_REQUIRED' : 'COMPLETE', result);
      })
      .catch(error => {
        publishReconnectStatus('FAILED', {
          success: false,
          remainingCount: null,
          reason: 'RECONNECT_SYNC_FAILED'
        });
        logApiDiagnostic('The reconnect synchronization callback failed.', error);
      });
  }
  return online;
}

// Retained for tests and controlled application state transitions.
export const setNetworkStatus = (newStatus, forceTrigger = false) => applyConnectivity({
  status: newStatus ? CONNECTIVITY_STATUS.ONLINE : CONNECTIVITY_STATUS.NO_INTERNET,
  internetReachable: Boolean(newStatus),
  apiReachable: Boolean(newStatus)
}, forceTrigger);

async function evaluateNetworkState(state, generation) {
  if (generation !== connectivityCheckGeneration) {
    return connectivityCheckPromise || getNetworkStatus();
  }
  if (state && (state.isConnected === false || state.isInternetReachable === false)) {
    if (generation === connectivityCheckGeneration) {
      applyConnectivity({
        status: CONNECTIVITY_STATUS.NO_INTERNET,
        internetReachable: false,
        apiReachable: false
      });
    }
    return false;
  }

  if (generation === connectivityCheckGeneration) {
    const wasApiReachable = currentConnectivity.apiReachable;
    applyConnectivity({
      status: CONNECTIVITY_STATUS.CHECKING,
      internetReachable: true,
      apiReachable: wasApiReachable
    });
  }

  const serverReachable = await probeServerConnectivity();
  if (generation !== connectivityCheckGeneration) {
    // A newer native-network check owns the result. Login must await that
    // result instead of returning the previous offline flag while it finishes.
    return connectivityCheckPromise || getNetworkStatus();
  }
  return applyConnectivity({
    status: serverReachable ? CONNECTIVITY_STATUS.ONLINE : CONNECTIVITY_STATUS.SERVER_UNAVAILABLE,
    internetReachable: true,
    apiReachable: serverReachable
  });
}

export const checkConnectivity = async (options = {}) => {
  const force = options === true || options?.force === true;
  if (connectivityCheckPromise && !force) return connectivityCheckPromise;

  const generation = ++connectivityCheckGeneration;
  const check = (async () => {
    try {
      let state = null;
      if (NetInfo?.fetch) {
        try {
          state = await NetInfo.fetch();
        } catch (error) {
          logApiDiagnostic('NetInfo could not report reachability; falling back to the server health probe.', error);
        }
      }
      return await evaluateNetworkState(state, generation);
    } catch (_) {
      if (generation === connectivityCheckGeneration) {
        applyConnectivity({
          status: CONNECTIVITY_STATUS.SERVER_UNAVAILABLE,
          internetReachable: currentConnectivity.internetReachable !== false,
          apiReachable: false
        });
      }
      return false;
    }
  })();
  connectivityCheckPromise = check;
  try {
    return await check;
  } finally {
    if (connectivityCheckPromise === check) connectivityCheckPromise = null;
  }
};

export const startNetworkMonitor = () => {
  if (netInfoUnsubscribe) return netInfoUnsubscribe;
  netInfoUnsubscribe = NetInfo?.addEventListener
    ? NetInfo.addEventListener(state => {
      const generation = ++connectivityCheckGeneration;
      const check = evaluateNetworkState(state, generation).catch(() => false);
      connectivityCheckPromise = check;
      check.finally(() => {
        if (connectivityCheckPromise === check) connectivityCheckPromise = null;
      });
    })
    : () => {};
  checkConnectivity({ force: true });
  return netInfoUnsubscribe;
};

export const stopNetworkMonitor = () => {
  if (netInfoUnsubscribe) netInfoUnsubscribe();
  netInfoUnsubscribe = null;
  clearGatewayRetry();
};
