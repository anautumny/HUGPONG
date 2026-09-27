'use strict';

const { auth } = require('../firebase-admin');

const INITIAL_AUTH_VERSION = 1;
const PASSWORD_SESSION_ACTIONS = Object.freeze({
  KEEP_CURRENT: 'KEEP_CURRENT',
  SIGN_OUT_ALL: 'SIGN_OUT_ALL'
});

function authVersionOf(user = {}) {
  const value = Number(user.authVersion);
  return Number.isInteger(value) && value > 0 ? value : INITIAL_AUTH_VERSION;
}

function nextAuthVersion(user = {}) {
  return authVersionOf(user) + 1;
}

function normalizePasswordSessionAction(value) {
  const action = String(value || PASSWORD_SESSION_ACTIONS.KEEP_CURRENT).trim().toUpperCase();
  if (!Object.values(PASSWORD_SESSION_ACTIONS).includes(action)) {
    const error = new Error('Choose whether to stay signed in on this device or sign out all devices.');
    error.status = 400;
    throw error;
  }
  return action;
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
  PASSWORD_SESSION_ACTIONS,
  authVersionOf,
  nextAuthVersion,
  normalizePasswordSessionAction,
  revokeFirebaseSessions,
  setFirebaseAccountDisabled
};
