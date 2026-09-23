/**
 * Application-level connectivity monitor. A connection is considered usable
 * only when the device is connected and internet reachability is confirmed.
 */
import NetInfo from '@react-native-community/netinfo';

let currentNetworkOnline = false;
let listeners = [];
let netInfoUnsubscribe = null;
let onReconnectCallback = null;

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
  try {
    return applyNetInfoState(await NetInfo.fetch());
  } catch (error) {
    setNetworkStatus(false);
    return false;
  }
};

export const startNetworkMonitor = () => {
  if (netInfoUnsubscribe) return netInfoUnsubscribe;
  netInfoUnsubscribe = NetInfo.addEventListener(state => applyNetInfoState(state));
  checkConnectivity();
  return netInfoUnsubscribe;
};

export const stopNetworkMonitor = () => {
  if (netInfoUnsubscribe) netInfoUnsubscribe();
  netInfoUnsubscribe = null;
};
