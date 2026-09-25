import { fromField, fromBlockFarm, fromUser } from './firestoreSchema';
import {
  authenticatedRead,
  authenticatedRequest,
  subscribeToAuthenticatedLoader
} from './apiClient';
import { sortCropYearsNewestFirst } from '../utils/recordOrdering';

function normalizedRole(user) {
  return String(user?.canonicalRole || user?.role || user?.roleKey || '')
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
}

export function subscribeToFieldsData({ user, onUpdate, onError }) {
  const role = normalizedRole(user);
  if (role === 'SUPER_ADMIN') {
    onUpdate({ fields: [], cropCycles: [], blockFarms: [], memberUsers: [], isLoading: false, error: null });
    return () => {};
  }

  const canListUsers = ['FARM_MANAGER', 'MANAGER', 'SRA_ADMIN', 'ADMIN'].includes(role);
  return subscribeToAuthenticatedLoader(async ({ force }) => {
    const requests = [
      authenticatedRead('/api/fields', { force }),
      authenticatedRead('/api/crop-cycles', { force }),
      authenticatedRead('/api/block-farms', { force }),
      canListUsers
        ? authenticatedRead('/api/users', { force })
        : Promise.resolve({ data: [] })
    ];
    const [fieldsResult, cyclesResult, farmsResult, usersResult] = await Promise.all(requests);
    const cropCycles = sortCropYearsNewestFirst(cyclesResult.data || []);
    const blockFarms = (farmsResult.data || [])
      .map(farm => fromBlockFarm(farm.id, farm))
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
    const memberUsers = (usersResult.data || [])
      .map(member => fromUser(member.id || member.employeeId, member))
      .filter(member => member.canonicalRole === 'MEMBER_FARMER' || (
        member.canonicalRole === 'FARM_MANAGER' &&
        String(member.employeeId || member.id || '') === String(user?.employeeId || user?.id || '')
      ))
      .sort((left, right) => String(left.displayName || left.name || '').localeCompare(String(right.displayName || right.name || '')));
    const cycleMap = new Map(cropCycles.map(cycle => [cycle.id, cycle]));
    const memberMap = new Map();
    memberUsers.forEach(member => {
      if (member.id) memberMap.set(member.id, member);
      if (member.employeeId) memberMap.set(member.employeeId, member);
    });
    const farmMap = new Map(blockFarms.map(farm => [farm.id, farm]));
    const fields = (fieldsResult.data || []).map(item => fromField(item.id, item)).map(field => {
      const cycle = cycleMap.get(field.currentCycleId) || null;
      const member = memberMap.get(field.memberUserId) || null;
      const farm = farmMap.get(field.blockFarmId) || null;
      return {
        ...field,
        stageNumber: cycle?.currentStageNumber ?? null,
        cropCycle: cycle,
        variety: String(cycle?.variety || field.variety || '').trim(),
        varietySource: cycle?.variety ? 'CROP_YEAR_CYCLE' : (field.variety ? 'LEGACY_FIELD' : ''),
        memberName: member?.displayName || member?.name || field.memberUserId || 'Unassigned',
        memberPhone: member?.phone || member?.contact || '',
        blockFarmName: farm?.name || field.blockFarmId || 'Unknown Farm'
      };
    }).sort((left, right) => String(left.id).localeCompare(String(right.id)));
    return { fields, cropCycles, blockFarms, memberUsers };
  }, {
    onData: data => onUpdate({ ...data, isLoading: false, error: null }),
    onError: error => {
      if (onError) onError(error);
    },
    resources: canListUsers
      ? ['fields', 'crop-cycles', 'block-farms', 'users']
      : ['fields', 'crop-cycles', 'block-farms']
  });
}

export async function createField(payload) {
  return authenticatedRequest('/api/fields', { method: 'POST', body: payload });
}

export async function updateField(fieldId, payload) {
  return authenticatedRequest(`/api/fields/${encodeURIComponent(fieldId)}`, { method: 'PATCH', body: payload });
}

export async function archiveField(fieldId) {
  return authenticatedRequest(`/api/fields/${encodeURIComponent(fieldId)}/archive`, { method: 'POST' });
}

export async function startCropYearCycle(fieldId, payload = {}, takeoverGrant = null) {
  return authenticatedRequest(`/api/crop-cycles/${encodeURIComponent(fieldId)}/start`, {
    method: 'POST',
    headers: takeoverGrant ? { 'X-Hugpong-Takeover-Grant': takeoverGrant } : {},
    body: payload
  });
}

export async function rolloverCropYearCycle(fieldId, payload, takeoverGrant = null) {
  return authenticatedRequest(`/api/crop-cycles/${encodeURIComponent(fieldId)}/rollover`, {
    method: 'POST',
    headers: takeoverGrant ? { 'X-Hugpong-Takeover-Grant': takeoverGrant } : {},
    body: payload
  });
}
