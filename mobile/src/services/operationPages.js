// A page is transport, not a complete analytics dataset. Publish only once all
// authorized pages arrive, and abandon the read when the account changes.
export async function fetchOperationPages(request, isCurrent = () => true, path = '/api/logs') {
  const records = new Map(), seen = new Set();
  let cursor = null;
  do {
    if (!isCurrent()) throw Object.assign(new Error('Account changed during operation loading.'), { code: 'AUTH_CONTEXT_CHANGED' });
    const separator = path.includes('?') ? '&' : '?';
    const response = await request(`${path}${separator}paged=1&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (!isCurrent()) throw Object.assign(new Error('Account changed during operation loading.'), { code: 'AUTH_CONTEXT_CHANGED' });
    (response.data || []).forEach(row => records.set(row.id, row));
    cursor = response.page?.hasMore ? response.page.nextCursor : null;
    if (response.page?.hasMore && (!cursor || seen.has(cursor))) throw new Error('Operation pagination did not advance. Retry the refresh.');
    if (cursor) seen.add(cursor);
  } while (cursor);
  return { success: true, data: [...records.values()], count: records.size };
}
