import { NativeModules, Platform } from 'react-native';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { STORAGE_KEYS, getItem, saveItem } from './storageService';

const API_REQUEST_TIMEOUT_MS = 6000;

function normalizeOrigin(value) {
  const origin = String(value || '').trim().replace(/\/$/, '');
  return /^https?:\/\//i.test(origin) ? origin : null;
}

function resolveMetroApiUrl() {
  const scriptUrl = NativeModules?.SourceCode?.scriptURL;
  const match = String(scriptUrl || '').match(/^https?:\/\/([^/:]+)(?::\d+)?\//i);
  return match?.[1] ? `http://${match[1]}:3000` : null;
}

function resolveDefaultApiUrl() {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (envUrl) {
    const trimmed = String(envUrl).replace(/\/$/, '');
    if (Platform.OS === 'android' && (trimmed === 'http://localhost:3000' || trimmed === 'http://127.0.0.1:3000')) {
      return 'http://10.0.2.2:3000';
    }
    return trimmed;
  }
  return Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
}

export const API_BASE_URL = resolveDefaultApiUrl();

function apiOriginCandidates() {
  const candidates = [
    resolveMetroApiUrl(),
    API_BASE_URL,
    Platform.OS === 'android' ? 'http://10.0.2.2:3000' : null,
    'http://localhost:3000'
  ].map(normalizeOrigin).filter(Boolean);
  return [...new Set(candidates)];
}

async function fetchWithHostFallback(path, options) {
  const fetchWithTimeout = async (origin) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);
    try {
      return await fetch(`${origin}${path}`, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  };

  const origins = apiOriginCandidates();
  let lastError = null;
  for (const origin of origins) {
    try {
      return await fetchWithTimeout(origin);
    } catch (error) {
      lastError = error;
    }
  }
  const error = new Error(`Could not reach the HUGPONG server. Tried ${origins.join(', ')}. Check that the server is running and the device can reach this computer.`);
  error.cause = lastError;
  throw error;
}

export async function probeServerConnectivity() {
  try {
    const response = await fetchWithHostFallback('/health', {
      method: 'GET',
      headers: { 'x-client-platform': 'mobile' }
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    const error = new Error(data.error || `Authentication request failed (${response.status}).`);
    error.status = response.status;
    error.data = data.data;
    throw error;
  }
  return data;
}

export async function signInToFirebase(customToken) {
  if (!auth || !customToken) throw new Error('Firebase authentication token was not issued.');
  await signInWithCustomToken(auth, customToken);
}

export async function publicAuthRequest(path, body) {
  const response = await fetchWithHostFallback(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-platform': 'mobile'
    },
    body: JSON.stringify(body || {})
  });
  return parseResponse(response);
}

export async function authenticatedRequest(path, options = {}) {
  const token = options.token || await getItem(STORAGE_KEYS.AUTH_TOKEN);
  if (!token) throw new Error('No authenticated server session is available.');
  const response = await fetchWithHostFallback(path, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-client-platform': 'mobile',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  return parseResponse(response);
}

export async function loginWithServer(identifier, password) {
  const result = await publicAuthRequest('/auth/login', { contactNumber: identifier, password, clientPlatform: 'mobile' });
  await signInToFirebase(result.firebaseCustomToken);
  await saveItem(STORAGE_KEYS.AUTH_TOKEN, result.token);
  return result;
}

export async function refreshServerSession(token) {
  const result = await authenticatedRequest('/auth/session', { token });
  await signInToFirebase(result.firebaseCustomToken);
  await saveItem(STORAGE_KEYS.AUTH_TOKEN, result.token);
  return result;
}

export async function verifyPasswordWithServer(password, authorization = {}) {
  return authenticatedRequest('/auth/verify-password', {
    method: 'POST',
    body: { password, ...authorization }
  });
}

export async function refreshMobileSessionFromFirebase() {
  if (!auth?.currentUser) throw new Error('Firebase authentication must be restored before synchronization.');
  const firebaseIdToken = await auth.currentUser.getIdToken(true);
  const response = await fetchWithHostFallback('/auth/mobile-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-platform': 'mobile',
      Authorization: `Bearer ${firebaseIdToken}`
    },
    body: JSON.stringify({})
  });
  const result = await parseResponse(response);
  await saveItem(STORAGE_KEYS.AUTH_TOKEN, result.token);
  return result;
}

export async function changePasswordWithServer(currentPassword, newPassword) {
  const result = await authenticatedRequest('/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword }
  });
  await signInToFirebase(result.firebaseCustomToken);
  await saveItem(STORAGE_KEYS.AUTH_TOKEN, result.token);
  return result;
}

export async function changePhoneWithServer(phone, currentPassword) {
  const result = await authenticatedRequest('/auth/change-phone', {
    method: 'POST',
    body: { phone, currentPassword }
  });
  await signInToFirebase(result.firebaseCustomToken);
  await saveItem(STORAGE_KEYS.AUTH_TOKEN, result.token);
  return result;
}

export async function requestPhoneVerificationWithServer() {
  return authenticatedRequest('/auth/request-phone-verification', { method: 'POST', body: {} });
}

export async function verifyPhoneWithServer(code) {
  const result = await authenticatedRequest('/auth/verify-phone', { method: 'POST', body: { code } });
  await signInToFirebase(result.firebaseCustomToken);
  await saveItem(STORAGE_KEYS.AUTH_TOKEN, result.token);
  return result;
}

export async function registerWithServer(payload) {
  return publicAuthRequest('/auth/register', payload);
}

export async function requestRegistrationOtp(phone, displayName) {
  return publicAuthRequest('/auth/registration-otp/request', { phone, displayName });
}

export async function verifyRegistrationOtp(phone, code) {
  return publicAuthRequest('/auth/registration-otp/verify', { phone, code });
}

export async function logoutFromServer() {
  try {
    await authenticatedRequest('/auth/logout', { method: 'POST', body: {} });
  } catch (error) {
    // Local sign-out must still complete when the server is offline.
  }
  if (auth) await signOut(auth).catch(() => {});
  await saveItem(STORAGE_KEYS.AUTH_TOKEN, null);
}
