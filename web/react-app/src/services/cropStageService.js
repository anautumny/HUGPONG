import { authenticatedRequest } from './apiClient';
import { assertWebOnline } from './onlinePolicy';

export async function updateCropStage({ user, field, currentStageNumber, isCompleted = false, takeoverGrant = null }) {
  assertWebOnline();
  const cycleId = String(field?.currentCycleId || field?.cropCycle?.id || '').trim();
  if (!cycleId || !(user?.employeeId || user?.userId || user?.id)) throw new Error('An assigned field and signed-in user are required.');
  return authenticatedRequest(`/api/crop-cycles/${encodeURIComponent(cycleId)}/stage`, {
    method: 'PATCH',
    headers: takeoverGrant ? { 'X-Hugpong-Takeover-Grant': takeoverGrant } : {},
    body: { currentStageNumber: Number(currentStageNumber), isCompleted: isCompleted === true,
      elapsedMonths: Number(field?.cropCycle?.elapsedMonths || 0) },
    baseVersion: field?.cropCycle?.updatedAt || null
  });
}
