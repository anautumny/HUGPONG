import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export const MOBILE_CACHE_SCHEMA_VERSION = '2026_09_17_post_reset_v1';

export const STORAGE_KEYS = {
  CACHE_SCHEMA_VERSION: '@hugpong_cache_schema_version',
  AUTH_TOKEN: '@hugpong_auth_token',
  CLIENT_INSTANCE_ID: '@hugpong_client_instance_id',
  SESSION: '@hugpong_session',
  USERS: '@hugpong_users',
  BLOCK_FARMS: '@hugpong_block_farms',
  CROP_CYCLES: '@hugpong_crop_cycles',
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
  LAST_SCANNED_AUDIT: '@hugpong_last_scanned_audit',
  PENDING_AUDIT_REFERENCE: '@hugpong_pending_audit_reference',
  SRA_OFFLINE_SNAPSHOT: '@hugpong_sra_offline_snapshot',
  SYSTEM_HISTORY: '@hugpong_system_history',
  READ_NOTIF_IDS: '@hugpong_read_notif_ids',
  DISMISSED_NOTIF_IDS: '@hugpong_dismissed_notif_ids',
  ARCHIVE_VIEW_PREFERENCES: '@hugpong_archive_view_preferences',
};

const PRESERVED_INSTALLATION_KEYS = new Set([
  '@hugpong_language',
  '@hugpong_lang_chosen',
  '@hugpong_onboarded',
  '@hugpong_client_instance_id'
]);

const SECURE_KEYS = new Set([STORAGE_KEYS.AUTH_TOKEN, STORAGE_KEYS.SESSION]);
const SECURE_OPTIONS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

function isSecureKey(key) {
  return SECURE_KEYS.has(key);
}

function secureStorageKey(key) {
  return String(key).replace(/^@/, '').replace(/[^A-Za-z0-9._-]/g, '_');
}

async function readSecureValue(key) {
  const value = await SecureStore.getItemAsync(secureStorageKey(key), SECURE_OPTIONS);
  if (value == null) return null;
  return JSON.parse(value);
}

// In-memory shadow cache for synchronous reads after initial hydration
const memoryCache = new Map();

/**
 * Save an item to AsyncStorage and update the memory cache
 */
export async function saveItem(key, value) {
  try {
    memoryCache.set(key, value);
    const jsonValue = JSON.stringify(value);
    if (isSecureKey(key)) {
      if (value == null) await SecureStore.deleteItemAsync(secureStorageKey(key), SECURE_OPTIONS);
      else await SecureStore.setItemAsync(secureStorageKey(key), jsonValue, SECURE_OPTIONS);
      await AsyncStorage.removeItem(key);
    } else {
      await AsyncStorage.setItem(key, jsonValue);
    }
    return true;
  } catch (error) {
    console.warn(`[storageService] Error saving key "${key}":`, error);
    return false;
  }
}

export const setItem = saveItem;

export function localDraftStorageKey(userId) {
  const normalized = String(userId || '').trim();
  if (!normalized) throw new Error('A signed-in user is required for local draft storage.');
  return `${STORAGE_KEYS.DRAFTS}:${normalized}`;
}

export function localOutboxStorageKey(userId) {
  const normalized = String(userId || '').trim();
  if (!normalized) throw new Error('A signed-in user is required for local outbox storage.');
  return `${STORAGE_KEYS.OUTBOX}:${normalized}`;
}

export function lastScannedAuditStorageKey(userId) {
  const normalized = String(userId || '').trim();
  if (!normalized) throw new Error('A signed-in user is required for last scanned audit storage.');
  return `${STORAGE_KEYS.LAST_SCANNED_AUDIT}:${normalized}`;
}

export function pendingAuditReferenceStorageKey(userId) {
  const normalized = String(userId || '').trim();
  if (!normalized) throw new Error('A signed-in SRA user is required for pending audit references.');
  return `${STORAGE_KEYS.PENDING_AUDIT_REFERENCE}:${normalized}`;
}

