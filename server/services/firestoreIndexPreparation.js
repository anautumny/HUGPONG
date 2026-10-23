'use strict';

function normalizedFields(fields) {
  const result = fields.map(field => ({ ...field }));
  if (result.length && !result.some(field => field.fieldPath === '__name__')) {
    result.push({ fieldPath: '__name__', order: result.at(-1).order || 'ASCENDING' });
  }
  return result;
}

function indexKey(index) {
  const collectionGroup = index.collectionGroup || index.name?.match(/\/collectionGroups\/([^/]+)\/indexes\//)?.[1];
  return JSON.stringify([collectionGroup, index.queryScope, normalizedFields(index.fields || [])]);
}

function planFirestoreIndexes(definitions, remote) {
  const seen = new Set();
  const indexes = definitions.map(index => {
    if (!index.collectionGroup || !['COLLECTION', 'COLLECTION_GROUP'].includes(index.queryScope)
      || !Array.isArray(index.fields) || index.fields.length < 2) throw new Error('Invalid Firestore index definition.');
    const key = indexKey(index);
    if (seen.has(key)) throw new Error('Duplicate Firestore index definition.');
    seen.add(key);
    const matches = remote.filter(candidate => indexKey(candidate) === key);
    const ready = matches.find(candidate => candidate.state === 'READY');
    const found = ready || matches[0];
    return { definition: index, state: found?.state || 'MISSING' };
  });
  return {
    ready: indexes.every(index => index.state === 'READY'),
    requiredCount: indexes.length,
    missing: indexes.filter(index => index.state === 'MISSING').map(index => index.definition),
    pending: indexes.filter(index => !['READY', 'MISSING'].includes(index.state)),
    indexes,
  };
}

async function createMissingIndexes(plan, create) {
  const results = [];
  for (const index of plan.missing) results.push(await create(index));
  return results;
}

function assertIndexProject(actual, environment) {
  if (!actual || !['FIREBASE_PROJECT_ID', 'VITE_FIREBASE_PROJECT_ID', 'EXPO_PUBLIC_FIREBASE_PROJECT_ID']
    .every(key => environment[key] === actual)) {
    throw new Error('Database credentials must match the configured Server, Web, and Mobile project before preparing indexes.');
  }
}

module.exports = { normalizedFields, indexKey, planFirestoreIndexes, createMissingIndexes, assertIndexProject };
