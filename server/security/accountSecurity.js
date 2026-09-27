'use strict';

const { auth } = require('../firebase-admin');

const INITIAL_AUTH_VERSION = 1;

function authVersionOf(user = {}) {
  const value = Number(user.authVersion);
  return Number.isInteger(value) && value > 0 ? value : INITIAL_AUTH_VERSION;
}

function nextAuthVersion(user = {}) {
  return authVersionOf(user) + 1;
}

async function revokeFirebaseSessions(userId) {
  if (!auth || !userId) return;
  try {
    await auth.revokeRefreshTokens(String(userId));
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') {
      console.warn(`[HUGPONG Auth] Firebase refresh-token revocation notice for ${userId}:`, error.message);
    }
  }
}

async function setFirebaseAccountDisabled(userId, disabled) {
  if (!auth || !userId) return;
  try {
    await auth.updateUser(String(userId), { disabled: disabled === true });
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') {
      console.warn(`[HUGPONG Auth] Firebase account-state synchronization notice for ${userId}:`, error.message);
    }
  }
}

module.exports = {
  INITIAL_AUTH_VERSION,
  authVersionOf,
  nextAuthVersion,
  revokeFirebaseSessions,
  setFirebaseAccountDisabled
};