export function sraOfflineSnapshotStorageKey(userId) {
  const normalized = String(userId || '').trim();
  if (!normalized) throw new Error('A signed-in SRA user is required for offline snapshot storage.');
  return `${STORAGE_KEYS.SRA_OFFLINE_SNAPSHOT}:${normalized}`;
}

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
  await Promise.all(Array.from(SECURE_KEYS).map(key => SecureStore.deleteItemAsync(secureStorageKey(key), SECURE_OPTIONS).catch(() => {})));
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
    if (isSecureKey(key)) {
      const secureValue = await readSecureValue(key);
      if (secureValue !== null) {
        memoryCache.set(key, secureValue);
        return secureValue;
      }
      // One-time migration for installations created before encrypted storage.
      const legacyValue = await AsyncStorage.getItem(key);
      if (legacyValue !== null) {
        const parsed = JSON.parse(legacyValue);
        await SecureStore.setItemAsync(secureStorageKey(key), legacyValue, SECURE_OPTIONS);
        await AsyncStorage.removeItem(key);
        memoryCache.set(key, parsed);
        return parsed;
      }
      return defaultValue;
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
    if (isSecureKey(key)) {
      await SecureStore.deleteItemAsync(secureStorageKey(key), SECURE_OPTIONS);
      await AsyncStorage.removeItem(key);
    } else {
      await AsyncStorage.removeItem(key);
    }
    return true;
  } catch (error) {
    console.warn(`[storageService] Error removing key "${key}":`, error);
    return false;
  }
}

export async function removeItems(keys = []) {
  try {
    const normalizedKeys = Array.from(new Set(keys.filter(Boolean).map(String)));
    normalizedKeys.forEach(key => memoryCache.delete(key));
    const secureKeys = normalizedKeys.filter(isSecureKey);
    const ordinaryKeys = normalizedKeys.filter(key => !isSecureKey(key));
    await Promise.all(secureKeys.map(key => SecureStore.deleteItemAsync(secureStorageKey(key), SECURE_OPTIONS)));
    if (secureKeys.length) await AsyncStorage.multiRemove(secureKeys);
    if (ordinaryKeys.length) await AsyncStorage.multiRemove(ordinaryKeys);
    return true;
  } catch (error) {
    console.warn('[storageService] Error removing keys:', error);
    return false;
  }
}

/**
 * Multi-save key-value pairs in a single operation
 */
export async function multiSave(keyValuePairs) {
  try {
    const ordinaryPairs = [];
    const secureWrites = [];
    keyValuePairs.forEach(([key, value]) => {
      memoryCache.set(key, value);
      const encoded = JSON.stringify(value);
      if (isSecureKey(key)) {
        secureWrites.push(value == null
          ? SecureStore.deleteItemAsync(secureStorageKey(key), SECURE_OPTIONS)
          : SecureStore.setItemAsync(secureStorageKey(key), encoded, SECURE_OPTIONS));
      } else {
        ordinaryPairs.push([key, encoded]);
      }
    });
    await Promise.all(secureWrites);
    if (ordinaryPairs.length) await AsyncStorage.multiSet(ordinaryPairs);
    const legacySecureKeys = keyValuePairs.map(([key]) => key).filter(isSecureKey);
    if (legacySecureKeys.length) await AsyncStorage.multiRemove(legacySecureKeys);
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
    const allStoredKeys = await AsyncStorage.getAllKeys();
    const hugpongKeys = allStoredKeys.filter(key =>
      key.startsWith('@hugpong_')
      && key !== STORAGE_KEYS.CACHE_SCHEMA_VERSION
      && !PRESERVED_INSTALLATION_KEYS.has(key)
    );
    if (hugpongKeys.length) await AsyncStorage.multiRemove(hugpongKeys);
    await Promise.all(Array.from(SECURE_KEYS).map(key => SecureStore.deleteItemAsync(secureStorageKey(key), SECURE_OPTIONS)));
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
    const keys = Object.values(STORAGE_KEYS).filter(key => !isSecureKey(key));
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
    for (const key of SECURE_KEYS) {
      const value = await getItem(key, null);
      if (value !== null) hydrated[key] = value;
    }
    return hydrated;
  } catch (error) {
    console.warn('[storageService] Error hydrating storage:', error);
    return {};
  }
}
