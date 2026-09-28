'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROLES } = require('../schema/firestoreSchema');
const { createUserId } = require('../domain/systemIds');
const { phoneIdentifierId } = require('../services/accountProvisioningService');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('server issues cryptographically generated role-prefixed User IDs', () => {
  const expectations = [
    [ROLES.SUPER_ADMIN, /^01\d{6}$/],
    [ROLES.SRA_ADMIN, /^02\d{6}$/],
    [ROLES.FARM_MANAGER, /^03\d{6}$/],
    [ROLES.MEMBER_FARMER, /^04\d{6}$/]
  ];
  for (const [role, pattern] of expectations) {
    const ids = Array.from({ length: 1000 }, () => createUserId(role));
    // The public format deliberately has a finite six-digit suffix. The
    // provisioning service resolves the rare collision atomically.
    assert.ok(new Set(ids).size > 990);
    assert.ok(ids.every(id => pattern.test(id)));
  }
  assert.throws(() => createUserId('UNKNOWN'), /canonical role/);
});

test('phone uniqueness claims are opaque, deterministic, and server-only', () => {
  const first = phoneIdentifierId('0917 123 4567');
  assert.equal(first, phoneIdentifierId('09171234567'));
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(first, /09171234567/);
  const rules = read('firestore.rules');
  assert.match(rules, /match \/account_identifiers\/\{documentId\}[\s\S]*?allow read, write: if false;/);
  const provisioning = read('server/services/accountProvisioningService.js');
  assert.match(provisioning, /batch\.create\(phoneRef/);
  assert.match(provisioning, /queueAuditEvent\(batch/);
});

test('authoritative mutations write their audit event in the same batch or transaction', () => {
  const sources = [
    'server/routes/blockFarms.js',
    'server/routes/fields.js',
    'server/routes/tickets.js',
    'server/routes/users.js',
    'server/routes/auditReports.js',
    'server/services/cropCycleOperations.js',
    'server/services/priceService.js'
  ].map(read).join('\n');
  assert.doesNotMatch(sources, /ensurePricePublicationAudit/);
  assert.ok((sources.match(/queueAuditEvent\(/g) || []).length >= 20);
  assert.match(read('server/services/priceService.js'), /runTransaction[\s\S]*transaction\.create\(ref, payload\)[\s\S]*queueAuditEvent\(transaction/);
});

test('active clients do not manufacture organization, district, appointment, or compliance claims', () => {
  const runtime = [
    'mobile/src/data/dataStore.js',
    'mobile/src/screens/HomeScreen.js',
    'mobile/src/screens/ProfileScreen.js',
    'mobile/src/screens/FieldOpsScreen.js',
    'mobile/src/screens/sra/SRAHomeView.js',
    'mobile/src/services/auditPdfService.js',
    'web/react-app/src/components/audit/PrintableAuditReport.jsx',
    'web/react-app/src/components/audit/AuditDossierCard.jsx'
  ].map(read).join('\n');
  assert.doesNotMatch(runtime, /Pending Appointment|HPCo Silay|District 3|Silay Mill District|Certified compliant under|Silay Block Farm Auditor/);
});

test('active identifier generation has no Math.random fallback', () => {
  const identitySources = [
    'server/domain/systemIds.js',
    'server/routes/auth.js',
    'server/routes/users.js',
    'server/routes/tickets.js',
    'server/services/priceService.js',
    'mobile/src/services/secureId.js',
    'mobile/src/services/mutationOutboxCore.js',
    'mobile/src/services/syncEngine.js',
    'web/react-app/src/services/apiClient.js',
    'web/react-app/src/services/ticketsService.js',
    'web/react-app/src/utils/secureId.js'
  ].map(read).join('\n');
  assert.doesNotMatch(identitySources, /Math\.random/);
});
