'use strict';

// Callers supply their already-authorized base query. Avoid adding compound
// filters during index construction, and keep every Firestore read bounded.
async function scanScopedDocumentIds(baseQuery, { after = null, pageSize = 200, accept = () => true, maximum = Infinity } = {}) {
  const documents = [];
  let cursor = after;
  do {
    let query = baseQuery.orderBy('__name__', 'asc').limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    for (const document of snapshot.docs) {
      if (accept(document)) documents.push(document);
      if (documents.length >= maximum) return documents;
    }
    cursor = snapshot.docs.length === pageSize ? snapshot.docs.at(-1).id : null;
  } while (cursor);
  return documents;
}
module.exports = { scanScopedDocumentIds };
