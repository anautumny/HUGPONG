/**
 * Application-level connectivity monitor. A connection is considered usable
 * only when the device is connected and internet reachability is confirmed.
 */
import { probeServerConnectivity } from './authService';

let NetInfo = null;
try {
  const netInfoModule = require('@react-native-community/netinfo');
  NetInfo = netInfoModule.default || netInfoModule;
} catch (error) {
  console.warn('[networkService] Native NetInfo is unavailable; using the HUGPONG server health probe.', error?.message || error);
}

let currentNetworkOnline = false;
let listeners = [];
let netInfoUnsubscribe = null;
let onReconnectCallback = null;
let connectivityCheckPromise = null;

export const setOnReconnectCallback = (cb) => {
  onReconnectCallback = cb;
};

export const getNetworkStatus = () => currentNetworkOnline;
export const isOnline = () => currentNetworkOnline;

export const networkStateIsOnline = (state = {}) => (
  state.isConnected === true && state.isInternetReachable === true
);

export const subscribeToNetwork = (listener) => {
  listeners.push(listener);
  listener(currentNetworkOnline);
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
};

export const addNetworkListener = subscribeToNetwork;

const notifyListeners = (status) => {
  listeners.forEach(listener => {
    try {
      listener(status);
    } catch (error) {
      console.warn('[networkService] Listener error:', error);
    }
  });
};

export const setNetworkStatus = (newStatus, forceTrigger = false) => {
  const previous = currentNetworkOnline;
  currentNetworkOnline = Boolean(newStatus);
  if (previous !== currentNetworkOnline) notifyListeners(currentNetworkOnline);
  if (currentNetworkOnline && (!previous || forceTrigger) && typeof onReconnectCallback === 'function') {
    Promise.resolve(onReconnectCallback('NETWORK_RESTORED')).catch(error => {
      console.warn('[networkService] Auto-sync callback error:', error);
    });
  }
};

const applyNetInfoState = (state, forceTrigger = false) => {
  const reachabilityKnown = state?.isInternetReachable !== null && state?.isInternetReachable !== undefined;
  setNetworkStatus(networkStateIsOnline(state), forceTrigger && reachabilityKnown);
  return currentNetworkOnline;
};

export const checkConnectivity = async () => {
  if (connectivityCheckPromise) return connectivityCheckPromise;
  connectivityCheckPromise = (async () => {
    try {
      if (NetInfo?.fetch) return applyNetInfoState(await NetInfo.fetch());
      const serverReachable = await probeServerConnectivity();
      setNetworkStatus(serverReachable);
      return serverReachable;
    } catch (error) {
      setNetworkStatus(false);
      return false;
    } finally {
      connectivityCheckPromise = null;
    }
  })();
  return connectivityCheckPromise;
};

export const startNetworkMonitor = () => {
  if (netInfoUnsubscribe) return netInfoUnsubscribe;
  netInfoUnsubscribe = NetInfo?.addEventListener
    ? NetInfo.addEventListener(state => applyNetInfoState(state))
    : () => {};
  checkConnectivity();
  return netInfoUnsubscribe;
};

export const stopNetworkMonitor = () => {
  if (netInfoUnsubscribe) netInfoUnsubscribe();
  netInfoUnsubscribe = null;
};
