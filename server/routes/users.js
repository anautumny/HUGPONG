'use strict';

const express = require('express');
const router = express.Router();
const { admin, db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const { hashPassword, validatePassword } = require('../security/password');
const { publicUser } = require('../security/userProjection');
const {
  COLLECTIONS,
  ROLES,
  canonicalRole,
  requiredString,
  nowIso
} = require('../schema/firestoreSchema');
const { readMutationContext, assertBaseVersion } = require('../services/mutationContext');
const { assertNoClientIdentity, readDevelopmentSeedId } = require('../domain/systemIds');
const { resolveDirectoryAssignments, resolveDirectoryAssignmentsFromDatabase } = require('../services/userDirectoryService');
const { createRateLimit } = require('../middleware/rateLimit');
const { authVersionOf, nextAuthVersion, revokeFirebaseSessions, setFirebaseAccountDisabled } = require('../security/accountSecurity');
const { createUserAccount, phoneIdentifierId } = require('../services/accountProvisioningService');
const { queueAuditEvent } = require('../services/auditWriter');
const { normalizeStructuredName, hasStructuredNameInput } = require('../domain/personName');
const { pageLimit, decodeCursor, encodeCursor } = require('../services/cursorPagination');
const {
  resolvePhoneVerificationReason,
  assertPhoneVerificationAuthority
} = require('../domain/phoneVerificationPolicy');

const accountCreationLimit = createRateLimit({ name: 'users-account-create', max: 30, windowMs: 60 * 60 * 1000 });

async function managerFarmIds(userId) {
  const farms = await db.collection(COLLECTIONS.BLOCK_FARMS).where('managerUserId', '==', userId).get();
  return farms.docs.map(doc => doc.id);
}

async function assertManagerUserScope(actorId, targetUserId, requestedBlockFarmId = null) {
  const farmIds = await managerFarmIds(actorId);
  if (requestedBlockFarmId && farmIds.includes(String(requestedBlockFarmId).trim().toUpperCase())) return;
  const fields = await db.collection(COLLECTIONS.FIELDS).where('memberUserId', '==', targetUserId).get();
  if (!fields.docs.some(doc => farmIds.includes(doc.data().blockFarmId))) {
    throw Object.assign(new Error('Member account is outside the Farm Manager assigned block farm.'), { status: 403 });
  }
}

async function loadManagerFarmForAssignment(blockFarmId, managerUserId = null) {
  const normalizedFarmId = String(blockFarmId || '').trim().toUpperCase();
  if (!normalizedFarmId) {
    throw Object.assign(new Error('Select a Block Farm before creating this Farm Manager.'), { status: 400 });
  }
  const snapshot = await db.collection(COLLECTIONS.BLOCK_FARMS).doc(normalizedFarmId).get();
  if (!snapshot.exists || String(snapshot.data().status || 'ACTIVE').toUpperCase() !== 'ACTIVE') {
    throw Object.assign(new Error('The selected Block Farm is not available.'), { status: 400 });
  }
  const assignedManagerId = String(snapshot.data().managerUserId || '').trim();
  if (assignedManagerId && assignedManagerId !== String(managerUserId || '').trim()) {
    throw Object.assign(new Error('The selected Block Farm already has a Farm Manager.'), { status: 409 });
  }
  return snapshot;
}

function queueManagerFarmAssignment(writer, database, farmSnapshot, managerUserId, actorUserId, updatedAt) {
  if (!farmSnapshot) return;
  const farmRef = database.collection(COLLECTIONS.BLOCK_FARMS).doc(farmSnapshot.id);
  const update = {
    managerUserId,
    updatedAt
  };
  if (farmSnapshot.updateTime) {
    writer.update(farmRef, update, { lastUpdateTime: farmSnapshot.updateTime });
  } else {
    writer.update(farmRef, update);
  }
  queueAuditEvent(writer, database, {
    eventType: 'BLOCK_FARM_MANAGER_ASSIGNED',
    actorUserId,
    entityType: 'BLOCK_FARM',
    entityId: farmSnapshot.id,
    blockFarmId: farmSnapshot.id,
    details: `Assigned Farm Manager ${managerUserId} to block farm ${farmSnapshot.id}.`,
    createdAt: updatedAt
  });
}

function queuePhoneVerificationAudit(writer, database, targetUserId, actorUserId, createdAt) {
  queueAuditEvent(writer, database, {
    eventType: 'USER_PHONE_VERIFIED_BY_AUTHORITY',
    actorUserId,
    entityType: 'USER',
    entityId: targetUserId,
    details: `Authorized phone verification completed for account ${targetUserId}; confidential evidence remains on the user record.`,
    createdAt
  });
}

router.get('/', requireAuth, requireRole([ROLES.FARM_MANAGER, ROLES.SRA_ADMIN, ROLES.SUPER_ADMIN]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const actorRole = canonicalRole(req.session.user.role || req.session.user.roleKey);
    const actorId = String(req.session.user.employeeId || '').trim();
    let documents = [];
    let page = { limit: pageLimit(req.query.limit), hasMore: false, nextCursor: null };
    if (actorRole === ROLES.FARM_MANAGER) {
      const permittedFarmIds = await managerFarmIds(actorId);
      const permittedIds = new Set([actorId]);
      for (let index = 0; index < permittedFarmIds.length; index += 10) {
        const fields = await db.collection(COLLECTIONS.FIELDS)
          .where('blockFarmId', 'in', permittedFarmIds.slice(index, index + 10))
          .get();
        fields.docs.forEach(doc => {
          if (doc.data().memberUserId) permittedIds.add(doc.data().memberUserId);
        });
      }
      const recordsById = new Map();
      const scopedUsers = await db.getAll(...Array.from(permittedIds).map(id => db.collection(COLLECTIONS.USERS).doc(id)));
      scopedUsers.filter(doc => doc.exists).forEach(doc => recordsById.set(doc.id, doc));
      for (let index = 0; index < permittedFarmIds.length; index += 10) {
        const pending = await db.collection(COLLECTIONS.USERS)
          .where('requestedBlockFarmId', 'in', permittedFarmIds.slice(index, index + 10))
          .get();
        pending.docs.filter(doc => doc.data().status === 'PENDING').forEach(doc => recordsById.set(doc.id, doc));
        const affiliated = await db.collection(COLLECTIONS.USERS)
          .where('affiliatedBlockFarmId', 'in', permittedFarmIds.slice(index, index + 10))
          .get();
        affiliated.docs.forEach(doc => recordsById.set(doc.id, doc));
      }
      documents = Array.from(recordsById.values());
    } else if (actorRole === ROLES.SUPER_ADMIN) {
      const cursor = decodeCursor(req.query.cursor);
      let query = db.collection(COLLECTIONS.USERS)
        .orderBy('displayName', 'asc')
        .orderBy(admin.firestore.FieldPath.documentId(), 'asc');
      if (cursor) query = query.startAfter(cursor.value, cursor.id);
      const snapshot = await query.limit(page.limit + 1).get();
      const hasMore = snapshot.docs.length > page.limit;
      documents = snapshot.docs.slice(0, page.limit);
      const last = documents.at(-1);
      page = {
        limit: page.limit,
        hasMore,
        nextCursor: hasMore && last ? encodeCursor(last.data().displayName, last.id) : null
      };
    } else {
      const snapshot = await db.collection(COLLECTIONS.USERS).get();
      documents = snapshot.docs;
    }
    const scopedUsers = documents
      .filter(doc => actorRole !== ROLES.SRA_ADMIN || canonicalRole(doc.data().role) !== ROLES.SUPER_ADMIN)
      .map(doc => publicUser(doc.data(), doc.id))
      .sort((left, right) => String(left.displayName || left.name || '').localeCompare(String(right.displayName || right.name || '')) || String(left.id || '').localeCompare(String(right.id || '')));
    const data = await resolveDirectoryAssignmentsFromDatabase(db, scopedUsers);
    return res.json({ success: true, count: data.length, data, page });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

router.post('/approve', requireAuth, requireRole([ROLES.FARM_MANAGER, ROLES.SRA_ADMIN, ROLES.SUPER_ADMIN]), accountCreationLimit, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const mutationContext = readMutationContext(req);
    const actorRole = canonicalRole(req.session.user.role || req.session.user.roleKey);
    let role = canonicalRole(req.body.role || ROLES.MEMBER_FARMER);
    if (!role) throw new Error('role must be a canonical HUGPONG role.');
    if (actorRole === ROLES.FARM_MANAGER && role !== ROLES.MEMBER_FARMER) {
      return res.status(403).json({ success: false, error: 'Farm Managers may approve only Farm Member accounts.' });
    }
    if (actorRole === ROLES.SRA_ADMIN && ![ROLES.MEMBER_FARMER, ROLES.FARM_MANAGER].includes(role)) {
      return res.status(403).json({ success: false, error: 'SRA Admins may approve Farm Member or Farm Manager accounts.' });
    }
    const requestedUserId = req.body.id ? requiredString(req.body.id, 'id', { max: 8 }) : null;
    const developmentSeedId = readDevelopmentSeedId(req);
    if (requestedUserId && !/^\d{8}$/.test(requestedUserId)) throw new Error('id must be an eight-digit HUGPONG user ID.');
    const userRef = requestedUserId ? db.collection(COLLECTIONS.USERS).doc(requestedUserId) : null;
    const existingUser = userRef ? await userRef.get() : null;
    const now = nowIso();
    if (existingUser?.exists) {
      const userId = existingUser.id;
      const current = existingUser.data();
      const actorId = String(req.session.user.employeeId || '').trim();
      if (current.status === 'ACTIVE' && current.approvedByUserId === actorId && canonicalRole(current.role) === role) {
        return res.json({ success: true, replayed: true, accountId: userId, data: publicUser(current, userId) });
      }
      if (current.status !== 'PENDING') return res.status(409).json({ success: false, error: 'Account already exists and is not pending approval.' });
      if (canonicalRole(current.role) !== role) return res.status(400).json({ success: false, error: 'Pending account role cannot be changed during approval.' });
      const needsPhoneVerification = !current.phoneVerifiedAt;
      const verificationReason = needsPhoneVerification ? resolvePhoneVerificationReason(req.body) : null;
      assertBaseVersion(current.updatedAt, mutationContext, userId, publicUser(current, userId));
      let affiliatedBlockFarmId = current.affiliatedBlockFarmId || null;
      let managerFarmSnapshot = null;
      if (role === ROLES.MEMBER_FARMER) {
        affiliatedBlockFarmId = String(req.body.blockFarmId || current.requestedBlockFarmId || '').trim().toUpperCase();
        if (!affiliatedBlockFarmId) {
          return res.status(400).json({ success: false, error: 'Assign a Block Farm before approving this Farm Member.' });
        }
        const farm = await db.collection(COLLECTIONS.BLOCK_FARMS).doc(affiliatedBlockFarmId).get();
        if (!farm.exists || String(farm.data().status || 'ACTIVE').toUpperCase() !== 'ACTIVE') {
          return res.status(400).json({ success: false, error: 'The selected Block Farm is not available.' });
        }
        if (actorRole === ROLES.FARM_MANAGER) {
          const requestedFarmId = String(current.requestedBlockFarmId || '').trim().toUpperCase();
          if (!requestedFarmId || requestedFarmId !== affiliatedBlockFarmId) {
            return res.status(403).json({
              success: false,
              error: 'A Farm Manager may approve only a member who selected that manager\'s Block Farm during registration.'
            });
          }
          await assertManagerUserScope(String(req.session.user.employeeId || '').trim(), userId, affiliatedBlockFarmId);
        }
      } else if (role === ROLES.FARM_MANAGER) {
        managerFarmSnapshot = await loadManagerFarmForAssignment(req.body.blockFarmId, userId);
      }
      if (needsPhoneVerification) {
        await assertPhoneVerificationAuthority(db, {
          actorId,
          actorRole,
          targetUserId: userId,
          targetRole: current.role,
          requestedBlockFarmId: current.requestedBlockFarmId,
          affiliatedBlockFarmId: current.affiliatedBlockFarmId,
          selectedBlockFarmId: affiliatedBlockFarmId
        });
      }
      const approved = {
        ...current,
        status: 'ACTIVE',
        affiliatedBlockFarmId,
        phoneVerifiedAt: needsPhoneVerification ? now : current.phoneVerifiedAt,
        phoneVerificationStatus: 'VERIFIED',
        phoneVerificationMethod: needsPhoneVerification ? 'AUTHORIZED_REVIEW' : (current.phoneVerificationMethod || 'SMS_OTP'),
        phoneVerifiedByUserId: needsPhoneVerification ? actorId : (current.phoneVerifiedByUserId || null),
        phoneVerificationReasonCode: needsPhoneVerification ? verificationReason.code : (current.phoneVerificationReasonCode || null),
        phoneVerificationReason: needsPhoneVerification ? verificationReason.summary : (current.phoneVerificationReason || null),
        authVersion: authVersionOf(current),
        disabledAt: null,
        approvedByUserId: String(req.session.user.employeeId || '').trim(),
        approvedAt: now,
        updatedAt: now
      };
      const batch = db.batch();
      batch.update(userRef, {
        status: approved.status,
        affiliatedBlockFarmId: approved.affiliatedBlockFarmId,
        approvedByUserId: approved.approvedByUserId,
        approvedAt: approved.approvedAt,
        phoneVerifiedAt: approved.phoneVerifiedAt,
        phoneVerificationStatus: approved.phoneVerificationStatus,
        phoneVerificationMethod: approved.phoneVerificationMethod,
        phoneVerifiedByUserId: approved.phoneVerifiedByUserId,
        phoneVerificationReasonCode: approved.phoneVerificationReasonCode,
        phoneVerificationReason: approved.phoneVerificationReason,
        authVersion: approved.authVersion,
        disabledAt: approved.disabledAt,
        updatedAt: approved.updatedAt
      });
      queueManagerFarmAssignment(
        batch,
        db,
        managerFarmSnapshot,
        userId,
        approved.approvedByUserId,
        approved.updatedAt
      );
      queueAuditEvent(batch, db, {
        eventType: 'USER_ACCOUNT_APPROVED',
        actorUserId: approved.approvedByUserId,
        entityType: 'USER',
        entityId: userId,
        details: `Approved ${role} account ${userId}.`,
        createdAt: now
      });
      if (needsPhoneVerification) queuePhoneVerificationAudit(batch, db, userId, actorId, now);
      await batch.commit();
      const approvedUser = publicUser(approved, userId);
      const data = managerFarmSnapshot
        ? resolveDirectoryAssignments(
          [approvedUser],
          [{ id: managerFarmSnapshot.id, ...managerFarmSnapshot.data(), managerUserId: userId }],
          []
        )[0]
        : approvedUser;
      return res.json({ success: true, accountId: userId, data });
    }
    if (!developmentSeedId) assertNoClientIdentity(req.body, ['id', 'userId', 'employeeId'], 'User');
    const phone = requiredString(req.body.phone, 'phone', { max: 20 }).replace(/\D/g, '');
    if (!/^09\d{9}$/.test(phone)) throw new Error('phone must be an 11-digit Philippine mobile number.');
    const existing = await db.collection(COLLECTIONS.USERS).where('phone', '==', phone).limit(1).get();
    if (!existing.empty) return res.status(409).json({ success: false, error: 'phone is already registered.' });
    validatePassword(req.body.password);
    const identity = normalizeStructuredName(req.body || {});
    const requestedBlockFarmId = String(req.body.blockFarmId || '').trim().toUpperCase();
    let affiliatedBlockFarmId = null;
    let managerFarmSnapshot = null;
    if (role === ROLES.MEMBER_FARMER && requestedBlockFarmId) {
      const farm = await db.collection(COLLECTIONS.BLOCK_FARMS).doc(requestedBlockFarmId).get();
      if (!farm.exists || String(farm.data().status || 'ACTIVE').toUpperCase() !== 'ACTIVE') {
        throw new Error('The selected Block Farm is not available.');
      }
      affiliatedBlockFarmId = requestedBlockFarmId;
    }
    if (role === ROLES.FARM_MANAGER) {
      managerFarmSnapshot = await loadManagerFarmForAssignment(requestedBlockFarmId, developmentSeedId);
    }
    if (actorRole === ROLES.FARM_MANAGER) {
      if (!requestedBlockFarmId) throw new Error('Farm Managers must assign a Block Farm when creating a Farm Member.');
      await assertManagerUserScope(String(req.session.user.employeeId || '').trim(), requestedUserId || '', requestedBlockFarmId);
    }
    const phoneVerificationMode = String(req.body.phoneVerificationMode || 'REQUIRED').trim().toUpperCase();
    if (!['REQUIRED', 'VERIFIED'].includes(phoneVerificationMode)) {
      return res.status(400).json({ success: false, error: 'phoneVerificationMode must be REQUIRED or VERIFIED.' });
    }
    const actorId = String(req.session.user.employeeId || req.session.user.userId || '').trim();
    const verificationReason = phoneVerificationMode === 'VERIFIED'
      ? resolvePhoneVerificationReason(req.body)
      : null;
    if (phoneVerificationMode === 'VERIFIED') {
      await assertPhoneVerificationAuthority(db, {
        actorId,
        actorRole,
        targetRole: role,
        affiliatedBlockFarmId,
        selectedBlockFarmId: requestedBlockFarmId
      });
    }
    const payload = {
      ...identity,
      phone,
      role,
      status: 'ACTIVE',
      affiliatedBlockFarmId,
      phoneVerifiedAt: phoneVerificationMode === 'VERIFIED' ? now : null,
      phoneVerificationStatus: phoneVerificationMode === 'VERIFIED' ? 'VERIFIED' : 'PENDING_VERIFICATION',
      phoneVerificationMethod: phoneVerificationMode === 'VERIFIED' ? 'AUTHORIZED_REVIEW' : null,
      phoneVerificationRequestedAt: phoneVerificationMode === 'VERIFIED' ? null : now,
      phoneVerifiedByUserId: phoneVerificationMode === 'VERIFIED' ? actorId : null,
      phoneVerificationReasonCode: verificationReason?.code || null,
      phoneVerificationReason: verificationReason?.summary || null,
      requiresPasswordChange: true,
      passwordChangedAt: null,
      authVersion: 1,
      credentialsUpdatedAt: now,
      disabledAt: null,
      approvedByUserId: String(req.session.user.employeeId || req.session.user.userId || '').trim(),
      approvedAt: now,
      createdAt: now,
      updatedAt: now
    };
    const passwordHash = await hashPassword(req.body.password);
    const userId = await createUserAccount(db, {
      requestedUserId: developmentSeedId,
      user: payload,
      credential: { passwordHash, credentialsUpdatedAt: now, createdAt: now, updatedAt: now },
      actorUserId: actorId,
      eventType: 'USER_ACCOUNT_CREATED',
      details: `Created ${role} account ${payload.displayName}.`,
      queueRelatedWrites: (writer, database, createdUserId) => {
        queueManagerFarmAssignment(writer, database, managerFarmSnapshot, createdUserId, actorId, now);
        if (phoneVerificationMode === 'VERIFIED') {
          queuePhoneVerificationAudit(writer, database, createdUserId, actorId, now);
        }
      }
    });
    const createdUser = publicUser(payload, userId);
    const data = managerFarmSnapshot
      ? resolveDirectoryAssignments(
        [createdUser],
        [{ id: managerFarmSnapshot.id, ...managerFarmSnapshot.data(), managerUserId: userId }],
        []
      )[0]
      : createdUser;
    return res.status(201).json({ success: true, accountId: userId, data });
  } catch (error) {
    const errorCode = String(error?.code ?? '').toLowerCase();
    const assignmentConflict = ['9', '10', 'aborted', 'failed-precondition'].includes(errorCode);
    const status = error.status || ((assignmentConflict || /already exists/i.test(error.message)) ? 409 : 400);
    const message = assignmentConflict
      ? 'The selected Block Farm changed while the account was being created. Reload and try again.'
      : error.message;
    return res.status(status).json({ success: false, error: message });
  }
});

router.post('/:userId/verify-phone', requireAuth, requireRole([ROLES.FARM_MANAGER, ROLES.SRA_ADMIN, ROLES.SUPER_ADMIN]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const userId = requiredString(req.params.userId, 'userId', { max: 80 });
    const targetRef = db.collection(COLLECTIONS.USERS).doc(userId);
    const targetSnapshot = await targetRef.get();
    if (!targetSnapshot.exists) return res.status(404).json({ success: false, error: 'User was not found.' });
    const current = targetSnapshot.data();
    if (current.phoneVerifiedAt) {
      const currentStatus = String(current.status || '').toUpperCase();
      return res.json({
        success: true,
        replayed: true,
        accepted: currentStatus === 'ACTIVE',
        pendingApproval: currentStatus === 'PENDING',
        data: publicUser(current, userId)
      });
    }
    const targetStatus = String(current.status || '').toUpperCase();
    if (!['ACTIVE', 'PENDING'].includes(targetStatus)) {
      return res.status(409).json({ success: false, error: 'Only active or pending accounts can receive phone verification.' });
    }
    const actorId = String(req.session.user.employeeId || req.session.user.userId || '').trim();
    const actorRole = canonicalRole(req.session.user.role || req.session.user.roleKey);
    const verificationReason = resolvePhoneVerificationReason(req.body);
    await assertPhoneVerificationAuthority(db, {
      actorId,
      actorRole,
      targetUserId: userId,
      targetRole: current.role,
      requestedBlockFarmId: current.requestedBlockFarmId,
      affiliatedBlockFarmId: current.affiliatedBlockFarmId
    });
    const verifiedAt = nowIso();
    const update = {
      phoneVerifiedAt: verifiedAt,
      phoneVerificationStatus: 'VERIFIED',
      phoneVerificationMethod: 'AUTHORIZED_REVIEW',
      phoneVerifiedByUserId: actorId,
      phoneVerificationReasonCode: verificationReason.code,
      phoneVerificationReason: verificationReason.summary,
      updatedAt: verifiedAt
    };
    const batch = db.batch();
    batch.update(targetRef, update);
    queuePhoneVerificationAudit(batch, db, userId, actorId, verifiedAt);
    await batch.commit();
    return res.json({
      success: true,
      accepted: targetStatus === 'ACTIVE',
      pendingApproval: targetStatus === 'PENDING',
      data: publicUser({ ...current, ...update }, userId)
    });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message });
  }
});

