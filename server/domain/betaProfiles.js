'use strict';

const { normalizeStructuredName } = require('./personName');
const { BETA_PHONES } = require('./betaPhones');

// Fictional full names and random PH-format profile phones for the removable beta batch.
const BETA_MANAGER_NAME = Object.freeze(normalizeStructuredName({ firstName: 'Miguel', middleName: 'Santos', lastName: 'Reyes' }));
const BETA_MEMBER_PROFILES = Object.freeze([
  { firstName: 'Ramon', middleName: 'Garcia', lastName: 'Mendoza' },
  { firstName: 'Elena', middleName: 'Cruz', lastName: 'Villanueva' },
  { firstName: 'Jose', middleName: 'Luis', lastName: 'Navarro' },
  { firstName: 'Marites', middleName: 'Ramos', lastName: 'Bautista' },
  { firstName: 'Roberto', middleName: 'Diaz', lastName: 'Castillo' }
].map((name, index) => Object.freeze({ ...normalizeStructuredName(name), phone: BETA_PHONES[index] })));

module.exports = { BETA_MANAGER_NAME, BETA_MEMBER_PROFILES };
