'use strict';

const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const FORMAT = 'scrypt';
const VERSION = 'v1';
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const SCRYPT_OPTIONS = Object.freeze({ N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 256) {
    throw new Error('Password must contain between 8 and 256 characters.');
  }
}

async function hashPassword(password) {
  validatePassword(password);
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return [
    FORMAT,
    VERSION,
    SCRYPT_OPTIONS.N,
    SCRYPT_OPTIONS.r,
    SCRYPT_OPTIONS.p,
    salt.toString('base64'),
    Buffer.from(derived).toString('base64')
  ].join('$');
}

async function verifyPassword(password, encodedHash) {
  if (typeof password !== 'string' || typeof encodedHash !== 'string') return false;
  const parts = encodedHash.split('$');
  if (parts.length !== 7 || parts[0] !== FORMAT || parts[1] !== VERSION) return false;

  const N = Number(parts[2]);
  const r = Number(parts[3]);
  const p = Number(parts[4]);
  if (N !== SCRYPT_OPTIONS.N || r !== SCRYPT_OPTIONS.r || p !== SCRYPT_OPTIONS.p) return false;

  try {
    const salt = Buffer.from(parts[5], 'base64');
    const expected = Buffer.from(parts[6], 'base64');
    if (salt.length !== SALT_BYTES || expected.length !== KEY_LENGTH) return false;
    const supplied = Buffer.from(await scrypt(password, salt, expected.length, SCRYPT_OPTIONS));
    return crypto.timingSafeEqual(expected, supplied);
  } catch (error) {
    return false;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  validatePassword,
  PASSWORD_HASH_FORMAT: `${FORMAT}$${VERSION}`
};
