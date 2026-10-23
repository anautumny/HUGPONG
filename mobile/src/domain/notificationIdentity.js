// A repeat render/retry keeps its acknowledgement identity; new work gets a
// different event. These hashes identify UI events, not security credentials.
export function notificationEventId(kind, records = []) {
  const data = records.map(record => [record.id || record.mutationId || '', record.createdAt || '', record.updatedAt || ''])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const text = JSON.stringify(data);
  let left = 2166136261, right = 5381;
  for (let index = 0; index < text.length; index++) {
    left = Math.imul(left ^ text.charCodeAt(index), 16777619);
    right = Math.imul(right, 33) ^ text.charCodeAt(index);
  }
  return `notif-${kind}-${(left >>> 0).toString(16)}${(right >>> 0).toString(16)}`;
}
