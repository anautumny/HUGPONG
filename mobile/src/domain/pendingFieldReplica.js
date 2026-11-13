// Overlay only editable offline intent onto records that the server still
// authorizes. Never resurrect an omitted field or replace a server version /
// assignment with an optimistic local one. Conflicts stay in the outbox for
// the existing review workflow.
export function overlayPendingFieldChanges(remoteFields, queue, ownerUserId) {
  return remoteFields.map(remote => {
    let field = remote;
    for (const item of queue) {
      if (item.ownerUserId && item.ownerUserId !== ownerUserId) continue;
      if (!['queued', 'retryable', 'server_failure', 'syncing', 'failed'].includes(item.status)) continue;
      const payload = item.payload || {};
      if (String(payload.fieldId || payload.id || '') !== String(remote.id)) continue;
      let overlay;
      if (item.type === 'operation_schedule') overlay = { operationSchedule: payload.operationSchedule };
      if (item.type === 'custom_stages') overlay = { customStages: payload.customStages };
      if (item.type === 'custom_operations') overlay = { customOperations: payload.customOperations };
      if (overlay) field = { ...field, ...overlay, synced: false };
    }
    return field;
  });
}
