'use strict';

const RESET_CONFIRMATION = 'RESET_HUGPONG_DEVELOPMENT_DATA';

function assertDevelopmentResetAllowed(env, actualProjectId) {
  if (env.NODE_ENV === 'production') {
    throw new Error('Development database reset is forbidden in production.');
  }
  if (env.ALLOW_DEVELOPMENT_DATABASE_RESET !== 'true') {
    throw new Error('Set ALLOW_DEVELOPMENT_DATABASE_RESET=true for this explicit reset invocation.');
  }
  if (env.DEVELOPMENT_DATABASE_RESET_CONFIRM !== RESET_CONFIRMATION) {
    throw new Error(`Set DEVELOPMENT_DATABASE_RESET_CONFIRM=${RESET_CONFIRMATION}.`);
  }
  const expectedProjectId = String(env.HUGPONG_EXPECTED_FIREBASE_PROJECT_ID || '').trim();
  if (!expectedProjectId) {
    throw new Error('HUGPONG_EXPECTED_FIREBASE_PROJECT_ID is required.');
  }
  if (!actualProjectId || expectedProjectId !== actualProjectId) {
    throw new Error(`Firebase project mismatch: expected ${expectedProjectId}, received ${actualProjectId || '(unknown)'}.`);
  }
}

async function inventoryFirestore(database) {
  const collections = await database.listCollections();
  const inventory = [];
  for (const collection of collections) {
    const snapshot = await collection.get();
    inventory.push({ collection: collection.id, documentCount: snapshot.size });
  }
  return inventory.sort((a, b) => a.collection.localeCompare(b.collection));
}

async function fallbackDeleteCollection(database, collectionRef) {
  while (true) {
    const snapshot = await collectionRef.limit(200).get();
    if (snapshot.empty) return;
    for (const documentSnapshot of snapshot.docs) {
      const childCollections = await documentSnapshot.ref.listCollections();
      for (const childCollection of childCollections) {
        await fallbackDeleteCollection(database, childCollection);
      }
    }
    const batch = database.batch();
    snapshot.docs.forEach(documentSnapshot => batch.delete(documentSnapshot.ref));
    await batch.commit();
  }
}

async function resetDevelopmentFirestore(database) {
  const before = await inventoryFirestore(database);
  const collections = await database.listCollections();
  for (const collection of collections) {
    if (typeof database.recursiveDelete === 'function') {
      await database.recursiveDelete(collection);
    } else {
      await fallbackDeleteCollection(database, collection);
    }
  }
  const after = await inventoryFirestore(database);
  const remaining = after.filter(item => item.documentCount > 0);
  if (remaining.length) {
    throw new Error(`Firestore reset verification failed: ${JSON.stringify(remaining)}`);
  }
  return {
    before,
    after,
    deletedDocumentCount: before.reduce((total, item) => total + item.documentCount, 0)
  };
}

module.exports = {
  RESET_CONFIRMATION,
  assertDevelopmentResetAllowed,
  inventoryFirestore,
  resetDevelopmentFirestore
};
