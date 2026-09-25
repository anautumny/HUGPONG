'use strict';

// Load the same server/.env configuration as the backend before evaluating
// the explicit development-only gates below.
require('../config');
const { db } = require('../firebase-admin');
const { ROLES } = require('../schema/firestoreSchema');
const {
  DEVELOPMENT_SUPER_ADMIN,
  assertDevelopmentBootstrapAllowed,
  bootstrapInitialDevelopmentSuperAdmin
} = require('../services/developmentBootstrap');

const API_BASE_URL = String(process.env.HUGPONG_API_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const PASSWORD = process.env.DEVELOPMENT_TEST_PASSWORD;
const TEST_ACCOUNTS = Object.freeze({
  superAdmin: DEVELOPMENT_SUPER_ADMIN,
  sraAdmin: { userId: '02000001', displayName: 'Development SRA Admin', phone: '09170000002', role: ROLES.SRA_ADMIN },
  farmManager: { userId: '03000001', displayName: 'Development Farm Manager', phone: '09170000003', role: ROLES.FARM_MANAGER },
  memberFarmer: {
    userId: '04000001',
    displayName: 'Development Farm Member',
    phone: '09170000004',
    role: ROLES.MEMBER_FARMER,
    // This is request-only scope evidence for the Farm Manager API. The
    // canonical persisted member relationship is fields.memberUserId.
    approvalBlockFarmId: 'DEV-BF-001'
  }
});
const TEST_BLOCK_FARM = Object.freeze({
  id: 'DEV-BF-001',
  code: 'DEV-BF-001',
  name: 'Development Test Block Farm',
  location: 'Local development only',
  declaredAreaHa: 1
});
const TEST_FIELD = Object.freeze({
  id: 'DEV-FLD-001',
  areaHa: 1,
  cropType: 'Sugarcane',
  cropYear: '2026-2027',
  currentStageNumber: 1,
  elapsedMonths: 0,
  batchNumber: 1
});

async function request(path, { method = 'GET', token, body, expectedStatus } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-hugpong-development-seed': 'true',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (expectedStatus !== undefined) {
    if (response.status !== expectedStatus) throw new Error(`${method} ${path} expected ${expectedStatus}, received ${response.status}: ${payload.error || ''}`);
    return payload;
  }
  if (!response.ok || !payload.success) throw new Error(`${method} ${path} failed (${response.status}): ${payload.error || 'Unknown error'}`);
  return payload;
}

async function login(account, password = PASSWORD) {
  const result = await request('/auth/login', {
    method: 'POST',
    body: { contactNumber: account.userId, password }
  });
  return result.token;
}

async function listUsers(token) {
  return (await request('/api/users', { token })).data || [];
}

async function ensureAccount(token, account) {
  const existing = (await listUsers(token)).find(user => user.id === account.userId);
  if (existing) {
    if (existing.role !== account.role || existing.phone !== account.phone || existing.displayName !== account.displayName) {
      throw new Error(`Reserved development account ${account.userId} already belongs to a different user. Refusing to overwrite it.`);
    }
    await login(account);
    return { created: false };
  }
  await request('/api/users/approve', {
    method: 'POST',
    token,
    body: {
      id: account.userId,
      displayName: account.displayName,
      phone: account.phone,
      role: account.role,
      password: PASSWORD,
      requiresPasswordChange: true,
      ...(account.approvalBlockFarmId ? { blockFarmId: account.approvalBlockFarmId } : {})
    }
  });
  return { created: true };
}

async function ensureBlockFarm(token) {
  const farms = (await request('/api/block-farms', { token })).data || [];
  const existing = farms.find(farm => farm.id === TEST_BLOCK_FARM.id);
  if (!existing) {
    await request('/api/block-farms', { method: 'POST', token, body: { ...TEST_BLOCK_FARM, managerUserId: null } });
    return { created: true };
  }
  if (existing.code !== TEST_BLOCK_FARM.code || existing.name !== TEST_BLOCK_FARM.name) {
    throw new Error(`Reserved development block farm ${TEST_BLOCK_FARM.id} already belongs to a different record. Refusing to overwrite it.`);
  }
  return { created: false };
}

async function ensureManagerAssignment(token) {
  const farms = (await request('/api/block-farms', { token })).data || [];
  const farm = farms.find(item => item.id === TEST_BLOCK_FARM.id);
  if (!farm) throw new Error('Development test block farm was not found after creation.');
  if (farm.managerUserId && farm.managerUserId !== TEST_ACCOUNTS.farmManager.userId) {
    throw new Error('Development test block farm is assigned to a different manager. Refusing to overwrite it.');
  }
  if (farm.managerUserId !== TEST_ACCOUNTS.farmManager.userId) {
    await request(`/api/block-farms/${encodeURIComponent(TEST_BLOCK_FARM.id)}`, {
      method: 'PUT', token, body: { managerUserId: TEST_ACCOUNTS.farmManager.userId }
    });
  }
}

async function ensureField(managerToken) {
  const fields = (await request('/api/fields', { token: managerToken })).data || [];
  const existing = fields.find(field => field.id === TEST_FIELD.id);
  if (existing) {
    if (existing.blockFarmId !== TEST_BLOCK_FARM.id || existing.memberUserId !== TEST_ACCOUNTS.memberFarmer.userId) {
      throw new Error(`Reserved development field ${TEST_FIELD.id} has a different canonical relationship. Refusing to overwrite it.`);
    }
    return { created: false };
  }
  await request('/api/fields', {
    method: 'POST',
    token: managerToken,
    body: {
      id: TEST_FIELD.id,
      areaHa: TEST_FIELD.areaHa,
      cropType: TEST_FIELD.cropType,
      currentStageNumber: TEST_FIELD.currentStageNumber,
      elapsedMonths: TEST_FIELD.elapsedMonths,
      batchNumber: TEST_FIELD.batchNumber,
      blockFarmId: TEST_BLOCK_FARM.id,
      memberUserId: TEST_ACCOUNTS.memberFarmer.userId
    }
  });
  return { created: true };
}

