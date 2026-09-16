'use strict';

const PRIVATE_USER_FIELDS = new Set([
  'password',
  'passwordHash',
  'credentialHash',
  'salt',
  'resetToken',
  'resetTokenHash'
]);

function publicUser(user = {}, id = null) {
  const safe = {};
  for (const [key, value] of Object.entries(user || {})) {
    if (!PRIVATE_USER_FIELDS.has(key)) safe[key] = value;
  }
  if (id != null) safe.id = id;
  return safe;
}

module.exports = { publicUser, PRIVATE_USER_FIELDS };
