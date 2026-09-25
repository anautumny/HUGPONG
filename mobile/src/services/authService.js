import { signInWithCustomToken, signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { STORAGE_KEYS, getItem, saveItem } from './storageService';
import { friendlyErrorMessage } from '../domain/presentationContract';
import {
  API_BASE_URL,
  API_ENVIRONMENT,
  API_REQUEST_TIMEOUT_MS,
  getApiBaseUrl,
  logApiDiagnostic
} from '../config/apiConfig';

async function fetchFromApi(path, options = {}) {
  const origin = getApiBaseUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${origin}${path}`, { ...options, signal: controller.signal });
  } catch (cause) {
    logApiDiagnostic(`${options.method || 'GET'} ${path} could not reach ${origin}.`, cause);
    const error = new Error('Unable to connect to HUGPONG. Check your internet connection and try again.');
    error.code = cause?.name === 'AbortError' ? 'API_REQUEST_TIMEOUT' : 'API_UNREACHABLE';
    error.isNetworkError = true;
    if (API_ENVIRONMENT === 'development') error.cause = cause;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export { API_BASE_URL };

export async function probeServerConnectivity() {
  try {
    const response = await fetchFromApi('/health', {
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
    const errorCode = data.code || data.data?.code || '';
    const error = new Error(friendlyErrorMessage(errorCode, data.error || `Request failed (${response.status}).`));
    error.status = response.status;
    error.data = data.data;
    error.code = errorCode;
    throw error;
  }
  return data;
}

export async function signInToFirebase(customToken) {
  if (!auth || !customToken) throw new Error('Firebase authentication token was not issued.');
  await signInWithCustomToken(auth, customToken);
}

export async function publicAuthRequest(path, body) {
  const response = await fetchFromApi(path, {
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
  const response = await fetchFromApi(path, {
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
  const response = await fetchFromApi('/auth/mobile-session', {
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