async function verifyAuthenticationAndRbac(tokens) {
  await request('/api/fields', { expectedStatus: 401 });
  for (const account of Object.values(TEST_ACCOUNTS)) {
    await request('/auth/login', { method: 'POST', body: { contactNumber: account.userId, password: 'incorrect-password' }, expectedStatus: 401 });
    await request('/auth/session', { token: tokens[account.userId], expectedStatus: 200 });
    await request('/auth/logout', { method: 'POST', token: tokens[account.userId], expectedStatus: 200 });
  }
  await request('/auth/login', { method: 'POST', body: { contactNumber: '04999999', password: PASSWORD }, expectedStatus: 401 });

  const superUsers = await listUsers(tokens[TEST_ACCOUNTS.superAdmin.userId]);
  if (!Object.values(TEST_ACCOUNTS).every(account => superUsers.some(user => user.id === account.userId))) {
    throw new Error('Super Admin verification failed: the system-wide user directory is incomplete.');
  }
  const resolvedManager = superUsers.find(user => user.id === TEST_ACCOUNTS.farmManager.userId);
  const resolvedMember = superUsers.find(user => user.id === TEST_ACCOUNTS.memberFarmer.userId);
  if (resolvedManager?.assignment?.displayLabel !== `${TEST_BLOCK_FARM.name} (Manager)`) {
    throw new Error('Super Admin verification failed: the Farm Manager assignment was not resolved canonically.');
  }
  if (resolvedMember?.assignment?.displayLabel !== `${TEST_BLOCK_FARM.name} · ${TEST_FIELD.id}`) {
    throw new Error('Super Admin verification failed: the Farm Member Field relationship was not resolved canonically.');
  }
  const sraFarms = (await request('/api/block-farms', { token: tokens[TEST_ACCOUNTS.sraAdmin.userId] })).data || [];
  if (!sraFarms.some(farm => farm.id === TEST_BLOCK_FARM.id)) throw new Error('SRA Admin verification failed: test block farm is unavailable.');
  await request('/api/tickets/NO-SUCH-TICKET', { method: 'PATCH', token: tokens[TEST_ACCOUNTS.sraAdmin.userId], body: { status: 'CLOSED' }, expectedStatus: 403 });

  const managerFields = (await request('/api/fields', { token: tokens[TEST_ACCOUNTS.farmManager.userId] })).data || [];
  if (!managerFields.some(field => field.id === TEST_FIELD.id)) throw new Error('Farm Manager verification failed: assigned field is unavailable.');
  await request('/api/fields', {
    method: 'POST',
    token: tokens[TEST_ACCOUNTS.farmManager.userId],
    body: { ...TEST_FIELD, id: 'DEV-DENY-001', blockFarmId: 'NOT-ASSIGNED', memberUserId: TEST_ACCOUNTS.memberFarmer.userId },
    expectedStatus: 403
  });

  const memberFields = (await request('/api/fields', { token: tokens[TEST_ACCOUNTS.memberFarmer.userId] })).data || [];
  if (memberFields.length !== 1 || memberFields[0].id !== TEST_FIELD.id) {
    throw new Error('Farm Member verification failed: field scope is not limited to the assigned test field.');
  }
  await request('/api/users', { token: tokens[TEST_ACCOUNTS.memberFarmer.userId], expectedStatus: 403 });
}

async function main() {
  assertDevelopmentBootstrapAllowed();
  const superBootstrap = await bootstrapInitialDevelopmentSuperAdmin({ db, password: PASSWORD });
  const superToken = await login(TEST_ACCOUNTS.superAdmin);

  const sra = await ensureAccount(superToken, TEST_ACCOUNTS.sraAdmin);
  const sraToken = await login(TEST_ACCOUNTS.sraAdmin);
  const blockFarm = await ensureBlockFarm(sraToken);
  const manager = await ensureAccount(sraToken, TEST_ACCOUNTS.farmManager);
  await ensureManagerAssignment(sraToken);
  const managerToken = await login(TEST_ACCOUNTS.farmManager);
  const member = await ensureAccount(managerToken, TEST_ACCOUNTS.memberFarmer);
  const memberToken = await login(TEST_ACCOUNTS.memberFarmer);
  const field = await ensureField(managerToken);

  const tokens = {
    [TEST_ACCOUNTS.superAdmin.userId]: superToken,
    [TEST_ACCOUNTS.sraAdmin.userId]: sraToken,
    [TEST_ACCOUNTS.farmManager.userId]: managerToken,
    [TEST_ACCOUNTS.memberFarmer.userId]: memberToken
  };
  await verifyAuthenticationAndRbac(tokens);

  console.log('[HUGPONG DEV] Test accounts and minimum RBAC relationships are ready.');
  console.log(`[HUGPONG DEV] Super Admin bootstrap: ${superBootstrap.created ? 'created' : 'reused'}; SRA=${sra.created ? 'created' : 'reused'}; Manager=${manager.created ? 'created' : 'reused'}; Member=${member.created ? 'created' : 'reused'}; Block Farm=${blockFarm.created ? 'created' : 'reused'}; Field=${field.created ? 'created' : 'reused'}.`);
  console.log('[HUGPONG DEV] Non-Super test accounts deliberately require their normal first-login OTP and password-change workflow before Firestore realtime access is account-ready.');
}

main().catch(error => {
  console.error(`[HUGPONG DEV] Bootstrap failed: ${error.message}`);
  process.exitCode = 1;
});
