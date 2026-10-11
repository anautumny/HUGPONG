'use strict';

const { COLLECTIONS, nowIso } = require('../schema/firestoreSchema');
const { queueAuditEvent } = require('./auditWriter');

const CLEANUP_CONFIRMATION = 'REMOVE_ORPHANED_AUTHENTICATION';

function clean(value) {
  return String(value || '').trim();
}

function assertDeletedUserCleanupAllowed({
  execute,
  projectId,
  expectedProjectId,
  userId,
  confirmedUserId,
  confirmation
} = {}) {
  if (execute !== true) throw new Error('Deleted-user cleanup execution requires --execute.');
  if (!clean(userId) || clean(userId) !== clean(confirmedUserId)) {
    throw new Error('Deleted-user cleanup requires the same explicit --user and --confirm-user values.');
  }
  if (clean(confirmation) !== CLEANUP_CONFIRMATION) {
    throw new Error(`Deleted-user cleanup requires --confirm=${CLEANUP_CONFIRMATION}.`);
  }
  if (!clean(projectId) || clean(projectId) !== clean(expectedProjectId)) {
    throw new Error('The confirmed cleanup project ID must exactly match the active Firebase project.');
  }
}

async function firebaseUserExists(authClient, userId) {
  if (!authClient || typeof authClient.getUser !== 'function') {
    throw new Error('Firebase Authentication Admin is unavailable.');
  }
  try {
    await authClient.getUser(userId);
    return true;
  } catch (error) {
    if (error?.code === 'auth/user-not-found') return false;
    throw error;
  }
}

async function relatedDocumentRefs(database, collectionName, fieldPaths, userId) {
  const refs = new Map();
  for (const fieldPath of fieldPaths) {
    const snapshot = await database.collection(collectionName).where(fieldPath, '==', userId).get();
    for (const document of snapshot.docs) refs.set(document.ref.path, document.ref);
  }
  return Array.from(refs.values());
}

async function inspectDeletedUserArtifacts(database, authClient, { userId, identifierId }) {
  if (!database) throw new Error('Firestore Admin is unavailable.');
  const normalizedUserId = clean(userId);
  const normalizedIdentifierId = clean(identifierId);
  if (!normalizedUserId || !normalizedIdentifierId) {
    throw new Error('A deleted User ID and exact account-identifier document ID are required.');
  }

  const userRef = database.collection(COLLECTIONS.USERS).doc(normalizedUserId);
  const credentialRef = database.collection(COLLECTIONS.USER_CREDENTIALS).doc(normalizedUserId);
  const identifierRef = database.collection(COLLECTIONS.ACCOUNT_IDENTIFIERS).doc(normalizedIdentifierId);
  const [user, credential, identifier, sessionRefs, recoveryRefs, authExists] = await Promise.all([
    userRef.get(),
    credentialRef.get(),
    identifierRef.get(),
    relatedDocumentRefs(database, COLLECTIONS.SERVER_SESSIONS, [
      'session.user.employeeId',
      'session.user.userId',
      'session.user.id'
    ], normalizedUserId),
    relatedDocumentRefs(database, COLLECTIONS.PASSWORD_RECOVERY_CHALLENGES, ['userId'], normalizedUserId),
    firebaseUserExists(authClient, normalizedUserId)
  ]);
  const identifierOwner = identifier.exists ? clean(identifier.data()?.userId) : null;

  return {
    userId: normalizedUserId,
    identifierId: normalizedIdentifierId,
    userExists: user.exists,
    credentialExists: credential.exists,
    identifierExists: identifier.exists,
    identifierOwner,
    identifierOwnedByTarget: identifier.exists && identifierOwner === normalizedUserId,
    firebaseAuthExists: authExists,
    sessionCount: sessionRefs.length,
    recoveryChallengeCount: recoveryRefs.length,
    refs: { userRef, credentialRef, identifierRef, sessionRefs, recoveryRefs }
  };
}

