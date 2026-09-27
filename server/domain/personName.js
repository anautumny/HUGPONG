'use strict';

function cleanNamePart(value, label, { required = false, max = 80 } = {}) {
  const cleaned = String(value || '').trim().replace(/\s+/g, ' ');
  if (required && !cleaned) throw new Error(`${label} is required.`);
  if (cleaned.length > max) throw new Error(`${label} must not exceed ${max} characters.`);
  return cleaned;
}

function buildDisplayName({ firstName, middleName, lastName, suffix }) {
  return [firstName, middleName, lastName, suffix].filter(Boolean).join(' ');
}

function normalizeStructuredName(input = {}, existing = null) {
  const source = existing || {};
  const firstName = cleanNamePart(
    input.firstName === undefined ? source.firstName : input.firstName,
    'firstName',
    { required: true }
  );
  const middleName = cleanNamePart(
    input.middleName === undefined ? source.middleName : input.middleName,
    'middleName'
  );
  const lastName = cleanNamePart(
    input.lastName === undefined ? source.lastName : input.lastName,
    'lastName',
    { required: true }
  );
  const suffix = cleanNamePart(
    input.suffix === undefined ? source.suffix : input.suffix,
    'suffix',
    { max: 30 }
  );
  return {
    firstName,
    middleName: middleName || null,
    lastName,
    suffix: suffix || null,
    displayName: buildDisplayName({ firstName, middleName, lastName, suffix })
  };
}

function hasStructuredNameInput(input = {}) {
  return ['firstName', 'middleName', 'lastName', 'suffix'].some(key => input[key] !== undefined);
}

module.exports = {
  buildDisplayName,
  normalizeStructuredName,
  hasStructuredNameInput
};
