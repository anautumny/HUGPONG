'use strict';

function notificationEligibleFrom(account = {}) {
  const started = Date.parse(account.notificationStartedAt || '');
  if (!Number.isFinite(started)) return null;
  const created = Date.parse(account.createdAt || '');
  return Number.isFinite(created) ? Math.max(started, created) : started;
}

function eventIsEligible(event, account) {
  const from = notificationEligibleFrom(account);
  const created = Date.parse(event?.createdAt || '');
  return from !== null && Number.isFinite(created) && created >= from;
}

module.exports = { notificationEligibleFrom, eventIsEligible };