function publicCleanupPlan(inspection) {
  return {
    userId: inspection.userId,
    userDocumentAbsent: !inspection.userExists,
    credentialDocumentPresent: inspection.credentialExists,
    exactIdentifierPresent: inspection.identifierExists,
    exactIdentifierOwnedByDeletedUser: inspection.identifierOwnedByTarget,
    firebaseAuthenticationUserPresent: inspection.firebaseAuthExists,
    serverSessionsToDelete: inspection.sessionCount,
    passwordRecoveryChallengesToDelete: inspection.recoveryChallengeCount
  };
}

async function deleteRefs(database, refs) {
  let deleted = 0;
  for (let offset = 0; offset < refs.length; offset += 400) {
    const batch = database.batch();
    const chunk = refs.slice(offset, offset + 400);
    for (const ref of chunk) batch.delete(ref);
    await batch.commit();
    deleted += chunk.length;
  }
  return deleted;
}

async function cleanupDeletedUserArtifacts(database, authClient, input) {
  const before = await inspectDeletedUserArtifacts(database, authClient, input);
  if (before.userExists) {
    throw new Error(`Cleanup stopped because users/${before.userId} still exists.`);
  }
  if (before.identifierExists && !before.identifierOwnedByTarget) {
    throw new Error('Cleanup stopped because the exact account identifier belongs to another user.');
  }

  const hasArtifacts = before.credentialExists
    || before.identifierOwnedByTarget
    || before.firebaseAuthExists
    || before.sessionCount > 0
    || before.recoveryChallengeCount > 0;
  if (!hasArtifacts) {
    return { changed: false, before: publicCleanupPlan(before), after: publicCleanupPlan(before) };
  }

  if (before.firebaseAuthExists) {
    try {
      await authClient.deleteUser(before.userId);
    } catch (error) {
      if (error?.code !== 'auth/user-not-found') throw error;
    }
  }

  const cleanedAt = nowIso();
  await database.runTransaction(async transaction => {
    const [liveUser, liveCredential, liveIdentifier] = await Promise.all([
      transaction.get(before.refs.userRef),
      transaction.get(before.refs.credentialRef),
      transaction.get(before.refs.identifierRef)
    ]);
    if (liveUser.exists) throw new Error(`Cleanup stopped because users/${before.userId} was restored.`);
    if (liveIdentifier.exists && clean(liveIdentifier.data()?.userId) !== before.userId) {
      throw new Error('Cleanup stopped because the account identifier changed ownership.');
    }
    if (liveCredential.exists) transaction.delete(before.refs.credentialRef);
    if (liveIdentifier.exists) transaction.delete(before.refs.identifierRef);
    queueAuditEvent(transaction, database, {
      eventType: 'DELETED_USER_AUTH_CLEANUP',
      actorUserId: 'SYSTEM_MAINTENANCE',
      entityType: 'USER',
      entityId: before.userId,
      details: `Removed orphaned authentication artifacts for intentionally deleted account ${before.userId}.`,
      createdAt: cleanedAt
    });
  });

  const sessionsDeleted = await deleteRefs(database, before.refs.sessionRefs);
  const recoveryChallengesDeleted = await deleteRefs(database, before.refs.recoveryRefs);
  const after = await inspectDeletedUserArtifacts(database, authClient, input);
  if (after.userExists
    || after.credentialExists
    || after.identifierExists
    || after.firebaseAuthExists
    || after.sessionCount > 0
    || after.recoveryChallengeCount > 0) {
    throw new Error('Deleted-user cleanup verification failed; re-run the dry-run inspection.');
  }

  return {
    changed: true,
    sessionsDeleted,
    recoveryChallengesDeleted,
    before: publicCleanupPlan(before),
    after: publicCleanupPlan(after)
  };
}

module.exports = {
  CLEANUP_CONFIRMATION,
  assertDeletedUserCleanupAllowed,
  inspectDeletedUserArtifacts,
  publicCleanupPlan,
  cleanupDeletedUserArtifacts
};
