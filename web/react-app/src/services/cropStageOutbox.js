import { authenticatedRequest, createMutationContext } from './apiClient';

const OUTBOX_KEY = 'hugpong_crop_stage_outbox_v1';
const OUTBOX_EVENT = 'hugpong:crop-stage-outbox';

function ownerId(user = {}) {
  return String(user.employeeId || user.userId || user.id || '').trim();
}

function loadQueue() {
  try {
    const parsed = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueue(queue) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(queue));
  window.dispatchEvent(new CustomEvent(OUTBOX_EVENT));
}

function stagePath(cycleId) {
  return `/api/crop-cycles/${encodeURIComponent(cycleId)}/stage`;
}

function pendingEntry(user, cycleId) {
  const owner = ownerId(user);
  return loadQueue()
    .filter(entry => entry.ownerId === owner && entry.cycleId === cycleId)
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))[0] || null;
}

export function pendingStageUpdate(user, cycleId) {
  return pendingEntry(user, cycleId);
}

export function applyPendingStageUpdate(field, user) {
  const cycleId = field?.currentCycleId || field?.cropCycle?.id;
  const pending = cycleId ? pendingEntry(user, cycleId) : null;
  if (!pending) return field?.stageSyncPending
    ? { ...field, stageSyncPending: false, stageSyncStatus: null, stageSyncError: null }
    : field;
  return {
    ...field,
    stageNumber: pending.currentStageNumber,
    isCompleted: pending.isCompleted,
    stageSyncPending: true,
    stageSyncStatus: pending.status,
    stageSyncError: pending.lastError || null,
    cropCycle: {
      ...(field.cropCycle || {}),
      currentStageNumber: pending.currentStageNumber,
      completedAt: pending.isCompleted ? pending.createdAt : null
    }
  };
}

async function sendEntry(entry) {
  return authenticatedRequest(stagePath(entry.cycleId), {
    method: 'PATCH',
    body: entry.payload
  });
}

export async function flushCropStageOutbox(user) {
  const owner = ownerId(user);
  if (!owner || navigator.onLine === false) return { processed: 0, remaining: loadQueue().length };

  let queue = loadQueue();
  let processed = 0;
  let failedEntry = null;
  for (const entry of queue.filter(item => item.ownerId === owner && ['queued', 'retryable'].includes(item.status))) {
    try {
      await sendEntry(entry);
      queue = queue.filter(item => item.id !== entry.id);
      saveQueue(queue);
      processed += 1;
    } catch (error) {
      if (error.isNetworkError) break;
      queue = queue.map(item => item.id === entry.id
        ? { ...item, status: error.status === 409 ? 'conflict' : 'rejected', lastError: error.message }
        : item);
      saveQueue(queue);
      failedEntry = queue.find(item => item.id === entry.id) || null;
      break;
    }
  }
  return { processed, remaining: queue.filter(item => item.ownerId === owner).length, failedEntry };
}

export async function updateCropStageOfflineFirst({ user, field, currentStageNumber, isCompleted = false, takeoverGrant = null }) {
  const cycleId = String(field?.currentCycleId || field?.cropCycle?.id || '').trim();
  const owner = ownerId(user);
  if (!cycleId || !owner) throw new Error('An assigned field and signed-in user are required.');
  if (takeoverGrant) {
    if (navigator.onLine === false) {
      throw new Error('Manager Takeover stage changes require a live server connection.');
    }
    return authenticatedRequest(stagePath(cycleId), {
      method: 'PATCH',
      headers: { 'X-Hugpong-Takeover-Grant': takeoverGrant },
      body: { currentStageNumber, isCompleted }
    });
  }

  const path = stagePath(cycleId);
  const createdAt = new Date().toISOString();
  const mutation = createMutationContext(path, null, field?.cropCycle?.updatedAt || null);
  const entry = {
    id: mutation.mutationId,
    ownerId: owner,
    fieldId: field.id,
    cycleId,
    currentStageNumber: Number(currentStageNumber),
    isCompleted: isCompleted === true,
    createdAt,
    status: 'queued',
    payload: {
      currentStageNumber: Number(currentStageNumber),
      elapsedMonths: Number(field?.cropCycle?.elapsedMonths || 0),
      isCompleted: isCompleted === true,
      _mutation: mutation
    }
  };
  saveQueue([
    ...loadQueue().filter(item => !(item.ownerId === owner && item.cycleId === cycleId)),
    entry
  ]);

  if (navigator.onLine === false) return { success: true, queued: true, data: entry };
  const result = await flushCropStageOutbox(user);
  if (result.failedEntry?.id === entry.id) {
    throw new Error(result.failedEntry.lastError || 'The server rejected the stage change.');
  }
  return { success: true, queued: result.remaining > 0, data: entry };
}

export function subscribeToCropStageOutbox(listener) {
  const handle = () => listener(loadQueue());
  window.addEventListener(OUTBOX_EVENT, handle);
  return () => window.removeEventListener(OUTBOX_EVENT, handle);
}