router.patch('/:userId', requireAuth, requireRole([ROLES.FARM_MANAGER, ROLES.SRA_ADMIN, ROLES.SUPER_ADMIN]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    assertNoClientIdentity(req.body, ['id', 'userId', 'employeeId'], 'User');
    const targetRef = db.collection(COLLECTIONS.USERS).doc(requiredString(req.params.userId, 'userId', { max: 80 }));
    const targetSnapshot = await targetRef.get();
    if (!targetSnapshot.exists) return res.status(404).json({ success: false, error: 'User was not found.' });
    const actorRole = canonicalRole(req.session.user.role || req.session.user.roleKey);
    const current = targetSnapshot.data();
    const targetRole = canonicalRole(req.body.role || current.role);
    if (!targetRole) throw new Error('role must be a canonical HUGPONG role.');
    if (actorRole === ROLES.FARM_MANAGER && targetRole !== ROLES.MEMBER_FARMER) {
      return res.status(403).json({ success: false, error: 'Farm Managers may update only Farm Member accounts.' });
    }
    if (actorRole === ROLES.FARM_MANAGER) {
      await assertManagerUserScope(
        String(req.session.user.employeeId || '').trim(),
        targetSnapshot.id,
        current.affiliatedBlockFarmId || current.requestedBlockFarmId
      );
    }
    if (actorRole === ROLES.SRA_ADMIN && targetRole === ROLES.SUPER_ADMIN) {
      return res.status(403).json({ success: false, error: 'SRA Admins may update only Farm Manager accounts.' });
    }
    if (actorRole === ROLES.SRA_ADMIN && canonicalRole(current.role) !== ROLES.FARM_MANAGER) {
      return res.status(403).json({ success: false, error: 'SRA Admins may update only Farm Manager accounts.' });
    }
    const phone = req.body.phone == null ? current.phone : String(req.body.phone).replace(/\D/g, '');
    if (!/^09\d{9}$/.test(phone)) throw new Error('phone must be an 11-digit Philippine mobile number.');
    if (phone !== current.phone) {
      const duplicate = await db.collection(COLLECTIONS.USERS).where('phone', '==', phone).limit(1).get();
      if (!duplicate.empty && duplicate.docs[0].id !== targetSnapshot.id) {
        return res.status(409).json({ success: false, error: 'phone is already registered.' });
      }
    }
    const phoneChanged = phone !== current.phone;
    const phoneVerifiedAt = phoneChanged ? null : (current.phoneVerifiedAt || null);
    const currentRole = canonicalRole(current.role);
    const managerAssignmentRequested = req.body.blockFarmId !== undefined;
    const shouldUpdateManagerAssignment = managerAssignmentRequested || currentRole !== targetRole;
    let requestedManagerFarmSnapshot = null;
    if (targetRole === ROLES.FARM_MANAGER && shouldUpdateManagerAssignment) {
      requestedManagerFarmSnapshot = await loadManagerFarmForAssignment(req.body.blockFarmId, targetSnapshot.id);
    }
    const update = {
      ...(hasStructuredNameInput(req.body) ? normalizeStructuredName(req.body, current) : {
        firstName: current.firstName || null,
        middleName: current.middleName || null,
        lastName: current.lastName || null,
        suffix: current.suffix || null,
        displayName: current.displayName
      }),
      phone,
      role: targetRole,
      status: req.body.status == null ? current.status : String(req.body.status).trim().toUpperCase(),
      phoneVerifiedAt,
      phoneVerificationStatus: phoneChanged ? 'PENDING_VERIFICATION' : (current.phoneVerificationStatus || (phoneVerifiedAt ? 'VERIFIED' : 'PENDING_VERIFICATION')),
      phoneVerificationMethod: phoneChanged ? null : (current.phoneVerificationMethod || null),
      phoneVerificationRequestedAt: phoneChanged ? null : (current.phoneVerificationRequestedAt || null),
      phoneVerifiedByUserId: phoneChanged ? null : (current.phoneVerifiedByUserId || null),
      phoneVerificationReasonCode: phoneChanged ? null : (current.phoneVerificationReasonCode || null),
      phoneVerificationReason: phoneChanged ? null : (current.phoneVerificationReason || null),
      updatedAt: nowIso()
    };
    if (!['PENDING', 'ACTIVE', 'DISABLED'].includes(update.status)) throw new Error('status is invalid.');
    const authorizationChanged = phoneChanged
      || targetRole !== canonicalRole(current.role)
      || update.status !== current.status;
    if (authorizationChanged) {
      update.authVersion = nextAuthVersion(current);
      update.credentialsUpdatedAt = update.updatedAt;
    }
    update.disabledAt = update.status === 'DISABLED' ? update.updatedAt : null;
    const actorId = String(req.session.user.employeeId || req.session.user.userId || '').trim();
    await db.runTransaction(async transaction => {
      const liveSnapshot = await transaction.get(targetRef);
      if (!liveSnapshot.exists) throw Object.assign(new Error('User was not found.'), { status: 404 });
      const live = liveSnapshot.data();
      if (live.updatedAt !== current.updatedAt) {
        throw Object.assign(new Error('Account was changed by another request. Reload and try again.'), { status: 409 });
      }
      let managedFarmsSnapshot = null;
      let selectedFarmSnapshot = null;
      if (shouldUpdateManagerAssignment && currentRole === ROLES.FARM_MANAGER) {
        managedFarmsSnapshot = await transaction.get(
          db.collection(COLLECTIONS.BLOCK_FARMS).where('managerUserId', '==', targetSnapshot.id)
        );
      }
      if (requestedManagerFarmSnapshot) {
        selectedFarmSnapshot = managedFarmsSnapshot?.docs.find(doc => doc.id === requestedManagerFarmSnapshot.id)
          || await transaction.get(db.collection(COLLECTIONS.BLOCK_FARMS).doc(requestedManagerFarmSnapshot.id));
        if (!selectedFarmSnapshot.exists || String(selectedFarmSnapshot.data().status || 'ACTIVE').toUpperCase() !== 'ACTIVE') {
          throw Object.assign(new Error('The selected Block Farm is not available.'), { status: 400 });
        }
        const assignedManagerId = String(selectedFarmSnapshot.data().managerUserId || '').trim();
        if (assignedManagerId && assignedManagerId !== targetSnapshot.id) {
          throw Object.assign(new Error('The selected Block Farm already has a Farm Manager.'), { status: 409 });
        }
      }
      if (phoneChanged) {
        const newPhoneRef = db.collection(COLLECTIONS.ACCOUNT_IDENTIFIERS).doc(phoneIdentifierId(phone));
        const oldPhoneRef = db.collection(COLLECTIONS.ACCOUNT_IDENTIFIERS).doc(phoneIdentifierId(current.phone));
        const [newClaim, oldClaim] = await Promise.all([transaction.get(newPhoneRef), transaction.get(oldPhoneRef)]);
        if (newClaim.exists && newClaim.data().userId !== targetSnapshot.id) {
          throw Object.assign(new Error('phone is already registered.'), { status: 409 });
        }
        if (!newClaim.exists) transaction.create(newPhoneRef, { type: 'PHONE', userId: targetSnapshot.id, createdAt: update.updatedAt, updatedAt: update.updatedAt });
        if (oldClaim.exists && oldClaim.data().userId === targetSnapshot.id) transaction.delete(oldPhoneRef);
      }
      if (managedFarmsSnapshot) {
        managedFarmsSnapshot.docs
          .filter(doc => doc.id !== selectedFarmSnapshot?.id)
          .forEach(doc => transaction.update(doc.ref, { managerUserId: null, updatedAt: update.updatedAt }));
      }
      if (selectedFarmSnapshot) {
        queueManagerFarmAssignment(
          transaction,
          db,
          selectedFarmSnapshot,
          targetSnapshot.id,
          actorId,
          update.updatedAt
        );
      }
      transaction.update(targetRef, update);
      queueAuditEvent(transaction, db, {
        eventType: authorizationChanged ? 'USER_ACCESS_UPDATED' : 'USER_PROFILE_UPDATED',
        actorUserId: actorId,
        entityType: 'USER',
        entityId: targetSnapshot.id,
        details: `Updated account ${targetSnapshot.id}.`,
        createdAt: update.updatedAt
      });
    });
    if (authorizationChanged) {
      await revokeFirebaseSessions(targetSnapshot.id);
      await setFirebaseAccountDisabled(targetSnapshot.id, update.status === 'DISABLED');
    }
    const updatedUser = publicUser({ ...current, ...update }, targetSnapshot.id);
    const data = requestedManagerFarmSnapshot
      ? resolveDirectoryAssignments(
        [updatedUser],
        [{ id: requestedManagerFarmSnapshot.id, ...requestedManagerFarmSnapshot.data(), managerUserId: targetSnapshot.id }],
        []
      )[0]
      : updatedUser;
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message });
  }
});

module.exports = router;
