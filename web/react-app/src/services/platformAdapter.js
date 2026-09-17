import { apiRequest } from './apiClient';
import { currentFirebaseUser, signInFirebase, signOutFirebase } from './firebaseClient';
import { getReplica as readReplica, subscribeReplica } from './replicaStore';
import { clearSession, getSession, saveSession } from './sessionStore';
import { roleKeyFromUser } from './roleRouting';

export function firstLoginStep(user, roleKey) {
  const needsPhone = user?.phoneVerified === false || user?.pendingFirstLoginVerification === true || (user?.phoneVerified !== true && roleKey !== 'superadmin');
  if (needsPhone) return 'phone';
  if (user?.requiresPasswordChange === true && user?.passwordChanged !== true) return 'password';
  return null;
}

export async function activateSession(result) {
  const roleKey = roleKeyFromUser(result.user, result.roleKey);
  if (!roleKey) throw new Error('The authenticated account has an invalid role.');
  const nextStep = firstLoginStep(result.user, roleKey);
  if (nextStep) return { ...result, roleKey, completionRequired: true, nextStep };
  if (!result.firebaseCustomToken) throw new Error('The authentication service did not issue Firebase credentials.');
  await signInFirebase(result.firebaseCustomToken);
  return saveSession(result.user, roleKey, result.token);
}

export async function login(identifier, password) {
  return activateSession(await apiRequest('/auth/login', { method: 'POST', body: { contactNumber: identifier, password }, token: null }));
}

export const requestFirstLoginOtp = pending => apiRequest('/auth/request-phone-verification', { method: 'POST', body: {}, token: pending.token });
export async function verifyFirstLoginOtp(pending, code) {
  return activateSession({ ...(await apiRequest('/auth/verify-phone', { method: 'POST', body: { code }, token: pending.token })), roleKey: pending.roleKey });
}
export async function completeFirstLoginPassword(pending, newPassword) {
  return activateSession({ ...(await apiRequest('/auth/change-password', { method: 'POST', body: { newPassword }, token: pending.token })), roleKey: pending.roleKey });
}

export async function restoreSession() {
  const cached = getSession();
  if (!cached) return null;
  try {
    const activated = await activateSession(await apiRequest('/auth/session', { token: cached.token }));
    if (activated.completionRequired) { clearSession(); await signOutFirebase().catch(() => undefined); return null; }
    return activated;
  } catch (error) {
    if (error.status) { clearSession(); await signOutFirebase().catch(() => undefined); return null; }
    const firebaseUser = await currentFirebaseUser();
    return firebaseUser?.uid === cached.user.employeeId ? cached : null;
  }
}

export async function logout() {
  const cached = getSession();
  try { await apiRequest('/auth/logout', { method: 'POST', token: cached?.token }); } catch (error) { /* offline logout remains local */ }
  await signOutFirebase().catch(() => undefined);
  clearSession();
}

export const getReplica = () => readReplica();
export const subscribeToReplica = onChange => subscribeReplica(onChange);

