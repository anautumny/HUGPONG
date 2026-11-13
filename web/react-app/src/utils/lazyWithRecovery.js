import { lazy } from 'react';

const RETRY_PREFIX = 'hugpong:web-module-retry:';
const RETRY_WINDOW_MS = 2 * 60 * 1000;
const routePreloaders = new Map();

// Warm only the page module the user is about to open, never its API data.
export function preloadRouteModule(path) {
  if (typeof navigator !== 'undefined' && (navigator.onLine === false
    || navigator.connection?.saveData || /(^|-)2g$/.test(navigator.connection?.effectiveType || ''))) return;
  const pathname = String(path || '').split(/[?#]/, 1)[0];
  return routePreloaders.get(pathname)?.().catch(() => {});
}

export function isRecoverableModuleLoadError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return [
    'failed to fetch dynamically imported module',
    'error loading dynamically imported module',
    'importing a module script failed',
    'failed to load module script',
    'chunkloaderror',
    'loading chunk'
  ].some(fragment => message.includes(fragment));
}

function retryStorage() {
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
}

function readRetry(marker) {
  try {
    return Number(retryStorage()?.getItem(marker) || 0);
  } catch {
    return 0;
  }
}

function writeRetry(marker) {
  try {
    const storage = retryStorage();
    if (!storage) return false;
    storage.setItem(marker, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

function clearRetry(marker) {
  try {
    retryStorage()?.removeItem(marker);
  } catch {
    // Storage may be disabled; successful module loading must still continue.
  }
}

export function recoverLatestWebBundle(error, moduleName) {
  if (!isRecoverableModuleLoadError(error) || typeof window === 'undefined') return false;
  const marker = `${RETRY_PREFIX}${String(moduleName || 'route')}`;
  const previousAttempt = readRetry(marker);
  if (previousAttempt && Date.now() - previousAttempt < RETRY_WINDOW_MS) {
    clearRetry(marker);
    return false;
  }

  if (!writeRetry(marker)) return false;
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('_hugpong_refresh', Date.now().toString());
  window.location.replace(nextUrl.toString());
  return true;
}

export function lazyWithRecovery(loader, moduleName, routePaths = []) {
  let modulePromise;
  const load = () => {
    if (!modulePromise) {
      modulePromise = Promise.resolve().then(loader).catch(error => {
        modulePromise = null;
        throw error;
      });
    }
    return modulePromise;
  };
  for (const path of routePaths) routePreloaders.set(path, load);
  return lazy(async () => {
    try {
      const loadedModule = await load();
      clearRetry(`${RETRY_PREFIX}${String(moduleName || 'route')}`);
      return loadedModule;
    } catch (error) {
      if (recoverLatestWebBundle(error, moduleName)) return new Promise(() => {});
      throw error;
    }
  });
}
