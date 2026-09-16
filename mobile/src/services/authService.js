import { signInWithCustomToken, signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { STORAGE_KEYS, getItem, saveItem } from './storageService';

export const API_BASE_URL = String(process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

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
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  return parseResponse(response);
}

export async function authenticatedRequest(path, options = {}) {
  const token = options.token || await getItem(STORAGE_KEYS.AUTH_TOKEN);
  if (!token) throw new Error('No authenticated server session is available.');
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  return parseResponse(response);
}

export async function loginWithServer(identifier, password) {
  const result = await publicAuthRequest('/auth/login', { contactNumber: identifier, password });
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

export async function verifyPasswordWithServer(password) {
  return authenticatedRequest('/auth/verify-password', { method: 'POST', body: { password } });
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
