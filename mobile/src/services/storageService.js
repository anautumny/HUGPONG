import AsyncStorage from '@react-native-async-storage/async-storage';

export const MOBILE_CACHE_SCHEMA_VERSION = '2026_09_17_post_reset_v1';

export const STORAGE_KEYS = {
  CACHE_SCHEMA_VERSION: '@hugpong_cache_schema_version',
  AUTH_TOKEN: '@hugpong_auth_token',
  SESSION: '@hugpong_session',
  USERS: '@hugpong_users',
  LOGS: '@hugpong_logs',
  DRAFTS: '@hugpong_drafts',
  FIELDS: '@hugpong_fields',
  ARCHIVED_FIELDS: '@hugpong_archived_fields',
  OUTBOX: '@hugpong_outbox',
  PRICES: '@hugpong_prices',
  TICKETS: '@hugpong_tickets',
  PREFS: '@hugpong_prefs',
  PENDING_ASSIGNMENTS: '@hugpong_pending_assignments',
  PENDING_USERS: '@hugpong_pending_users',
  CUSTOM_STAGES: '@hugpong_custom_stages',
  LAST_SYNC: '@hugpong_last_sync',
  AUDIT_REPORTS: '@hugpong_audit_reports',
  SYSTEM_HISTORY: '@hugpong_system_history',
  READ_NOTIF_IDS: '@hugpong_read_notif_ids',
  DISMISSED_NOTIF_IDS: '@hugpong_dismissed_notif_ids',
  ARCHIVE_VIEW_PREFERENCES: '@hugpong_archive_view_preferences',
};

const PRESERVED_INSTALLATION_KEYS = new Set([
  '@hugpong_language',
  '@hugpong_lang_chosen',
  '@hugpong_onboarded'
]);

// In-memory shadow cache for synchronous reads after initial hydration
const memoryCache = new Map();

/**
 * Save an item to AsyncStorage and update the memory cache
 */
export async function saveItem(key, value) {
  try {
    memoryCache.set(key, value);
    const jsonValue = JSON.stringify(value);
    await AsyncStorage.setItem(key, jsonValue);
    return true;
  } catch (error) {
    console.warn(`[storageService] Error saving key "${key}":`, error);
    return false;
  }
}

export const setItem = saveItem;

/**
 * One-way cache epoch migration. Old replicas, sessions, drafts, and outboxes
 * must not survive the controlled development database reset and later replay
 * obsolete documents into the canonical database.
 */
export async function ensureCurrentCacheSchema() {
  const storedVersion = await AsyncStorage.getItem(STORAGE_KEYS.CACHE_SCHEMA_VERSION);
  if (storedVersion === MOBILE_CACHE_SCHEMA_VERSION) return { reset: false, version: storedVersion };

  const allKeys = await AsyncStorage.getAllKeys();
  const staleKeys = allKeys.filter(key =>
    key.startsWith('@hugpong_')
    && key !== STORAGE_KEYS.CACHE_SCHEMA_VERSION
    && !PRESERVED_INSTALLATION_KEYS.has(key)
  );
  if (staleKeys.length) await AsyncStorage.multiRemove(staleKeys);
  memoryCache.clear();
  await AsyncStorage.setItem(STORAGE_KEYS.CACHE_SCHEMA_VERSION, MOBILE_CACHE_SCHEMA_VERSION);
  memoryCache.set(STORAGE_KEYS.CACHE_SCHEMA_VERSION, MOBILE_CACHE_SCHEMA_VERSION);
  return { reset: true, version: MOBILE_CACHE_SCHEMA_VERSION, removedKeyCount: staleKeys.length };
}

/**
 * Get an item from memory cache or AsyncStorage
 */
export async function getItem(key, defaultValue = null) {
  try {
    if (memoryCache.has(key)) {
      return memoryCache.get(key);
    }
    const jsonValue = await AsyncStorage.getItem(key);
    if (jsonValue !== null) {
      const parsed = JSON.parse(jsonValue);
      memoryCache.set(key, parsed);
      return parsed;
    }
    return defaultValue;
  } catch (error) {
    console.warn(`[storageService] Error reading key "${key}":`, error);
    return defaultValue;
  }
}

/**
 * Synchronous read from memory cache
 */
export function getCachedItem(key, defaultValue = null) {
  if (memoryCache.has(key)) {
    return memoryCache.get(key);
  }
  return defaultValue;
}

/**
 * Remove a specific key
 */
export async function removeItem(key) {
  try {
    memoryCache.delete(key);
    await AsyncStorage.removeItem(key);
    return true;
  } catch (error) {
    console.warn(`[storageService] Error removing key "${key}":`, error);
    return false;
  }
}

/**
 * Multi-save key-value pairs in a single operation
 */
export async function multiSave(keyValuePairs) {
  try {
    const stringifiedPairs = keyValuePairs.map(([key, value]) => {
      memoryCache.set(key, value);
      return [key, JSON.stringify(value)];
    });
    await AsyncStorage.multiSet(stringifiedPairs);
    return true;
  } catch (error) {
    console.warn('[storageService] Error in multiSave:', error);
    return false;
  }
}

/**
 * Clear all HUGPONG-scoped keys from storage
 */
export async function clearHugpongStorage() {
  try {
    memoryCache.clear();
    const allKeys = Object.values(STORAGE_KEYS).filter(key => key !== STORAGE_KEYS.CACHE_SCHEMA_VERSION);
    await AsyncStorage.multiRemove(allKeys);
    return true;
  } catch (error) {
    console.warn('[storageService] Error clearing storage:', error);
    return false;
  }
}

/**
 * Hydrate all keys on app startup
 */
export async function hydrateAllStorage() {
  try {
    const keys = Object.values(STORAGE_KEYS);
    const results = await AsyncStorage.multiGet(keys);
    const hydrated = {};
    results.forEach(([key, value]) => {
      if (value !== null) {
        try {
          const parsed = JSON.parse(value);
          memoryCache.set(key, parsed);
          hydrated[key] = parsed;
        } catch (e) {
          // ignore corrupted single entry
        }
      }
    });
    return hydrated;
  } catch (error) {
    console.warn('[storageService] Error hydrating storage:', error);
    return {};
  }
}
