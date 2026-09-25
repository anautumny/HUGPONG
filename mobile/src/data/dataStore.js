import { STORAGE_KEYS, saveItem, getItem, clearHugpongStorage, hydrateAllStorage, multiSave, ensureCurrentCacheSchema, localDraftStorageKey } from '../services/storageService';
import { initSyncEngine, enqueueOutboxItem, getOutboxCount, getOutboxQueue, clearOutbox, flushOutboxToApi, executeMutationViaApi, generateTicketId } from '../services/syncEngine';
import { publishTerminalTelemetry, reportMobileActivity, reportMobileSync } from '../services/telemetryService';
import { auth } from '../firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { AppState } from 'react-native';
import { getNetworkStatus, subscribeToNetwork, setOnReconnectCallback, checkConnectivity } from '../services/networkService';
import {
  loginWithServer,
  refreshMobileSessionFromFirebase,
  verifyPasswordWithServer,
  changePasswordWithServer,
  changePhoneWithServer,
  registerWithServer,
  requestPhoneVerificationWithServer,
  verifyPhoneWithServer,
  logoutFromServer,
  authenticatedRequest
} from '../services/authService';
import {
  ROLES,
  canonicalRole,
  roleLabel,
  createCycleId,
  fromAuditReportDocument,
  fromBlockFarmDocument,
  fromCycleDocument,
  fromFieldDocument,
  fromOperationLogDocument,
  fromPriceDocument,
  fromSupportTicketDocument,
  fromUserDocument,
  toFieldDocument,
  toOperationLogDocument,
  toPriceDocument,
  toSupportTicketDocument,
  formatCropYear
} from './firestoreSchema';
import { SRA_OPERATIONS_CATALOGUE, getDefaultStageOperations, getOperationDefinition } from '../domain/operationCatalogue';
import { SUGARCANE_STAGES } from '../constants/cropStages';
import { canCreateSupportTicket, canonicalSupportRole, SUPPORT_TICKET_STATUS } from '../domain/supportTickets';
import { getOperationCapabilities } from '../domain/operationAuthorization';
import {
  cleanDataForFirestore,
  cleanupDuplicateLogs,
  formatDisplayDate,
  toISODateString,
  sortNewestFirst,
  sortOperationsNewestFirst,
  cropYearCycleForDate
} from '../utils/dataHelpers';

export {
  cleanDataForFirestore,
  cleanupDuplicateLogs,
  formatDisplayDate,
  toISODateString
} from '../utils/dataHelpers';

export const commitExplicitMutation = async (type, payload, options = {}) => {
  const sraOnlineOnlyMutations = new Set(['audit_qr_import', 'audit_certification', 'audit_return', 'price', 'user_approve']);
  const activeRole = canonicalRole(CURRENT_SESSION?.canonicalRole || CURRENT_SESSION?.role || CURRENT_SESSION?.roleKey);
  const bypassOfflineOutbox = activeRole === ROLES.SRA_ADMIN || sraOnlineOnlyMutations.has(type);
  if (bypassOfflineOutbox) {
    if (!getNetworkStatus()) {
      throw new Error('SRA Admin actions require a live HUGPONG connection. Reconnect and sign in again.');
    }
    const response = await executeMutationViaApi({ type, payload, baseVersion: options.baseVersion, takeoverGrant: options.takeoverGrant }, { includeMutation: false });
    return {
      item: null,
      result: { success: true, attemptedCount: 1, processedCount: 1, failedCount: 0, remainingCount: getOutboxCount(), responses: {} },
      queued: false,
      response
    };
  }
  if (options.takeoverGrant && !getNetworkStatus()) {
    throw new Error('Farm Manager Takeover changes require a live server connection and cannot be stored for later replay.');
  }
  const item = await enqueueOutboxItem(type, payload, options);
  console.info(`[OPERATION] Enqueued: ${item.mutationId}`);
  const result = getNetworkStatus()
    ? await performMobileSync('POST_MUTATION')
    : { success: false, attemptedCount: 0, processedCount: 0, failedCount: 0, remainingCount: getOutboxCount(), responses: {} };
  const retained = getOutboxQueue().find(queued => queued.mutationId === item.mutationId);
  const outcome = { item: retained || item, result, queued: Boolean(retained), response: result.responses?.[item.mutationId] };
  const retainedStatus = outcome.queued ? outcome.item?.status : null;
  const terminalStatuses = new Set(['authentication', 'authorization', 'conflict', 'validation', 'rejected']);
  if (terminalStatuses.has(retainedStatus) || result.reason === 'AUTHORIZATION_FAILURE' || result.reason === 'AUTHENTICATION_RECOVERY') {
    const error = new Error(outcome.item?.lastError || 'The server rejected this mutation.');
    error.status = retainedStatus === 'conflict' ? 409 : 400;
    error.data = outcome.item?.conflict || null;
    throw error;
  }
  return outcome;
};

export { publishTerminalTelemetry, getNetworkStatus, subscribeToNetwork, checkConnectivity };

const stripCredentialFields = (value = {}) => {
  const safe = {};
  Object.entries(value || {}).forEach(([key, fieldValue]) => {
    if (/password|credential|salt|reset.*token/i.test(key)) return;
    safe[key] = fieldValue;
  });
  return safe;
};

const normalizeSessionUser = (value = {}) => {
  const safe = stripCredentialFields(value);
  const normalizedRole = canonicalRole(safe.canonicalRole || safe.role || safe.roleKey);
  return normalizedRole
    ? { ...safe, canonicalRole: normalizedRole, role: roleLabel(normalizedRole) }
    : safe;
};

// ══════════════════════════════════════════════════════════════
// HUGPONG — Canonical Database Entities & Offline Working Store
// Single Canonical Source of Truth: Cloud Firestore / Server DB
// ══════════════════════════════════════════════════════════════

export const priceHistory = [];

export const blockFarms = [];

export const cropCycles = [];

export const users = [];

export const archivedFields = [];

export const mergeActiveFields = (incomingFields = [], customArchivedIds = []) => {
  const archivedSet = new Set([
    ...archivedFields.map(f => (typeof f === 'string' ? f : f.id).toUpperCase()),
    ...(Array.isArray(customArchivedIds) ? customArchivedIds.map(id => (typeof id === 'string' ? id : id.id).toUpperCase()) : [])
  ]);

  const merged = [];
  (incomingFields || []).forEach(f => {
    if (!f || !f.id) return;
    const fIdUpper = f.id.toUpperCase();
    if (archivedSet.has(fIdUpper) || f.status === 'ARCHIVED') {
      archivedSet.add(fIdUpper);
      if (!archivedFields.some(af => (typeof af === 'string' ? af : af.id).toUpperCase() === fIdUpper)) {
        archivedFields.push({ ...f, status: 'ARCHIVED' });
      }
      return;
    }
    if (!merged.some(m => m.id.toUpperCase() === fIdUpper)) {
      merged.push({
        ...f,
        ha: Number(f.ha ?? f.areaHa ?? 0),
        lastSync: f.lastSync || 'Just now',
        synced: f.synced !== undefined ? f.synced : true
      });
    }
  });

  return merged;
};

export const fields = [];

export const operationLogs = [];

export const draftLogs = [];

export const auditReports = [];
export const auditLogs = auditReports; // Backward compatibility alias

export const assignmentRequests = [];

export const supportTickets = [];

export const systemHistory = [];

export const requestFieldAssignment = (fieldId, memberName, ha, memberId = null) => {
  const curSession = getCurrentSession();
  const newReq = {
    id: 'REQ-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    fieldId: String(fieldId || '').trim().toUpperCase(),
    member: memberName || curSession.name || 'Unassigned',
    memberUserId: memberId || curSession.employeeId || curSession.id || '',
    ha: ha == null ? '' : String(ha),
    status: 'Pending',
    timestamp: new Date().toISOString(),
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  };
  assignmentRequests.unshift(newReq);
  notifyDataUpdate();
  return newReq;
};

export const resolveAssignmentRequest = (requestId, approved = true) => {
  const req = assignmentRequests.find(r => r.id === requestId);
  if (req) {
    req.status = approved ? 'Approved' : 'Rejected';
    if (approved) {
      const f = fields.find(item => item.id === req.fieldId);
      const member = users.find(user => (user.id || user.employeeId) === req.memberUserId);
      if (!f || !member || canonicalRole(member.role) !== 'MEMBER_FARMER') {
        req.status = 'Rejected';
        req.error = 'Assignment requires an existing field and Farm Member.';
        notifyDataUpdate();
        return req;
      }
      f.memberUserId = req.memberUserId;
      if (req.ha) f.ha = parseFloat(req.ha);
    }
    notifyDataUpdate();
  }
  return req;
};

// ── Pending Member Registrations ──
export const pendingUsers = [];

const clearCanonicalRuntimeData = () => {
  [
    priceHistory,
    blockFarms,
    cropCycles,
    users,
    archivedFields,
    fields,
    operationLogs,
    auditReports,
    assignmentRequests,
    supportTickets,
    systemHistory,
    pendingUsers
  ].forEach(collection => {
    collection.length = 0;
  });
};

export const approvePendingRegistration = async (contact, options = {}) => {
  const cleanContact = String(contact || '').replace(/\D/g, '');
  const idx = pendingUsers.findIndex(u => (u.contact || '').replace(/\D/g, '') === cleanContact);
  if (idx === -1) return { success: false, message: 'Applicant not found in pending list.' };

  const applicant = pendingUsers[idx];
  const assignedFarm = blockFarms.find(farm => farm.id === options.blockFarmId || farm.name === applicant.blockFarm);
  if (!assignedFarm) return { success: false, message: 'Select an existing block farm before approving this registration.' };

  // The API creates the canonical Field ID after approval details are validated.
  const rawHa = options.area || applicant.area;
  const assignedHa = parseFloat(String(rawHa || '').replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(assignedHa) || assignedHa <= 0) {
    return { success: false, message: 'A valid field area is required before approving this registration.' };
  }
  const empId = applicant.employeeId || ('04' + cleanContact.slice(-6).padStart(6, '0'));

  // Update or create active user account
  const existingUser = users.find(u => (u.contact || '').replace(/\D/g, '') === cleanContact || u.employeeId === empId);
  const existingUserSnapshot = existingUser ? { ...existingUser } : null;
  let createdUser = null;
  if (existingUser) {
    existingUser.status = 'Active';
    existingUser.phoneVerified = true;
    existingUser.isPhoneVerified = true;
    existingUser.pendingFirstLoginVerification = false;
    existingUser.phoneVerifiedAt = existingUser.phoneVerifiedAt || new Date().toISOString();
    existingUser.updatedAt = new Date().toISOString();
  } else {
    createdUser = {
      employeeId: empId,
      name: applicant.name,
      contact: cleanContact,
      role: applicant.role || 'Farm Member',
      roleKey: 'member',
      status: 'Active',
      phoneVerified: true,
      isPhoneVerified: true,
      pendingFirstLoginVerification: false,
      phoneVerifiedAt: new Date().toISOString(),
      regDate: applicant.regDate || new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    users.push(createdUser);
  }

  // Allocate through the canonical field writer so a new field and its first
  // crop cycle are persisted together with a stable currentCycleId.
  const fieldResult = await saveFieldPlot({
    blockFarmId: assignedFarm.id,
    memberUserId: empId,
    ha: assignedHa,
    status: 'ACTIVE'
  }, true);
  if (!fieldResult.success) {
    if (createdUser) users.splice(users.indexOf(createdUser), 1);
    if (existingUser && existingUserSnapshot) Object.assign(existingUser, existingUserSnapshot);
    return fieldResult;
  }

  let approvedAccountId = empId;
  try {
    const approvalOutcome = await commitExplicitMutation('user_approve', {
      id: empId,
      role: 'MEMBER_FARMER'
    }, { baseVersion: existingUserSnapshot?.updatedAt || applicant.updatedAt || null });
    const approved = approvalOutcome.response;
    approvedAccountId = approved?.accountId || approved?.data?.id || empId;
    const activeUser = users.find(user => user.employeeId === empId);
    if (activeUser && approved.data) Object.assign(activeUser, fromUserDocument(empId, approved.data));
  } catch (error) {
    return { success: false, message: error.message || 'Server approval failed.' };
  }

  pendingUsers.splice(idx, 1);
  await saveItem(STORAGE_KEYS.PENDING_USERS, pendingUsers);
  await saveItem(STORAGE_KEYS.USERS, users);

  notifyDataUpdate();
  return {
    success: true,
    applicant,
    accountId: approvedAccountId,
    fieldId: fieldResult.field.id
  };
};

export const rejectPendingRegistration = async (contact) => {
  const cleanContact = String(contact || '').replace(/\D/g, '');
  const idx = pendingUsers.findIndex(u => (u.contact || '').replace(/\D/g, '') === cleanContact);
  if (idx === -1) return { success: false, message: 'Applicant not found.' };

  pendingUsers.splice(idx, 1);
  await saveItem(STORAGE_KEYS.PENDING_USERS, pendingUsers);
  notifyDataUpdate();
  return { success: true };
};

/**
 * Comprehensive Validation for Field Plots (Add & Edit)
 */
export const validateFieldPlotData = (fieldData, isNew = false) => {
  if (!fieldData || typeof fieldData !== 'object') {
    return { valid: false, error: 'INVALID_DATA', message: 'Field data is required.' };
  }

  // Existing identities are required for edits. New identities come only from the API.
  const fieldId = String(fieldData.id || '').trim().toUpperCase();
  if (!isNew && !fieldId) {
    return { valid: false, error: 'REQUIRED_FIELD_ID', message: 'Field ID is required.' };
  }
  if (!isNew && !/^[A-Za-z0-9_-]{3,80}$/.test(fieldId)) {
    return { valid: false, error: 'INVALID_FIELD_ID_FORMAT', message: 'The existing Field ID is invalid.' };
  }

  const existingIdx = fields.findIndex(f => f.id.toUpperCase() === fieldId);
  if (!isNew && existingIdx === -1) {
    return { valid: false, error: 'FIELD_NOT_FOUND', message: `Field plot "${fieldId}" does not exist in the database.` };
  }

  // 2. Land Area (Hectares) Validation
  const ha = Number(fieldData.ha);
  if (isNaN(ha) || ha <= 0 || ha > 500) {
    return { valid: false, error: 'INVALID_HECTARES', message: 'Hectares (HA) must be a positive number between 0.01 and 500.' };
  }

  // 3. Member / User Validation (Must exist in database)
  const rawMemberId = fieldData.memberUserId || fieldData.memberId || fieldData.userId || fieldData.memberContact || fieldData.member || fieldData.memberName;
  const isUnassigned = !rawMemberId || String(rawMemberId).trim().toLowerCase() === 'unassigned';
  
  if (!isUnassigned) {
    const matchedUser = findUserByIdOrContact(rawMemberId);
    if (!matchedUser) {
      return { 
        valid: false, 
        error: 'MEMBER_NOT_FOUND', 
        message: 'The selected Farm Member is no longer available. Refresh the authorized member list and select again.'
      };
    }
    const ownerRole = canonicalRole(matchedUser.role);
    const matchedUserId = matchedUser.employeeId || matchedUser.id;
    const currentUserId = CURRENT_SESSION?.employeeId || CURRENT_SESSION?.id;
    if (ownerRole !== 'MEMBER_FARMER' && !(ownerRole === 'FARM_MANAGER' && matchedUserId === currentUserId)) {
      return { valid: false, error: 'INVALID_MEMBER_ROLE', message: 'The field owner must be a Farm Member or the current Farm Manager.' };
    }
  }

  return { valid: true, sanitizedId: fieldId, parsedHa: ha };
};

/**
 * Unified Field Plot Persistence & Cloud Synchronization
 * Supports Adding new field plots or Editing existing allocations with strict validation.
 */
export const saveFieldPlot = async (fieldData, isNew = false) => {
  const validation = validateFieldPlotData(fieldData, isNew);
  if (!validation.valid) {
    return { success: false, message: validation.message, error: validation.error };
  }

  const targetId = validation.sanitizedId;
  const existingIdx = isNew ? -1 : fields.findIndex(f => f.id.toUpperCase() === targetId);
  const nowIso = new Date().toISOString();
  
  const currentF = existingIdx >= 0 ? fields[existingIdx] : {};
  const resolvedBlockFarmId = String(fieldData.blockFarmId || currentF.blockFarmId || '').trim().toUpperCase();
  if (!resolvedBlockFarmId || !blockFarms.some(farm => farm.id === resolvedBlockFarmId)) {
    return { success: false, error: 'BLOCK_FARM_NOT_FOUND', message: 'Select an existing block farm before saving the field.' };
  }

  if (isNew && !getNetworkStatus()) {
    return {
      success: false,
      error: 'ONLINE_ENROLLMENT_REQUIRED',
      message: 'New Field enrollment requires a live connection so the server can issue its permanent ID.'
    };
  }

  const rawMemberId = fieldData.memberUserId || fieldData.memberId || fieldData.userId || fieldData.memberContact || fieldData.member || fieldData.memberName;
  const isUnassigned = !rawMemberId || String(rawMemberId).trim().toLowerCase() === 'unassigned';
  const matchedUser = !isUnassigned ? findUserByIdOrContact(rawMemberId) : null;

  if (isNew) {
    try {
      const response = await authenticatedRequest('/api/fields', {
        method: 'POST',
        body: {
          blockFarmId: resolvedBlockFarmId,
          memberUserId: matchedUser ? (matchedUser.employeeId || matchedUser.id) : null,
          areaHa: validation.parsedHa,
          cropType: fieldData.cycleType || 'Plant Cane (New Plant)',
          elapsedMonths: 0,
          batchNumber: 1
        }
      });
      const serverField = response?.data?.field;
      const serverCycle = response?.data?.cycle;
      if (!serverField?.id || !serverCycle?.id) throw new Error('The server did not return the enrolled Field identity.');
      const authoritativeCycle = fromCycleDocument(serverCycle.id, serverCycle);
      const authoritativeField = fromFieldDocument(serverField.id, serverField, serverCycle);
      const farm = blockFarms.find(item => item.id === authoritativeField.blockFarmId);
      const localField = {
        ...authoritativeField,
        blockFarm: farm?.name || '',
        memberName: matchedUser?.name || 'Unassigned',
        member: matchedUser?.name || 'Unassigned',
        memberContact: matchedUser?.contact || matchedUser?.mobile || '',
        synced: true,
        lastSync: 'Just now'
      };
      fields.push(localField);
      cropCycles.push(authoritativeCycle);
      await saveItem(STORAGE_KEYS.FIELDS, fields);
      notifyDataUpdate();
      return { success: true, field: localField, cycle: authoritativeCycle };
    } catch (error) {
      return { success: false, error: 'SERVER_ENROLLMENT_REJECTED', message: error.message || 'The server rejected Field enrollment.' };
    }
  }

  const resolvedCurrentCycleId = String(fieldData.currentCycleId || currentF.currentCycleId || (isNew ? createCycleId(targetId, 1) : '')).trim().toUpperCase();
  if (!resolvedCurrentCycleId) {
    return { success: false, error: 'CURRENT_CYCLE_REQUIRED', message: 'The field must reference an existing current Crop Year Cycle.' };
  }

  // Resolve verified user if assigned
  const resolvedMemberName = matchedUser ? matchedUser.name : 'Unassigned';
  const resolvedMemberId = matchedUser ? (matchedUser.employeeId || matchedUser.id) : '';
  const resolvedMemberContact = matchedUser ? (matchedUser.contact || matchedUser.mobile || '') : '';

  const formattedField = {
    id: targetId,
    blockFarmId: resolvedBlockFarmId,
    blockFarm: blockFarms.find(farm => farm.id === resolvedBlockFarmId)?.name || 'Unassigned',
    memberUserId: resolvedMemberId || null,
    memberId: resolvedMemberId,
    userId: resolvedMemberId,
    memberName: resolvedMemberName,
    member: resolvedMemberName,
    memberContact: resolvedMemberContact,
    ha: validation.parsedHa,
    stage: fieldData.stage || currentF.stage || 'Pre-Planting & Land Preparation',
    stageNumber: fieldData.stageNumber || currentF.stageNumber || 1,
    isCompleted: fieldData.isCompleted !== undefined ? fieldData.isCompleted : (currentF.isCompleted !== undefined ? currentF.isCompleted : false),
    customStages: fieldData.customStages || currentF.customStages || [],
    customOperations: fieldData.customOperations || currentF.customOperations || {},
    cycleType: fieldData.cycleType || currentF.cycleType || 'Plant Cane (New Plant)',
    cropYear: fieldData.cropYear || currentF.cropYear || (isNew ? cropYearCycleForDate() : ''),
    month: fieldData.month !== undefined ? fieldData.month : (currentF.month !== undefined ? currentF.month : 0),
    batchMonth: fieldData.batchMonth || currentF.batchMonth || 1,
    synced: fieldData.synced !== undefined ? fieldData.synced : true,
    lastSync: fieldData.lastSync || currentF.lastSync || 'Just now',
    ...(currentF.variety ? { variety: currentF.variety } : {}),
    createdAt: fieldData.createdAt || currentF.createdAt || nowIso,
    updatedAt: nowIso,
    currentCycleId: resolvedCurrentCycleId,
    status: String(fieldData.status || currentF.status || 'ACTIVE').toUpperCase()
  };

  if (existingIdx >= 0) {
    fields[existingIdx] = { ...fields[existingIdx], ...formattedField };
  } else {
    fields.push(formattedField);
  }

  // Persist to offline AsyncStorage
  await saveItem(STORAGE_KEYS.FIELDS, fields);

  const canonicalField = toFieldDocument(formattedField);
  const fieldMutationPayload = {
    id: formattedField.id,
    ...canonicalField,
    isNew: false
  };
  try {
    const outcome = await commitExplicitMutation('field_upsert', fieldMutationPayload, {
      baseVersion: currentF.updatedAt || null
    });
    if (outcome.response?.data?.cycle) {
      const authoritativeCycle = fromCycleDocument(outcome.response.data.cycle.id, outcome.response.data.cycle);
      const authoritativeCycleIndex = cropCycles.findIndex(cycle => cycle.id === authoritativeCycle.id);
      if (authoritativeCycleIndex >= 0) cropCycles[authoritativeCycleIndex] = authoritativeCycle;
      else cropCycles.push(authoritativeCycle);
      formattedField.cropYear = authoritativeCycle.cropYear;
      formattedField.currentCycleId = authoritativeCycle.id;
      const authoritativeIndex = fields.findIndex(field => field.id === formattedField.id);
      if (authoritativeIndex >= 0) fields[authoritativeIndex] = { ...fields[authoritativeIndex], ...formattedField };
      await saveItem(STORAGE_KEYS.FIELDS, fields);
    }
  } catch (e) {
    console.warn('[dataStore] Field mutation rejected:', e);
    return { success: false, message: e.message || 'The field change was rejected by the server.' };
  }

  notifyDataUpdate();
  return { success: true, field: formattedField };
};

export const fieldsStore = fields;
export const DRAFT_LOGS = draftLogs;
export const SRA_PRICE_HISTORY = priceHistory;

export {
  fields as canonicalFields,
  blockFarms as canonicalBlockFarms,
  operationLogs as canonicalLogs
};

// ── Relational Derivation Resolvers ──────────────────────────
export const findUserByIdOrContact = (inputStr) => {
  if (!inputStr) return null;
  const raw = String(inputStr).trim();
  const clean = raw.replace(/\D/g, '');

  return users.find(u => {
    const uEmp = String(u.employeeId || '').trim();
    const uEmpClean = uEmp.replace(/\D/g, '');
    const uContact = String(u.contact || '').replace(/\D/g, '');
    const uMobile = String(u.mobile || '').replace(/\D/g, '');
    const uId = String(u.id || '').trim();
    const uName = String(u.name || '').trim().toLowerCase();

    if (uEmp && (uEmp === raw || (clean && uEmpClean === clean))) return true;
    if (clean && uContact && uContact === clean) return true;
    if (clean && uMobile && uMobile === clean) return true;
    if (clean.length >= 7) {
      if (uContact.length >= 7 && (uContact.endsWith(clean) || clean.endsWith(uContact))) return true;
      if (uMobile.length >= 7 && (uMobile.endsWith(clean) || clean.endsWith(uMobile))) return true;
    }
    if (uId && (uId === raw || (clean && uId.replace(/\D/g, '') === clean))) return true;
    if (uName && uName === raw.toLowerCase()) return true;
    return false;
  }) || null;
};

export const isValidUserIdentifier = (inputStr, requireExisting = true) => {
  if (!inputStr) return false;
  const user = findUserByIdOrContact(inputStr);
  if (user) return true;
  if (requireExisting) return false;
  const raw = String(inputStr).trim();
  const clean = raw.replace(/\D/g, '');
  if (/^0[1-4]\d{6}$/.test(raw) || /^0[1-4]\d{6}$/.test(clean)) return true;
  if (/^09\d{9}$/.test(clean) || (clean.startsWith('639') && clean.length === 12)) return true;
  return false;
};

export const resolveFieldMember = (field) => {
  if (!field) return 'Unassigned';
  const u = users.find(user => (user.id || user.employeeId) === field.memberUserId);
  return u?.displayName || u?.name || field.memberName || field.member || field.memberUserId || 'Unassigned';
};

export const resolveFieldMemberId = (field) => {
  if (!field) return '';
  return String(field.memberUserId || '').trim();
};

export const resolveFieldBlockFarm = (field) => {
  if (!field) return 'Unassigned';
  const bf = blockFarms.find(b => b.id === field.blockFarmId);
  return bf ? bf.name : 'Unassigned';
};

export const resolveBlockFarmManager = (blockFarm) => {
  if (!blockFarm) return 'Pending Appointment';
  const u = users.find(user => (user.id || user.employeeId) === blockFarm.managerUserId);
  if (u) return u.name;
  return 'Pending Appointment';
};

export const getSortedPrices = () => {
  return sortNewestFirst(priceHistory, ['effectiveDate', 'publishedAt']);
};

// ── Dynamic Current Price & Market Observation ──────────────
export const currentPrice = {
  get value() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? sorted[0].sugarPricePerLkg : null;
  },
  get change() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? sorted[0].sugarPriceChange : null;
  },
  get unit() { return 'Lkg'; },
  get mill() { return 'HPCo'; },
  get location() { return 'Silay'; },
  get lastUpdated() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? sorted[0].effectiveDate : 'No records';
  },
  get weekLabel() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? sorted[0].weekLabel : 'No records';
  }
};

export const currentMarketObservation = {
  get value() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? sorted[0].molassesPricePerMetricTon : null;
  },
  get change() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? sorted[0].molassesPriceChange : null;
  },
  get unit() { return 'MT'; },
  get lastUpdated() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? sorted[0].effectiveDate : 'No records';
  },
  get weekLabel() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? sorted[0].weekLabel : 'No records';
  }
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const extractPriceMonth = (p) => {
  if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(p.effectiveDate || '')) return null;
  const monthIndex = Number(p.effectiveDate.slice(5, 7)) - 1;
  return MONTH_NAMES[monthIndex] || null;
};

export const priceAnalytics = {
  get hasData() {
    return priceHistory.length > 0;
  },
  get months() {
    const sorted = getSortedPrices();
    if (sorted.length === 0) return ['No Data'];
    const uniqueMonths = Array.from(new Set(sorted.map(p => extractPriceMonth(p))));
    return uniqueMonths.slice(0, 6).reverse();
  },
  get weeks() {
    const sorted = getSortedPrices();
    if (sorted.length === 0) {
      return [];
    }
    const months = this.months;
    return [0, 1, 2, 3].map(wIndex => {
      return months.map(m => {
        const matching = sorted.filter(p => extractPriceMonth(p) === m);
        if (matching.length > wIndex) return matching[wIndex].sugarPricePerLkg;
        if (matching.length > 0) return matching[0].sugarPricePerLkg;
        return sorted[0].sugarPricePerLkg;
      });
    });
  },
  get monthlyAvg() {
    const sorted = getSortedPrices();
    if (sorted.length === 0) return null;
    const sum = sorted.reduce((acc, p) => acc + p.sugarPricePerLkg, 0);
    return Math.round(sum / sorted.length);
  },
  get cropYearPeak() {
    const sorted = getSortedPrices();
    if (sorted.length === 0) return null;
    return Math.max(...sorted.map(p => p.sugarPricePerLkg));
  }
};

// Server and Firebase issue all authentication credentials. The mobile client
// stores opaque tokens only and never creates or validates authentication tokens.

export const clearAuthSessionStorage = async () => {
  try {
    await saveItem(STORAGE_KEYS.AUTH_TOKEN, null);
    await saveItem(STORAGE_KEYS.SESSION, null);
  } catch (e) {
    console.warn('[dataStore] Error clearing auth session:', e);
  }
};

export const verifyCurrentPassword = async (password, fieldId = null) => {
  try {
    return await verifyPasswordWithServer(password, fieldId ? {
      purpose: 'MANAGER_TAKEOVER',
      fieldId: String(fieldId).trim().toUpperCase()
    } : {});
  } catch (error) {
    return false;
  }
};

export const restoreSessionFromToken = async () => {
  try {
    const token = await getItem(STORAGE_KEYS.AUTH_TOKEN);
    const session = await getItem(STORAGE_KEYS.SESSION);
    if (auth?.authStateReady) await auth.authStateReady();
    if (!token || !session) {
      stopActiveCloudSync();
      await initSyncEngine('');
      if (auth?.currentUser) await logoutFromServer();
      await clearAuthSessionStorage();
      return { success: false, reason: 'no_stored_session' };
    }
    if (!auth?.currentUser || auth.currentUser.uid !== session.employeeId) {
      stopActiveCloudSync();
      await initSyncEngine('');
      if (auth?.currentUser) await logoutFromServer();
      await clearAuthSessionStorage();
      return { success: false, reason: 'firebase_session_missing' };
    }
    const restoredSession = normalizeSessionUser(session);
    const restoredRole = canonicalRole(restoredSession.canonicalRole || restoredSession.role || restoredSession.roleKey);
    if (restoredRole === ROLES.SRA_ADMIN && !(await checkConnectivity({ force: true }))) {
      stopActiveCloudSync();
      clearCanonicalRuntimeData();
      CURRENT_SESSION = { ...DEFAULT_GUEST_SESSION };
      await initSyncEngine('');
      await logoutFromServer({ skipRemote: true });
      await clearAuthSessionStorage();
      notify();
      return { success: false, reason: 'sra_online_required', adminOnlineRequired: true };
    }
    // Offline restoration trusts only a session previously issued after a
    // successful server login. Online validation refreshes both server and
    // Firebase credentials without exposing password material to the client.
    CURRENT_SESSION = { ...restoredSession, lastActiveAt: Date.now() };
    if (restoredRole === ROLES.SRA_ADMIN) clearCanonicalRuntimeData();
    await saveItem(STORAGE_KEYS.SESSION, CURRENT_SESSION);
    await initSyncEngine(CURRENT_SESSION.employeeId || CURRENT_SESSION.id);
    if (restoredRole === ROLES.SRA_ADMIN && getOutboxCount() > 0) await clearOutbox();
    notify();
    if (getNetworkStatus()) {
      try {
        const refreshed = await refreshMobileSessionFromFirebase();
        CURRENT_SESSION = { ...normalizeSessionUser(refreshed.user), lastActiveAt: Date.now() };
        await saveItem(STORAGE_KEYS.SESSION, CURRENT_SESSION);
      } catch (error) {
        if (error.status === 401) {
          stopActiveCloudSync();
          CURRENT_SESSION = { ...DEFAULT_GUEST_SESSION };
          await initSyncEngine('');
          await clearAuthSessionStorage();
          if (auth?.currentUser) await logoutFromServer();
          return { success: false, reason: 'server_session_rejected' };
        }
      }
    }
    if (CURRENT_SESSION.pendingFirstLoginVerification === true
      || CURRENT_SESSION.phoneVerified === false
      || CURRENT_SESSION.requiresPasswordChange === true) {
      stopActiveCloudSync();
      return { success: false, reason: 'account_setup_required' };
    }
    const liveDataReady = await restartCloudSyncIfReady();
    if (restoredRole === ROLES.SRA_ADMIN && !liveDataReady) {
      stopActiveCloudSync();
      clearCanonicalRuntimeData();
      CURRENT_SESSION = { ...DEFAULT_GUEST_SESSION };
      await initSyncEngine('');
      await logoutFromServer({ skipRemote: !getNetworkStatus() });
      await clearAuthSessionStorage();
      notify();
      return { success: false, reason: 'sra_live_data_unavailable', adminOnlineRequired: true };
    }
    reportMobileActivity('HEARTBEAT').catch(() => {});
    notify();
    return { success: true, user: CURRENT_SESSION, token: await getItem(STORAGE_KEYS.AUTH_TOKEN) };
  } catch (err) {
    console.warn('[dataStore] Error restoring session:', err);
    return { success: false, error: err.message };
  }
};

export const logoutUser = async (options = {}) => {
  stopActiveCloudSync();
  await logoutFromServer(options);
  draftLogs.length = 0;
  clearCanonicalRuntimeData();
  CURRENT_SESSION = { ...DEFAULT_GUEST_SESSION };
  await initSyncEngine('');
  await clearAuthSessionStorage();
  notify();
  return { success: true };
};

// ── User Directory & Authentication ──────────────────────────
export const authenticateUser = async (contactOrId, password) => {
  try {
    const result = await loginWithServer(contactOrId, password);
    const roleUpper = String(result.user?.canonicalRole || result.user?.role || '').toUpperCase().replace(/ /g, '_');
    if (roleUpper === 'SUPER_ADMIN' || result.user?.role === 'Super Admin') {
      await logoutFromServer();
      return { success: false, error: 'Super Admin access is restricted to the Web Management Console.' };
    }
    clearCanonicalRuntimeData();
    CURRENT_SESSION = { ...normalizeSessionUser(result.user), lastActiveAt: Date.now() };
    await saveItem(STORAGE_KEYS.SESSION, CURRENT_SESSION);
    await initSyncEngine(CURRENT_SESSION.employeeId || CURRENT_SESSION.id);
    if (roleUpper === ROLES.SRA_ADMIN && getOutboxCount() > 0) await clearOutbox();
    draftLogs.length = 0;
    const scopedDrafts = await getItem(localDraftStorageKey(CURRENT_SESSION.employeeId || CURRENT_SESSION.id), []);
    if (Array.isArray(scopedDrafts)) scopedDrafts.forEach(draft => draftLogs.push(draft));
    const liveDataReady = await restartCloudSyncIfReady();
    const accountSetupPending = CURRENT_SESSION.pendingFirstLoginVerification === true
      || CURRENT_SESSION.phoneVerified === false
      || CURRENT_SESSION.requiresPasswordChange === true;
    if (roleUpper === ROLES.SRA_ADMIN && !accountSetupPending && !liveDataReady) {
      await logoutUser({ skipRemote: !getNetworkStatus() });
      return {
        success: false,
        error: 'SRA Admin requires a live HUGPONG connection and current district data. Please reconnect and sign in again.',
        code: 'SRA_ONLINE_REQUIRED',
        isNetworkError: true
      };
    }
    reportMobileActivity('LOGIN').catch(() => {});
    notify();
    if (getNetworkStatus() && getOutboxCount() > 0) {
      performMobileSync('AUTH_RESTORED').catch(() => {});
    }
    return { ...result, requiresPasswordChange: result.user?.requiresPasswordChange === true };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Authentication service is unavailable.',
      code: error.code || null,
      status: error.status || null,
      isNetworkError: error.isNetworkError === true || [
        'API_CONFIGURATION_ERROR',
        'API_REQUEST_TIMEOUT',
        'API_UNREACHABLE'
      ].includes(error.code) || Number(error.status) >= 500
    };
  }
};

export const updateUserMobileNumber = async (newMobile, passwordVerification) => {
  if (!CURRENT_SESSION) {
    return { success: false, error: 'No active user session found.' };
  }
  const cleanNew = String(newMobile || '').replace(/\D/g, '');
  if (!cleanNew.startsWith('09') || cleanNew.length !== 11) {
    if (!(cleanNew.startsWith('639') && cleanNew.length === 12)) {
      return { success: false, error: 'Please enter a valid 11-digit Philippine mobile number (09XXXXXXXXX).' };
    }
  }

  const currentContactClean = String(CURRENT_SESSION.contact || CURRENT_SESSION.mobile || '').replace(/\D/g, '');
  if (cleanNew === currentContactClean) {
    return { success: false, error: 'New mobile number cannot be the same as your current registered number.' };
  }

  const formatted = cleanNew.startsWith('639') ? '0' + cleanNew.slice(2) : cleanNew;
  try {
    const result = await changePhoneWithServer(formatted, passwordVerification);
    CURRENT_SESSION = { ...CURRENT_SESSION, ...result.user };
    const existing = users.find(user => user.employeeId === CURRENT_SESSION.employeeId);
    if (existing) Object.assign(existing, result.user);
    await saveItem(STORAGE_KEYS.SESSION, CURRENT_SESSION);
    await restartCloudSyncIfReady();
    notify();
    return { success: true, message: 'Your registered mobile number has been updated successfully.' };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const updateUserPassword = async (currentPassword, newPassword) => {
  if (!CURRENT_SESSION) {
    return { success: false, error: 'No active user session found.' };
  }
  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: 'New password must be at least 8 characters long.' };
  }

  try {
    const result = await changePasswordWithServer(currentPassword, newPassword);
    CURRENT_SESSION = { ...CURRENT_SESSION, ...result.user };
    const existing = users.find(user => user.employeeId === CURRENT_SESSION.employeeId);
    if (existing) Object.assign(existing, result.user);
    SECURITY_PREFERENCES.lastPasswordChange = new Date().toISOString().split('T')[0];
    await saveItem(STORAGE_KEYS.SESSION, CURRENT_SESSION);
    await restartCloudSyncIfReady();
    notify();
    return { success: true, message: result.message || 'Your password has been changed successfully.' };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const requestCurrentPhoneVerification = async () => {
  try {
    return await requestPhoneVerificationWithServer();
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const verifyCurrentPhone = async (code) => {
  try {
    const result = await verifyPhoneWithServer(code);
    CURRENT_SESSION = { ...CURRENT_SESSION, ...result.user };
    await saveItem(STORAGE_KEYS.SESSION, CURRENT_SESSION);
    await restartCloudSyncIfReady();
    notify();
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const formatFullName = (first = '', middle = '', last = '') => {
  const f = (first || '').trim();
  const m = (middle || '').trim();
  const l = (last || '').trim();
  if (!f && !l) return '';
  if (m) {
    const mFormatted = m.length === 1 ? `${m}.` : m;
    return `${f} ${mFormatted} ${l}`.trim();
  }
  return `${f} ${l}`.trim();
};

export const splitFullName = (fullName = '') => {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', middleName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], middleName: '', lastName: '' };
  if (parts.length === 2) return { firstName: parts[0], middleName: '', lastName: parts[1] };
  if (parts.length === 3) {
    if (parts[1].length <= 2) {
      return { firstName: parts[0], middleName: parts[1].replace('.', ''), lastName: parts[2] };
    }
    return { firstName: parts[0], middleName: parts[1], lastName: parts[2] };
  }
  return { firstName: parts.slice(0, -2).join(' '), middleName: parts[parts.length - 2], lastName: parts[parts.length - 1] };
};

export const registerUser = async (userData) => {
  const cleaned = (userData.contactNumber || '').replace(/\D/g, '');
  if (typeof userData.password !== 'string' || userData.password.length < 8) {
    return { success: false, error: 'A password of at least 8 characters is required.' };
  }
  const formattedName = formatFullName(userData.firstName, userData.middleInitial || userData.middleName, userData.lastName);
  const selectedFarm = blockFarms.find(farm => farm.id === userData.blockFarm || farm.name === userData.blockFarm);
  try {
    const result = await registerWithServer({
      displayName: formattedName || `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
      phone: cleaned,
      password: userData.password,
      role: 'MEMBER_FARMER',
      blockFarmId: selectedFarm?.id || ''
    });
    if (result.user) {
      const publicAccount = fromUserDocument(result.user.id, result.user);
      publicAccount.accountId = result.accountId || result.user.id;
      const existing = pendingUsers.find(user => user.employeeId === publicAccount.employeeId);
      if (!existing) pendingUsers.push(publicAccount);
      notify();
      return { ...result, user: publicAccount };
    }
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const DEFAULT_GUEST_SESSION = {
  name: '',
  role: 'Farm Member',
  roleKey: 'member',
  employeeId: '',
  fieldId: '',
  blockFarmId: '',
  blockFarm: '',
  contact: '',
  pendingLogs: 0,
  syncedLogs: 0,
};

let CURRENT_SESSION = { ...DEFAULT_GUEST_SESSION };
let IS_SYNCED = true;

export const getCurrentSession = () => CURRENT_SESSION || DEFAULT_GUEST_SESSION;
export const getIsSynced = () => IS_SYNCED;

const canReportAgriculturalSyncTelemetry = (session = CURRENT_SESSION) => {
  if (!session?.employeeId && !session?.id) return false;
  const role = canonicalRole(session?.canonicalRole || session?.role || session?.roleKey);
  return role === ROLES.MEMBER_FARMER || role === ROLES.FARM_MANAGER;
};

const normalizeSyncEntityId = value => String(value || '').trim().toUpperCase();
const FIELD_SYNC_MUTATION_TYPES = new Set([
  'operation_log',
  'takeover_log',
  'operation_amendment',
  'operation_archive',
  'field_upsert',
  'field_archive',
  'stage_update',
  'cycle_rollover',
  'custom_stages',
  'custom_operations'
]);

export const getOperationSyncState = logId => {
  const normalizedLogId = normalizeSyncEntityId(logId);
  const items = getOutboxQueue().filter(item => {
    if (!['operation_log', 'takeover_log', 'operation_amendment', 'operation_archive'].includes(item?.type)) return false;
    if (normalizeSyncEntityId(item.payload?.id) === normalizedLogId) return true;
    return Array.isArray(item.payload?.operationLogIds)
      && item.payload.operationLogIds.some(id => normalizeSyncEntityId(id) === normalizedLogId);
  });
  const statuses = items.map(item => String(item.status || 'queued').toLowerCase());
  const failureStatuses = new Set(['authentication', 'authorization', 'conflict', 'validation', 'rejected', 'failed', 'server_failure']);
  const status = items.length === 0
    ? 'SYNCED'
    : statuses.some(value => value === 'syncing')
      ? 'SYNCING'
      : statuses.some(value => failureStatuses.has(value)) ? 'FAILED' : 'PENDING';
  return { status, isSynced: status === 'SYNCED', pendingCount: items.length };
};

/**
 * Derive a field's status from retained mutations and local operation markers.
 * Canonical server field documents do not carry the retired client-only
 * `synced` property, so a missing document property must not mean "not synced".
 */
export const getFieldSyncState = fieldId => {
  const normalizedFieldId = normalizeSyncEntityId(fieldId);
  if (!normalizedFieldId || normalizedFieldId === 'UNASSIGNED') {
    return { isSynced: false, pendingCount: 0 };
  }

  const matchingCycles = new Set(
    cropCycles
      .filter(cycle => normalizeSyncEntityId(cycle?.fieldId) === normalizedFieldId)
      .map(cycle => normalizeSyncEntityId(cycle?.id))
  );
  const matchingOperationIds = new Set(
    operationLogs
      .filter(log => normalizeSyncEntityId(log?.fieldId) === normalizedFieldId)
      .map(log => normalizeSyncEntityId(log?.id))
  );
  const pendingMutationIds = new Set();
  const matchingStatuses = [];

  getOutboxQueue().forEach(item => {
    if (!FIELD_SYNC_MUTATION_TYPES.has(item?.type)) return;
    const payload = item?.payload || {};
    const payloadFieldId = normalizeSyncEntityId(payload.fieldId || payload.changes?.fieldId);
    const payloadId = normalizeSyncEntityId(payload.id);
    const entityKey = String(item?.entityKey || '');
    const entityId = normalizeSyncEntityId(entityKey.slice(entityKey.indexOf('/') + 1));
    const archivedOperationIds = Array.isArray(payload.operationLogIds)
      ? payload.operationLogIds.map(normalizeSyncEntityId)
      : [];

    const targetsField = payloadFieldId === normalizedFieldId
      || ((item.type === 'field_upsert' || item.type === 'field_archive') && payloadId === normalizedFieldId)
      || (entityKey.startsWith('fields/') && entityId === normalizedFieldId)
      || matchingCycles.has(normalizeSyncEntityId(payload.cycleId))
      || (entityKey.startsWith('crop_cycles/') && matchingCycles.has(entityId))
      || matchingOperationIds.has(payloadId)
      || (entityKey.startsWith('operation_logs/') && matchingOperationIds.has(entityId))
      || archivedOperationIds.some(id => matchingOperationIds.has(id));

    if (targetsField) {
      pendingMutationIds.add(item.mutationId || item.outboxId);
      matchingStatuses.push(String(item.status || 'queued').toLowerCase());
    }
  });

  operationLogs.forEach(log => {
    if (normalizeSyncEntityId(log?.fieldId) !== normalizedFieldId) return;
    if (log.status !== 'ACTIVE' || log.isDraft === true) return;
    if (log.isOffline === true || log.synced === false || log.cloudQueueStatus === 'offline_queued') {
      const representedByMutation = getOutboxQueue().some(item =>
        ['operation_log', 'takeover_log'].includes(item.type)
        && normalizeSyncEntityId(item.payload?.id) === normalizeSyncEntityId(log.id)
      );
      if (!representedByMutation) pendingMutationIds.add(`local-operation:${log.id}`);
    }
  });

  const failureStatuses = new Set(['authentication', 'authorization', 'conflict', 'validation', 'rejected', 'failed', 'server_failure']);
  const status = pendingMutationIds.size === 0
    ? 'SYNCED'
    : matchingStatuses.some(itemStatus => itemStatus === 'syncing')
      ? 'SYNCING'
      : matchingStatuses.some(itemStatus => failureStatuses.has(itemStatus))
        ? 'FAILED'
        : 'PENDING';
  return { isSynced: status === 'SYNCED', status, pendingCount: pendingMutationIds.size };
};

/**
 * Returns accurate count of pending unsynced logs & outbox entries
 * Counts only submitted ACTIVE records that have not reached Firestore.
 */
export const getPendingSyncCount = (userSession = CURRENT_SESSION) => {
  const userRole = userSession?.role || 'Farm Member';

  const queue = getOutboxQueue();
  const pendingKeys = new Set(queue.map(item => item.mutationId || item.outboxId));
  const activeUnsyncedLogs = operationLogs.filter(l => {
    if (!l) return false;
    if (l.status !== 'ACTIVE' || l.isDraft === true) return false;

    // Check if log is flagged offline or unsynced or queued
    return l.isOffline === true || l.synced === false || l.cloudQueueStatus === 'offline_queued';
  });

  activeUnsyncedLogs.forEach(log => {
    const representedByMutation = queue.some(item =>
      ['operation_log', 'takeover_log'].includes(item.type)
      && normalizeSyncEntityId(item.payload?.id) === normalizeSyncEntityId(log.id)
    );
    if (!representedByMutation) pendingKeys.add(`local-operation:${log.id}`);
  });
  return pendingKeys.size;
};

export const getRelevantAuditSyncState = (blockFarmId, periodKey) => {
  const normalizedFarmId = normalizeSyncEntityId(blockFarmId);
  const relevantFieldIds = new Set(fields
    .filter(field => normalizeSyncEntityId(field.blockFarmId) === normalizedFarmId)
    .map(field => normalizeSyncEntityId(field.id)));
  const relevantOperationIds = new Set(operationLogs
    .filter(log => relevantFieldIds.has(normalizeSyncEntityId(log.fieldId)) && String(log.performedOn || log.isoDate || '').startsWith(`${periodKey}-`))
    .map(log => normalizeSyncEntityId(log.id)));
  const relevantTypes = new Set(['operation_log', 'takeover_log', 'operation_amendment', 'operation_archive', 'field_upsert', 'field_archive']);
  const pending = getOutboxQueue().filter(item => {
    if (!relevantTypes.has(item?.type)) return false;
    const payload = item.payload || {};
    const payloadId = normalizeSyncEntityId(payload.id);
    const payloadFieldId = normalizeSyncEntityId(payload.fieldId || payload.changes?.fieldId);
    const operationIds = Array.isArray(payload.operationLogIds) ? payload.operationLogIds.map(normalizeSyncEntityId) : [];
    const performedOn = String(payload.performedOn || payload.isoDate || payload.changes?.performedOn || '');
    if (['field_upsert', 'field_archive'].includes(item.type)) return relevantFieldIds.has(payloadId) || normalizeSyncEntityId(payload.blockFarmId) === normalizedFarmId;
    return relevantOperationIds.has(payloadId)
      || operationIds.some(id => relevantOperationIds.has(id))
      || (relevantFieldIds.has(payloadFieldId) && (!performedOn || performedOn.startsWith(`${periodKey}-`)));
  });
  return { isSynced: pending.length === 0, pendingCount: pending.length, pending };
};

let listeners = [];

export const subscribe = (listener) => {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
};

let persistTimeout = null;
const persistAllToStorage = () => {
  if (persistTimeout) clearTimeout(persistTimeout);
  persistTimeout = setTimeout(async () => {
    try {
      await multiSave([
        [STORAGE_KEYS.SESSION, CURRENT_SESSION],
        [STORAGE_KEYS.BLOCK_FARMS, blockFarms],
        [STORAGE_KEYS.CROP_CYCLES, cropCycles],
        [STORAGE_KEYS.LOGS, operationLogs],
        [STORAGE_KEYS.FIELDS, fields],
        [STORAGE_KEYS.TICKETS, supportTickets],
        [STORAGE_KEYS.PREFS, SECURITY_PREFERENCES],
        [STORAGE_KEYS.PENDING_ASSIGNMENTS, assignmentRequests],
        [STORAGE_KEYS.PENDING_USERS, pendingUsers],
        [STORAGE_KEYS.AUDIT_REPORTS, auditReports],
        [STORAGE_KEYS.SYSTEM_HISTORY, systemHistory],
      ]);
    } catch (e) {
      console.warn('[dataStore] Background persistence error:', e);
    }
  }, 350);
};

const notify = () => {
  persistAllToStorage();
  listeners.forEach(l => {
    try {
      l();
    } catch (e) {
      console.warn('Subscriber error', e);
    }
  });
};

export const notifyDataUpdate = notify;

export const setSession = (role) => {
  const account = users.find(u => u.role === role);
  if (account) {
    const pendingCount = getPendingSyncCount(account);
    CURRENT_SESSION = {
      ...account,
      pendingLogs: pendingCount,
      syncedLogs: operationLogs.filter(l => l.status === 'ACTIVE' && l.synced !== false).length,
    };
    notify();
  }
};

export const updateSessionFieldId = (fieldId) => {
  if (CURRENT_SESSION && CURRENT_SESSION.role === 'Farm Member') {
    CURRENT_SESSION.fieldId = fieldId;
    notify();
  }
};

export const updateFieldStageAndCycle = async (fieldId, updates, takeoverGrant = null) => {
  if (!fieldId) return { success: false, message: 'Field ID is required.' };
  const targetField = fields.find(f => f.id === fieldId);
  if (!targetField?.currentCycleId) return { success: false, message: 'Field has no explicit currentCycleId.' };
  const previousField = { ...targetField };
  const localCycle = cropCycles.find(c => c.id === targetField.currentCycleId);
  const baseVersion = localCycle?.updatedAt || null;
  Object.assign(targetField, updates);
  const locallyPersisted = await saveItem(STORAGE_KEYS.FIELDS, fields);
  if (!locallyPersisted) {
    Object.keys(targetField).forEach(key => delete targetField[key]);
    Object.assign(targetField, previousField);
    return { success: false, message: 'The stage change could not be saved on this device.' };
  }
  notify();

  try {
    const cycleUpdate = {
      currentStageNumber: Number(updates.stageNumber || targetField.stageNumber || 1),
      elapsedMonths: Number(updates.month ?? targetField.month ?? 0)
    };
    const outcome = await commitExplicitMutation('stage_update', {
      cycleId: targetField.currentCycleId,
      ...cycleUpdate
    }, { baseVersion, takeoverGrant });
    if (outcome.response?.data) {
      if (localCycle) Object.assign(localCycle, outcome.response.data);
      targetField.stageNumber = Number(outcome.response.data.currentStageNumber);
      targetField.stage = canonicalStageName(outcome.response.data.currentStageNumber);
      targetField.month = Number(outcome.response.data.elapsedMonths || 0);
      targetField.synced = true;
      targetField.lastSync = 'Just now';
      await saveItem(STORAGE_KEYS.FIELDS, fields);
      console.info(`[FIELD] Stage refreshed: ${targetField.id}`);
      notify();
    }
    return { success: true, data: outcome.response?.data, queuedOffline: outcome.queued };
  } catch (e) {
    Object.keys(targetField).forEach(key => delete targetField[key]);
    Object.assign(targetField, previousField);
    await saveItem(STORAGE_KEYS.FIELDS, fields);
    notify();
    return { success: false, message: e.message || 'The stage update was rejected by the server.' };
  }
};

export const archiveFieldCropCycle = async (fieldId, options = {}) => {
  if (!fieldId) return { success: false, message: 'Field ID is required' };
  const cleanId = String(fieldId).trim().toUpperCase();
  if (!getNetworkStatus()) {
    return { success: false, message: 'Starting the next Crop Year Cycle requires an active server connection.' };
  }
  if (!getFieldSyncState(cleanId).isSynced) {
    return { success: false, message: 'Please synchronize pending records for this field before starting the next Crop Year Cycle.' };
  }

  const targetField = fields.find(f => String(f.id || '').trim().toUpperCase() === cleanId);
  if (!targetField?.currentCycleId) return { success: false, message: 'Field has no explicit current Crop Year Cycle' };
  const oldCycleId = targetField.currentCycleId;
  const oldCycle = cropCycles.find(c => c.id === oldCycleId);
  const finalCycleType = options.cycleType || targetField.cycleType || 'Plant Cane (New Plant)';
  const request = {
    previousCycleId: oldCycleId,
    cropType: finalCycleType,
    batchNumber: targetField.batchMonth || 1
  };
  let result;
  try {
    const mutationId = `ROLLOVER-${cleanId}-${oldCycleId}`;
    const response = await authenticatedRequest(`/api/crop-cycles/${encodeURIComponent(cleanId)}/rollover`, {
      method: 'POST',
      headers: options.takeoverGrant ? { 'X-Hugpong-Takeover-Grant': options.takeoverGrant } : {},
      body: {
        ...request,
        _mutation: {
          mutationId,
          idempotencyKey: mutationId,
          entityKey: `fields/${cleanId}`,
          baseVersion: targetField.updatedAt || null
        }
      }
    });
    result = response?.data;
    if (!result) throw new Error('Crop Year Cycle rollover returned no server response.');
  } catch (err) {
    return { success: false, message: err.message || 'Crop Year Cycle rollover was rejected by the server.' };
  }
  if (!result?.newCycleId || !result.newCycle) {
    return { success: false, message: 'Crop Year Cycle rollover returned an incomplete response.' };
  }
  const targetLogs = operationLogs.filter(l => {
    return l.cycleId === result.oldCycleId && l.status === 'ACTIVE';
  });

  targetLogs.forEach(l => {
    l.status = 'ARCHIVED';
    l.archivedAt = result.oldCycle?.archivedAt;
    l.archivedByUserId = result.oldCycle?.archivedByUserId;
    l.updatedAt = result.oldCycle?.updatedAt;
  });
  
  // Remove drafts belonging to the archived cycle
  const remainingDrafts = draftLogs.filter(d => String(d.fieldId || '').trim().toUpperCase() !== cleanId);
  draftLogs.length = 0;
  remainingDrafts.forEach(d => draftLogs.push(d));

  // Canonical reset of the field plot in dataStore to Stage 1 of the new crop cycle
  if (targetField) {
    const stage1Name = options.stage || 'Pre-Planting & Land Preparation';
    const freshCustomStages = Array.isArray(options.customStages) && options.customStages.length > 0
      ? options.customStages
      : [];

    targetField.stage = stage1Name;
    targetField.stageNumber = result.newCycle.currentStageNumber;
    targetField.isCompleted = false;
    targetField.customStages = freshCustomStages;
    targetField.cycleType = result.newCycle.cropType;
    targetField.cropYear = result.newCycle.cropYear;
    targetField.cycleNumber = result.newCycle.sequenceNumber;
    targetField.currentCycleId = result.newCycleId;
    targetField.lastUpdated = result.newCycle.updatedAt;
    targetField.lastSync = 'Just now';
    targetField.synced = true;
    await saveItem(STORAGE_KEYS.FIELDS, fields);
  }

  if (oldCycle && result.oldCycle) Object.assign(oldCycle, result.oldCycle);
  const existingNewCycle = cropCycles.find(cycle => cycle.id === result.newCycleId);
  if (existingNewCycle) Object.assign(existingNewCycle, fromCycleDocument(result.newCycleId, result.newCycle));
  else cropCycles.push(fromCycleDocument(result.newCycleId, result.newCycle));

  await saveItem(STORAGE_KEYS.LOGS, operationLogs);
  await persistCurrentUserDrafts();
  notify();

  // Record audit history event shared with Web & Cloud
  const session = getCurrentSession();
  const actorName = session?.name ? `${session.name} (${session.role || 'Farm Manager'})` : 'Farm Manager';
  await logSystemEvent(
    'operation',
    'Crop Year Cycle Renewal',
    fieldId,
    `Archived ${targetLogs.length} current log(s) and reset ${fieldId} to Stage 1: "${options?.stage || 'Pre-Planting & Land Preparation'}" (${formatCropYear(result.newCycle.cropYear)}).`,
    actorName,
    'Completed'
  );
  return { success: true, archivedCount: result.archivedLogCount, cycleId: result.newCycleId, cropYear: result.newCycle.cropYear, queuedOffline: false };
};

export const archiveFieldPlot = async (fieldId) => {
  if (!fieldId) return { success: false, message: 'Field ID is required' };
  const cleanId = String(fieldId).trim().toUpperCase();
  const nowIso = new Date().toISOString();

  const targetIdx = fields.findIndex(f => f.id.toUpperCase() === cleanId);
  if (targetIdx === -1) return { success: false, message: 'Field plot not found' };

  const targetField = fields[targetIdx];
  let authoritativeField = null;
  let queuedOffline = false;
  try {
    const outcome = await commitExplicitMutation('field_archive', { id: cleanId }, {
      baseVersion: targetField.updatedAt || null
    });
    queuedOffline = outcome.queued;
    authoritativeField = outcome.response?.data;
  } catch (error) {
    return { success: false, message: error.message || 'The field archive was rejected by the server.' };
  }
  Object.assign(targetField, authoritativeField || {
    status: 'ARCHIVED',
    archivedAt: nowIso,
    updatedAt: nowIso
  });
  targetField.updatedAt = nowIso;

  // Remove from active fields array
  fields.splice(targetIdx, 1);

  // Add to archivedFields array if not already present
  if (!archivedFields.some(af => (typeof af === 'string' ? af : af.id).toUpperCase() === cleanId)) {
    archivedFields.push(targetField);
  }

  // Archive all logs belonging to this field
  const actorUserId = getCurrentSession()?.employeeId || getCurrentSession()?.id || '';
  operationLogs.forEach(l => {
    if (String(l.fieldId || '').trim().toUpperCase() === cleanId && l.status === 'ACTIVE') {
      l.status = 'ARCHIVED';
      l.archivedAt = l.archivedAt || targetField.archivedAt || nowIso;
      l.archivedByUserId = actorUserId;
      l.updatedAt = targetField.updatedAt || nowIso;
    }
  });

  await saveItem(STORAGE_KEYS.FIELDS, fields);
  await saveItem(STORAGE_KEYS.ARCHIVED_FIELDS, archivedFields);
  await saveItem(STORAGE_KEYS.LOGS, operationLogs);
  notify();

  await logSystemEvent(
    'plot',
    'Field Plot Archived',
    cleanId,
    `Archived field plot ${cleanId} from active registry.`,
    getCurrentSession()?.name || 'Farm Manager',
    'Archived'
  );

  return { success: true, fieldId: cleanId, queuedOffline };
};

export const logSystemEvent = async (category, eventType, entity, details, actor, status = 'Recorded') => {
  const session = getCurrentSession();
  const defaultActor = session?.name ? `${session.name} (${session.role || 'Farm Manager'})` : 'Farm Manager';
  
  let catLabel = 'System';
  if (category === 'operation') catLabel = 'Field Operation';
  else if (category === 'plot') catLabel = 'Plot Registry';
  else if (category === 'block') catLabel = 'Block Farm';
  else if (category === 'user') catLabel = 'User Management';
  else if (category === 'sra' || category === 'price' || category === 'audit') catLabel = 'SRA Price / Audit';

  const auditId = `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date();
  const newEvent = {
    id: auditId,
    timestamp: now.toLocaleString('en-PH', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    createdAt: now.toISOString(),
    rawTimestamp: now.toISOString(),
    isNew: true,
    category: category || 'operation',
    categoryLabel: catLabel,
    eventType: eventType || 'System Event',
    entity: entity || 'System',
    details: details || '',
    actor: actor || defaultActor,
    status: status || 'Recorded'
  };
  const operationEntityIsLog = operationLogs.some(log => log.id === String(entity || ''));
  const blockFarmEntity = blockFarms.find(farm => farm.id === entity || farm.code === entity || farm.name === entity);
  const entityTypes = {
    operation: operationEntityIsLog ? 'OPERATION_LOG' : 'FIELD',
    plot: 'FIELD',
    block: 'BLOCK_FARM',
    user: 'USER',
    price: 'SRA_PRICE',
    sra: 'AUDIT_REPORT',
    audit: 'AUDIT_REPORT'
  };
  const canonicalEvent = {
    eventType: String(eventType || 'SYSTEM_EVENT').trim().replace(/\s+/g, '_').toUpperCase(),
    actorUserId: session?.employeeId || session?.id || '',
    entityType: entityTypes[category] || 'AUDIT_REPORT',
    entityId: String(blockFarmEntity?.id || entity || 'SYSTEM'),
    details: details || '',
    outcome: String(status || '').toUpperCase() === 'FAILED' ? 'FAILURE' : 'SUCCESS',
    createdAt: now.toISOString()
  };

  const existingIdx = systemHistory.findIndex(a => a.id === auditId);
  if (existingIdx >= 0) {
    systemHistory[existingIdx] = newEvent;
  } else {
    systemHistory.unshift(newEvent);
  }

  await saveItem(STORAGE_KEYS.SYSTEM_HISTORY, systemHistory);
  notify();

  try {
    await commitExplicitMutation('audit_log', { id: auditId, ...canonicalEvent });
  } catch (e) {
    console.warn('[dataStore] Audit event rejected:', e);
  }

  return newEvent;
};

export const deleteDraftLogs = async (draftIds = []) => {
  if (!Array.isArray(draftIds) || draftIds.length === 0) return;
  const idSet = new Set(draftIds);
  const remaining = draftLogs.filter(d => !idSet.has(d.id));
  draftLogs.length = 0;
  remaining.forEach(d => draftLogs.push(d));
  await persistCurrentUserDrafts();
  notify();
};

export const clearAllDraftsForField = async (fieldId) => {
  if (!fieldId) return;
  const remaining = draftLogs.filter(d => d.fieldId !== fieldId);
  draftLogs.length = 0;
  remaining.forEach(d => draftLogs.push(d));
  await persistCurrentUserDrafts();
  notify();
};

export const saveDraftLogs = async () => {
  await persistCurrentUserDrafts();
  notify();
};

const currentActorId = () => String(CURRENT_SESSION?.employeeId || CURRENT_SESSION?.id || '').trim();
const currentDraftKey = () => currentActorId() ? localDraftStorageKey(currentActorId()) : null;

async function persistCurrentUserDrafts() {
  const actorId = currentActorId();
  const key = currentDraftKey();
  if (!key) return false;
  return saveItem(key, draftLogs.filter(draft => draft?.createdByUserId === actorId && draft?.status === 'DRAFT'));
}

export const validateLocalDraftForSubmission = (draft, currentFields = fields) => {
  const actorId = currentActorId();
  if (!draft || draft.status !== 'DRAFT' || draft.createdByUserId !== actorId) {
    return { valid: false, error: 'This draft does not belong to the signed-in account.' };
  }
  const field = currentFields.find(item => String(item.id || '').trim().toUpperCase() === String(draft.fieldId || '').trim().toUpperCase());
  if (!field || String(field.memberUserId || '').trim() !== actorId) {
    return { valid: false, error: 'Your field assignment changed. This local draft was preserved but cannot be submitted.' };
  }
  return { valid: true, field };
};

export const inspectLocalDraftIntegrity = (candidateDrafts = draftLogs, currentFields = fields) => {
  const valid = [];
  const invalid = [];
  (candidateDrafts || []).forEach(draft => {
    const result = validateLocalDraftForSubmission(draft, currentFields);
    (result.valid ? valid : invalid).push(result.valid ? draft : { draft, reason: result.error });
  });
  return { valid, invalid };
};

export const saveLocalOperationDraft = async (input, existingId = null) => {
  const actorId = currentActorId();
  const fieldId = String(input?.fieldId || '').trim().toUpperCase();
  const field = fields.find(item => String(item.id || '').trim().toUpperCase() === fieldId);
  if (!actorId || !field || String(field.memberUserId || '').trim() !== actorId) {
    throw new Error('Drafts can only be saved for your own currently assigned field.');
  }
  const prior = existingId ? draftLogs.find(draft => draft.id === existingId) : null;
  const now = new Date().toISOString();
  const draft = {
    ...input,
    id: prior?.id || `DFT-${fieldId}-${Date.now().toString(36).toUpperCase()}`,
    fieldId,
    status: 'DRAFT',
    localOnly: true,
    isDraft: true,
    createdByUserId: actorId,
    createdAt: prior?.createdAt || now,
    updatedAt: now,
    submittedOperationId: prior?.submittedOperationId || `OP-${fieldId}-${Date.now().toString(36).toUpperCase()}`
  };
  delete draft.synced;
  delete draft.isOffline;
  delete draft.cloudQueueStatus;
  delete draft.submissionSource;
  delete draft.submittedByUserId;
  const index = draftLogs.findIndex(item => item.id === draft.id);
  if (index >= 0) draftLogs[index] = draft;
  else draftLogs.unshift(draft);
  await persistCurrentUserDrafts();
  notify();
  return draft;
};

export const claimLocalDraftSubmission = async draftId => {
  const draft = draftLogs.find(item => item.id === draftId);
  const validation = validateLocalDraftForSubmission(draft);
  if (!validation.valid) throw new Error(validation.error);
  if (draft.submitting) throw new Error('This draft submission is already in progress.');
  draft.submitting = true;
  draft.submissionClaimedAt = new Date().toISOString();
  await persistCurrentUserDrafts();
  return { draft, field: validation.field };
};

export const releaseLocalDraftSubmission = async draftId => {
  const draft = draftLogs.find(item => item.id === draftId);
  if (draft) {
    draft.submitting = false;
    draft.submissionClaimedAt = null;
    await persistCurrentUserDrafts();
  }
};

export const isLogLocked = (log) => {
  return Boolean(log && log.status === 'ARCHIVED');
};

export const getLogAuditTrail = (logId) => {
  const target = operationLogs.find(l => l.id === logId);
  return target && Array.isArray(target.amendments) ? target.amendments : [];
};

export const updateOperationLogWithSecurity = async (logId, updates, editReason, authorization = {}) => {
  if (!CURRENT_SESSION) {
    return { success: false, error: 'No active session. Please log in.' };
  }

  const targetLog = operationLogs.find(l => l.id === logId);
  if (!targetLog) {
    return { success: false, error: 'Operation log not found in local or cloud records.' };
  }

  if (isLogLocked(targetLog)) {
    return { 
      success: false, 
      error: 'Security Lockout: This operation log is archived historical data and cannot be modified.'
    };
  }

  const reasonTrimmed = String(editReason || '').trim();
  if (!reasonTrimmed || reasonTrimmed.length < 3) {
    return { success: false, error: 'A valid reason for amendment or correction is required for the official audit trail.' };
  }

  // Record audit history snapshot
  const previousValues = {
    activity: targetLog.activity || targetLog.task || targetLog.operationName || '',
    cost: targetLog.totalCost != null ? targetLog.totalCost : (targetLog.cost != null ? targetLog.cost : 0),
    hectares: targetLog.hectares || '0.0',
    people: targetLog.people || '0',
    inputQty: targetLog.inputQty || '',
    inputUnit: targetLog.inputUnit || '',
    inputName: targetLog.inputName || '',
    variety: targetLog.variety || '',
    date: targetLog.date || targetLog.period || '',
    subItems: Array.isArray(targetLog.subItems) ? JSON.parse(JSON.stringify(targetLog.subItems)) : [],
  };

  const newValues = {
    activity: updates.activity || updates.operationName || previousValues.activity,
    cost: updates.totalCost != null ? updates.totalCost : (updates.cost != null ? updates.cost : previousValues.cost),
    hectares: updates.hectares != null ? updates.hectares : previousValues.hectares,
    people: updates.people != null ? updates.people : previousValues.people,
    inputQty: updates.inputQty != null ? updates.inputQty : previousValues.inputQty,
    inputUnit: updates.inputUnit != null ? updates.inputUnit : previousValues.inputUnit,
    inputName: updates.inputName != null ? updates.inputName : previousValues.inputName,
    variety: updates.variety != null ? updates.variety : previousValues.variety,
    date: updates.date || updates.period || previousValues.date,
    subItems: Array.isArray(updates.subItems) ? JSON.parse(JSON.stringify(updates.subItems)) : previousValues.subItems,
  };

  // Check if any actual change exists between previous and new values
  const prevSI = previousValues.subItems || [];
  const newSI = newValues.subItems || [];
  let subItemsChanged = prevSI.length !== newSI.length;
  if (!subItemsChanged) {
    for (let i = 0; i < prevSI.length; i++) {
      if (
        (prevSI[i].description || '').trim() !== (newSI[i].description || '').trim() ||
        Number(prevSI[i].qty || 0) !== Number(newSI[i].qty || 0) ||
        Number(prevSI[i].unitCost || 0) !== Number(newSI[i].unitCost || 0) ||
        (prevSI[i].unit || '') !== (newSI[i].unit || '')
      ) {
        subItemsChanged = true;
        break;
      }
    }
  }

  const hasActivityChanged = (previousValues.activity || '').trim() !== (newValues.activity || '').trim();
  const hasCostChanged = Math.abs(Number(previousValues.cost || 0) - Number(newValues.cost || 0)) > 0.009;
  const hasHaChanged = Math.abs(parseFloat(previousValues.hectares || 0) - parseFloat(newValues.hectares || 0)) > 0.001;
  const hasPeopleChanged = Number(previousValues.people || 0) !== Number(newValues.people || 0);
  const hasDateChanged = formatDisplayDate(previousValues.date) !== formatDisplayDate(newValues.date);
  const hasInputQtyChanged = String(previousValues.inputQty || '').trim() !== String(newValues.inputQty || '').trim();
  const hasInputUnitChanged = String(previousValues.inputUnit || '').trim() !== String(newValues.inputUnit || '').trim();
  const hasInputNameChanged = String(previousValues.inputName || '').trim() !== String(newValues.inputName || '').trim();
  const hasVarietyChanged = String(previousValues.variety || '').trim() !== String(newValues.variety || '').trim();

  const hasChanges = hasActivityChanged || hasCostChanged || hasHaChanged || hasPeopleChanged || hasDateChanged || hasInputQtyChanged || hasInputUnitChanged || hasInputNameChanged || hasVarietyChanged || subItemsChanged;

  if (!hasChanges) {
    return {
      success: false,
      noChanges: true,
      error: 'No changes detected. The operation details are identical to the current record. Nothing was submitted.'
    };
  }

  const changes = {};
  const includeChange = (changed, key) => {
    if (changed) changes[key] = { before: previousValues[key], after: newValues[key] };
  };
  includeChange(hasActivityChanged, 'activity');
  includeChange(hasCostChanged, 'cost');
  includeChange(hasHaChanged, 'hectares');
  includeChange(hasPeopleChanged, 'people');
  includeChange(hasDateChanged, 'date');
  includeChange(hasInputQtyChanged, 'inputQty');
  includeChange(hasInputUnitChanged, 'inputUnit');
  includeChange(hasInputNameChanged, 'inputName');
  includeChange(hasVarietyChanged, 'variety');
  includeChange(subItemsChanged, 'subItems');
  const editRecord = {
    amendmentId: `AMD-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
    amendedByUserId: CURRENT_SESSION.employeeId || CURRENT_SESSION.id || '',
    amendedByName: CURRENT_SESSION.name || '',
    amendedByRole: canonicalRole(CURRENT_SESSION.role || CURRENT_SESSION.roleKey) || CURRENT_SESSION.role || '',
    reason: reasonTrimmed,
    amendedAt: new Date().toISOString(),
    changes
  };

  const existingHistory = Array.isArray(targetLog.amendments) ? targetLog.amendments : [];
  const originalLog = JSON.parse(JSON.stringify(targetLog));
  
  const displayDate = formatDisplayDate(updates.date || updates.period || targetLog.date || targetLog.period);
  const costNum = Number(updates.totalCost != null ? updates.totalCost : (updates.cost != null ? updates.cost : (targetLog.totalCost != null ? targetLog.totalCost : targetLog.cost || 0)));

  const candidateLog = { ...targetLog, ...updates,
    date: displayDate,
    period: displayDate,
    isoDate: toISODateString(displayDate),
    cost: costNum,
    totalCost: costNum,
    amendments: [...existingHistory, editRecord],
    status: 'ACTIVE',
    updatedAt: new Date().toISOString()
  };

  const canonicalChanges = toOperationLogDocument(candidateLog, {
    cycleId: candidateLog.cycleId,
    submittedByUserId: candidateLog.submittedByUserId || candidateLog.loggedById,
    status: 'ACTIVE'
  });
  delete canonicalChanges.amendments;
  // Operation amendments must preserve the original identity and provenance.
  // The server owns these immutable fields and keeps the same operation ID.
  ['fieldId', 'cycleId', 'submittedByUserId', 'submissionSource', 'createdAt', 'status', 'archivedAt', 'archivedByUserId']
    .forEach(key => delete canonicalChanges[key]);
  try {
    const outcome = await commitExplicitMutation('operation_amendment', {
      id: logId,
      changes: canonicalChanges,
      amendment: editRecord
    }, {
      baseVersion: originalLog.updatedAt || null,
      takeoverGrant: authorization?.takeoverGrant || null
    });
    if (outcome.response?.data) {
      const authoritative = fromOperationLogDocument(outcome.response.data.id || logId, outcome.response.data);
      Object.keys(targetLog).forEach(key => delete targetLog[key]);
      Object.assign(targetLog, authoritative);
      await saveItem(STORAGE_KEYS.LOGS, operationLogs);
    } else if (outcome.queued) {
      Object.keys(targetLog).forEach(key => delete targetLog[key]);
      Object.assign(targetLog, candidateLog);
      await saveItem(STORAGE_KEYS.LOGS, operationLogs);
    }
  } catch (e) {
    const authoritative = e.data?.status === 'ARCHIVED'
      ? fromOperationLogDocument(e.data.id || logId, e.data)
      : originalLog;
    Object.keys(targetLog).forEach(key => delete targetLog[key]);
    Object.assign(targetLog, authoritative);
    await saveItem(STORAGE_KEYS.LOGS, operationLogs);
    notify();
    return { success: false, error: e.message || 'The operation amendment was rejected by the server.' };
  }

  notify();
  return { success: true, log: targetLog, editRecord };
};

export const archivePastLogsForField = async (fieldId, takeoverGrant = null) => {
  if (!fieldId) return { success: false, message: 'Field ID is required' };
  const fId = fieldId.trim().toUpperCase();
  const nowIso = new Date().toISOString();
  
  const field = fields.find(item => String(item.id || '').trim().toUpperCase() === fId);
  if (!field?.currentCycleId) return { success: false, message: 'Field has no explicit current Crop Year Cycle' };
  const actorUserId = getCurrentSession()?.employeeId || getCurrentSession()?.id || '';
  const toArchive = operationLogs.filter(l => l.cycleId === field.currentCycleId && l.status === 'ACTIVE');
  if (!toArchive.length) return { success: true, archivedCount: 0 };

  let archivedAt = nowIso;
  try {
    const outcome = await commitExplicitMutation('operation_archive', {
      operationLogIds: toArchive.map(log => log.id)
    }, {
      baseVersion: Object.fromEntries(toArchive.map(log => [log.id, log.updatedAt || null])),
      takeoverGrant
    });
    archivedAt = outcome.response?.data?.archivedAt || outcome.response?.archivedAt || archivedAt;
  } catch (err) {
    return { success: false, message: err.message || 'The archive request was rejected by the server.' };
  }

  toArchive.forEach(log => {
    log.status = 'ARCHIVED';
    log.archivedAt = archivedAt;
    log.archivedByUserId = actorUserId;
    log.updatedAt = archivedAt;
  });
  await saveItem(STORAGE_KEYS.LOGS, operationLogs);
  notify();

  return { success: true, archivedCount: toArchive.length };
};

export const calculateSRAWeekLabel = (dateInput = new Date()) => {
  let d = dateInput;
  if (!(d instanceof Date)) {
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
      const [y, m, dNum] = dateInput.trim().split('-').map(Number);
      d = new Date(y, m - 1, dNum);
    } else {
      d = new Date(dateInput);
    }
  }
  if (isNaN(d.getTime())) d = new Date();
  const day = d.getDate();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthName = monthNames[d.getMonth()];
  const firstDayOfMonth = new Date(d.getFullYear(), d.getMonth(), 1).getDay(); // 0=Sun, 1=Mon...
  const weekNum = Math.ceil((day + firstDayOfMonth) / 7);
  const boundedWeek = Math.min(Math.max(weekNum, 1), 5);
  return `Week ${boundedWeek} ${monthName}`;
};

export const publishSraPrice = async ({ sugarPricePerLkg, molassesPricePerMetricTon, weekLabel, circularNumber, source, effectiveDate }) => {
  const sugar = Number(sugarPricePerLkg);
  const molasses = Number(molassesPricePerMetricTon);
  if (!Number.isFinite(sugar) || sugar <= 0 || !Number.isFinite(molasses) || molasses <= 0) {
    throw new Error('Both official SRA price values must be greater than zero.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(effectiveDate || '')) || !String(weekLabel || '').trim()
    || !String(circularNumber || '').trim() || !String(source || '').trim()) {
    throw new Error('Effective date, week label, circular number, and official source are required.');
  }
  const sorted = getSortedPrices();
  const prevPrice = sorted.length > 0 ? sorted[0].sugarPricePerLkg : sugar;
  const prevMol = sorted.length > 0 ? sorted[0].molassesPricePerMetricTon : molasses;
  const change = sugar - prevPrice;
  const molChange = molasses - prevMol;

  const pId = `PRC-${Date.now()}`;
  const newPost = toPriceDocument({
    id: pId,
    effectiveDate,
    weekLabel,
    sugarPricePerLkg: sugar,
    sugarPriceChange: change,
    molassesPricePerMetricTon: molasses,
    molassesPriceChange: molChange,
    circularNumber,
    source,
    publishedAt: new Date().toISOString()
  }, CURRENT_SESSION?.employeeId || CURRENT_SESSION?.id || '');
  const localRecord = { id: pId, ...newPost };

  priceHistory.unshift(localRecord);
  await saveItem(STORAGE_KEYS.PRICES, priceHistory);
  notify();

  try {
    const outcome = await commitExplicitMutation('price', { id: pId, ...newPost });
    if (outcome.response?.data) {
      const confirmed = fromPriceDocument(outcome.response.data.id, outcome.response.data);
      const localIndex = priceHistory.findIndex(priceRecord => priceRecord.id === pId);
      if (localIndex >= 0) priceHistory[localIndex] = confirmed;
      await saveItem(STORAGE_KEYS.PRICES, priceHistory);
      notify();
    }
  } catch (err) {
    const localIndex = priceHistory.findIndex(priceRecord => priceRecord.id === pId);
    if (localIndex >= 0) priceHistory.splice(localIndex, 1);
    await saveItem(STORAGE_KEYS.PRICES, priceHistory);
    notify();
    throw err;
  }

  return localRecord;
};

export const setSynced = (synced) => {
  IS_SYNCED = synced;
  if (!synced) {
    CURRENT_SESSION.pendingLogs = (CURRENT_SESSION.pendingLogs || 0) + 1;
  }
  notify();
};

export const currentProfile = {
  get name() { return CURRENT_SESSION?.name || ''; },
  get role() { return CURRENT_SESSION?.role || ''; },
  get employeeId() { return CURRENT_SESSION?.employeeId || ''; },
  get fieldId() { return CURRENT_SESSION?.fieldId || ''; },
  get farm() { return CURRENT_SESSION?.farm || CURRENT_SESSION?.blockFarm || ''; },
  get mobile() { return CURRENT_SESSION?.mobile || CURRENT_SESSION?.contact || ''; },
  get pendingLogs() { return CURRENT_SESSION?.pendingLogs || 0; },
  get syncedLogs() { return CURRENT_SESSION?.syncedLogs || 0; },
};

export const profile = currentProfile;


export { SRA_OPERATIONS_CATALOGUE, getDefaultStageOperations };

export const updateFieldCustomStages = async (fieldId, stages) => {
  const cleanId = String(fieldId || '').trim().toUpperCase();
  const field = fields.find(f => f.id.toUpperCase() === cleanId);
  if (field) {
    const baseVersion = field.updatedAt || null;
    field.customStages = Array.isArray(stages) ? stages : [];
    field.updatedAt = new Date().toISOString();
    await saveItem(STORAGE_KEYS.FIELDS, fields);
    await commitExplicitMutation('custom_stages', {
      fieldId: field.id,
      customStages: field.customStages
    }, { baseVersion });
    notifyDataUpdate();
  }
};

export const getFieldCustomOperations = (fieldId, stageNumber) => {
  const cleanId = String(fieldId || '').trim().toUpperCase();
  const field = fields.find(f => f.id.toUpperCase() === cleanId);
  const sNum = Number(stageNumber) || 1;
  const configuredOps = field?.customOperations?.[sNum] || [];
  const normalizedConfiguredOps = configuredOps
    .filter(op => !getOperationDefinition(op.id) || getOperationDefinition(op.id).stageNumber === sNum)
    .map(op => ({
      ...op,
      isGroup: op.isGroup !== undefined ? op.isGroup : (op.inputType === 'group' || (op.subItems && op.subItems.length > 0)),
      inputType: op.inputType || (op.isGroup ? 'group' : 'direct'),
      subItems: (op.subItems || []).map(si => ({ ...si }))
    }));
  const configuredById = new Map(normalizedConfiguredOps.map(operation => [operation.id, operation]));
  const baseOps = getDefaultStageOperations(sNum).map(operation => configuredById.get(operation.id) || operation);
  normalizedConfiguredOps.forEach(operation => {
    if (!baseOps.some(existing => existing.id === operation.id)) baseOps.push(operation);
  });

  // Dynamically include any recorded operations for this field & stage that are not yet in baseOps
  if (Array.isArray(operationLogs)) {
    const relevantLogs = operationLogs.filter(l => {
      const lFieldId = String(l.fieldId || '').trim().toUpperCase();
      const lStage = Number(l.stageNumber || (l.taskId ? String(l.taskId).replace(/\D/g, '') : 0));
      return lFieldId === cleanId && lStage === sNum && l.status === 'ACTIVE';
    });

    relevantLogs.forEach((log, idx) => {
      const logName = (log.operationName || log.activity || '').trim();
      const logSraId = String(log.sraOperationId || log.operationId || '').trim();

      const alreadyInBase = baseOps.some(op => {
        const opId = String(op.id || '').trim();
        const opName = String(op.name || '').trim();
        if (logSraId && logSraId !== 'CUSTOM' && opId.toUpperCase() === logSraId.toUpperCase()) return true;
        if (logName && opName.toLowerCase() === logName.toLowerCase()) return true;
        return false;
      });

      if (!alreadyInBase && logName) {
        const fieldArea = parseFloat(field?.ha || '1.5') || 1.0;
        const totalCost = Number(log.totalCost != null ? log.totalCost : (log.cost != null ? log.cost : 0));
        const costPerHa = Number(log.costPerHa || (totalCost ? Math.round(totalCost / fieldArea) : 0));
        const customId = logSraId && logSraId !== 'CUSTOM' ? logSraId : `CUSTOM-S${sNum}-${idx + 1}`;

        baseOps.push({
          id: customId,
          name: logName,
          stageNumber: sNum,
          stageName: log.stageName || `Stage ${sNum}`,
          category: log.category || 'prep',
          isCustom: true,
          perHa: log.perHa || 1,
          rate: costPerHa,
          costPerHa: costPerHa,
          inputType: (log.subItems && log.subItems.length > 0) || log.isGroup ? 'group' : 'direct',
          isGroup: !!((log.subItems && log.subItems.length > 0) || log.isGroup),
          subItems: (log.subItems || []).map(si => ({ ...si }))
        });
      }
    });
  }

  return baseOps;
};

export const saveFieldCustomOperations = async (fieldId, stageNumber, operations) => {
  const cleanId = String(fieldId || '').trim().toUpperCase();
  const field = fields.find(f => f.id.toUpperCase() === cleanId);
  if (!field) throw new Error('Field not found. Refresh your assigned plot and try again.');
  if (!getOperationCapabilities(CURRENT_SESSION, field).canPlan) {
    throw new Error('Farm plans can only be changed for your own assigned field.');
  }
  const baseVersion = field.updatedAt || null;
  if (!field.customOperations) field.customOperations = {};
  field.customOperations[stageNumber] = (operations || []).map(op => ({
    ...op,
    isGroup: op.isGroup !== undefined ? op.isGroup : (op.inputType === 'group'),
    inputType: op.inputType || (op.isGroup ? 'group' : 'direct'),
    subItems: (op.subItems || []).map(si => ({ ...si }))
  }));
  field.updatedAt = new Date().toISOString();
  await saveItem(STORAGE_KEYS.FIELDS, fields);
  await commitExplicitMutation('custom_operations', {
    fieldId: field.id,
    customOperations: field.customOperations
  }, { baseVersion });
  notifyDataUpdate();
};

export const saveFieldFullPlan = async (fieldId, fullPlanByStage) => {
  const cleanId = String(fieldId || '').trim().toUpperCase();
  const field = fields.find(f => f.id.toUpperCase() === cleanId);
  if (!field) throw new Error('Field not found. Refresh your assigned plot and try again.');
  if (!getOperationCapabilities(CURRENT_SESSION, field).canPlan) {
    throw new Error('Farm plans can only be changed for your own assigned field.');
  }
  const baseVersion = field.updatedAt || null;
  field.customOperations = { ...(fullPlanByStage || {}) };
  field.updatedAt = new Date().toISOString();
  await saveItem(STORAGE_KEYS.FIELDS, fields);
  await commitExplicitMutation('custom_operations', {
    fieldId: field.id,
    customOperations: field.customOperations
  }, { baseVersion });
  notifyDataUpdate();
};

export const submitSupportTicket = async (ticket) => {
  const requesterRole = canonicalSupportRole(CURRENT_SESSION?.canonicalRole || CURRENT_SESSION?.role || CURRENT_SESSION?.roleKey);
  if (!canCreateSupportTicket(requesterRole)) {
    throw new Error('Super Admin handles support requests and cannot create a normal support ticket.');
  }
  const newId = generateTicketId();
  const sessionUserId = CURRENT_SESSION.employeeId || CURRENT_SESSION.id || '';
  const selectedField = ticket.fieldId ? fields.find(field => field.id === ticket.fieldId) : null;
  const createdAt = new Date().toISOString();
  const details = String(ticket.details || ticket.message || '').trim();
  if (!String(ticket.title || ticket.subject || '').trim()) throw new Error('Subject is required.');
  if (!details) throw new Error('Description is required.');
  const newTicket = {
    id: newId,
    subject: ticket.title || ticket.subject || 'Support Request',
    title: ticket.title || ticket.subject || 'Support Request',
    requesterName: CURRENT_SESSION.name,
    requesterRole,
    memberName: CURRENT_SESSION.name,
    memberId: CURRENT_SESSION.employeeId || '',
    createdByUserId: sessionUserId,
    contact: CURRENT_SESSION.contact || '',
    fieldId: selectedField?.id || null,
    blockFarmId: selectedField?.blockFarmId || ticket.blockFarmId || null,
    operationId: ticket.operationId || null,
    auditReportId: ticket.auditReportId || null,
    category: ticket.category || 'Other',
    priority: 'NORMAL',
    status: SUPPORT_TICKET_STATUS.PENDING_SUBMISSION,
    details,
    messages: [
      {
        messageId: `${newId}-LOCAL`,
        authorUserId: sessionUserId,
        authorName: CURRENT_SESSION.name,
        authorRole: requesterRole,
        visibility: 'PUBLIC',
        content: details,
        createdAt
      }
    ],
    createdAt,
    updatedAt: createdAt
  };
  supportTickets.unshift(newTicket);
  await saveItem(STORAGE_KEYS.TICKETS, supportTickets);

  const ticketPayload = { id: newId, ...toSupportTicketDocument(newTicket, sessionUserId) };
  // PENDING_SUBMISSION is a local state. Canonical tickets always begin OPEN.
  ticketPayload.status = 'OPEN';
  try {
    const outcome = await commitExplicitMutation('ticket', ticketPayload);
    if (!outcome.queued && outcome.response?.data) {
      const canonical = fromSupportTicketDocument(outcome.response.data.id || newId, outcome.response.data);
      const index = supportTickets.findIndex(item => item.id === newId);
      if (index >= 0) supportTickets[index] = canonical;
      await saveItem(STORAGE_KEYS.TICKETS, supportTickets);
      notify();
      return { ...canonical, queued: false };
    }
    notify();
    return { ...newTicket, queued: true };
  } catch (error) {
    const index = supportTickets.findIndex(item => item.id === newId);
    if (index >= 0) supportTickets.splice(index, 1);
    await saveItem(STORAGE_KEYS.TICKETS, supportTickets);
    notify();
    throw error;
  }
};

export const addSupportTicketMessage = async (ticketId, content) => {
  const ticket = supportTickets.find(item => item.id === ticketId);
  if (!ticket) throw new Error('Support ticket not found.');
  const status = String(ticket.status || '').replace(/[\s-]+/g, '_').toUpperCase();
  if (!['PENDING_SUBMISSION', 'OPEN', 'IN_PROGRESS'].includes(status)) {
    throw new Error('Follow-up messages are allowed only while a ticket is active.');
  }
  const cleanContent = String(content || '').trim();
  if (!cleanContent) throw new Error('Message is required.');
  const actorId = CURRENT_SESSION.employeeId || CURRENT_SESSION.id || '';
  const actorRole = canonicalSupportRole(CURRENT_SESSION?.canonicalRole || CURRENT_SESSION?.role || CURRENT_SESSION?.roleKey);
  const message = {
    messageId: `${ticketId}-MSG-${Date.now().toString(36).toUpperCase()}`,
    authorUserId: actorId,
    authorName: CURRENT_SESSION.name,
    authorRole: actorRole,
    visibility: 'PUBLIC',
    content: cleanContent,
    createdAt: new Date().toISOString()
  };
  ticket.messages = [...(ticket.messages || []), message];
  ticket.updatedAt = message.createdAt;
  await saveItem(STORAGE_KEYS.TICKETS, supportTickets);
  notify();
  try {
    const outcome = await commitExplicitMutation('ticket_message', { id: ticketId, messageId: message.messageId, content: cleanContent });
    if (!outcome.queued && outcome.response?.data) {
      Object.assign(ticket, fromSupportTicketDocument(ticketId, outcome.response.data));
      await saveItem(STORAGE_KEYS.TICKETS, supportTickets);
      notify();
    }
    return { ticket, queued: outcome.queued };
  } catch (error) {
    ticket.messages = (ticket.messages || []).filter(item => item.messageId !== message.messageId);
    await saveItem(STORAGE_KEYS.TICKETS, supportTickets);
    notify();
    throw error;
  }
};

// ── Security Preferences State ──────────────────────────────
export let SECURITY_PREFERENCES = {
  biometrics: false,
  pinEnabled: false,
  twoFactor: false,
  sessionAlert: true,
  lastPasswordChange: '2026-05-01'
};

export const getSecurityPreferences = () => ({ ...SECURITY_PREFERENCES });

export const updateSecurityPreferences = (updates) => {
  SECURITY_PREFERENCES = { ...SECURITY_PREFERENCES, ...updates };
  notify();
  return SECURITY_PREFERENCES;
};

export const resetLocalCache = async () => {
  const authToken = await getItem(STORAGE_KEYS.AUTH_TOKEN);
  const activeSession = CURRENT_SESSION?.employeeId ? { ...CURRENT_SESSION } : null;
  draftLogs.length = 0;
  IS_SYNCED = true;
  await clearOutbox();
  await clearHugpongStorage();
  const preservedAuth = [];
  if (activeSession) preservedAuth.push([STORAGE_KEYS.SESSION, activeSession]);
  if (authToken) preservedAuth.push([STORAGE_KEYS.AUTH_TOKEN, authToken]);
  if (preservedAuth.length) await multiSave(preservedAuth);
  notify();
  return true;
};

// ── Real-Time Cloud Firestore Sync ──────────────────────────
// Mobile reads use the same server-enforced authorization boundary as writes.
// The durable outbox remains responsible for offline mutations; this refresh
// only replaces canonical read replicas after a successful API response.
const responseRecords = response => Array.isArray(response?.data) ? response.data : [];

export const listenToCloudSync = () => {
  let active = true;
  let requestInFlight = false;
  let refreshTimer = null;
  let appState = AppState.currentState;
  let appStateSubscription = null;

  const stop = () => {
    active = false;
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
    appStateSubscription?.remove?.();
    appStateSubscription = null;
    if (activeCloudRefresh === refresh) activeCloudRefresh = null;
  };

  const refresh = async () => {
    if (!active || requestInFlight || (appState && appState !== 'active') || !getNetworkStatus()) return;

    const activeRole = canonicalRole(CURRENT_SESSION?.role || CURRENT_SESSION?.roleKey);
    const sessionUserId = String(CURRENT_SESSION?.employeeId || CURRENT_SESSION?.id || '').trim();
    const accountReady = CURRENT_SESSION?.phoneVerified === true
      && CURRENT_SESSION?.requiresPasswordChange !== true
      && CURRENT_SESSION?.pendingFirstLoginVerification !== true;
    const token = await getItem(STORAGE_KEYS.AUTH_TOKEN);

    if (!token || !activeRole || !sessionUserId || !accountReady
      || !auth?.currentUser || auth.currentUser.uid !== sessionUserId) {
      stop();
      return;
    }

    requestInFlight = true;
    try {
      const isMember = activeRole === ROLES.MEMBER_FARMER;
      const [
        blockFarmResponse,
        fieldsResponse,
        cyclesResponse,
        logsResponse,
        pricesResponse,
        ticketsResponse,
        ticketHistoryResponse,
        usersResponse,
        reportsResponse,
        auditEventsResponse
      ] = await Promise.all([
        authenticatedRequest('/api/block-farms'),
        authenticatedRequest('/api/fields'),
        authenticatedRequest('/api/crop-cycles'),
        authenticatedRequest('/api/logs'),
        authenticatedRequest('/api/prices'),
        authenticatedRequest('/api/tickets'),
        authenticatedRequest('/api/tickets?view=history&limit=20'),
        isMember ? Promise.resolve({ data: [] }) : authenticatedRequest('/api/users'),
        isMember ? Promise.resolve({ data: [] }) : authenticatedRequest('/api/audit-reports' + (activeRole === ROLES.SRA_ADMIN ? '?view=inbox&limit=20' : '?view=manager&limit=50')),
        isMember ? Promise.resolve({ data: [] }) : authenticatedRequest('/api/audit-events')
      ]);

      if (!active) return;

      const remoteBlockFarms = responseRecords(blockFarmResponse)
        .map(record => fromBlockFarmDocument(record.id, record));
      const remoteCycles = responseRecords(cyclesResponse)
        .map(record => fromCycleDocument(record.id, record));
      const cycleById = new Map(remoteCycles.map(cycle => [cycle.id, cycle]));
      const mappedFields = responseRecords(fieldsResponse)
        .map(record => fromFieldDocument(record.id, record, cycleById.get(record.currentCycleId)));
      const remoteFields = mappedFields.filter(field => field.status !== 'ARCHIVED');
      const remoteArchivedFields = mappedFields.filter(field => field.status === 'ARCHIVED');

      const canonicalRemoteLogs = responseRecords(logsResponse)
        .filter(record => record.cycleId && (record.status === 'ACTIVE' || record.status === 'ARCHIVED'))
        .map(record => fromOperationLogDocument(record.id, record));
      const remoteLogIds = new Set(canonicalRemoteLogs.map(record => record.id));
      const pendingCreateOverlays = getOutboxQueue()
        .filter(item =>
          (item.type === 'operation_log' || item.type === 'takeover_log')
          && ['queued', 'retryable', 'failed', 'syncing'].includes(item.status)
          && item.payload?.id
          && !remoteLogIds.has(item.payload.id)
        )
        .map(item => ({
          ...fromOperationLogDocument(item.payload.id, item.payload),
          synced: false,
          isOffline: true,
          cloudQueueStatus: 'offline_queued'
        }));
      const reconciledLogs = sortOperationsNewestFirst(cleanupDuplicateLogs([...canonicalRemoteLogs, ...pendingCreateOverlays]));

      const remotePrices = [];
      responseRecords(pricesResponse).forEach(record => {
        try {
          remotePrices.push(fromPriceDocument(record.id, record));
        } catch (error) {
          console.warn('[Mobile] Ignoring invalid server price record:', record?.id || '(missing id)', error.message);
        }
      });
      const orderedRemotePrices = sortNewestFirst(remotePrices, ['effectiveDate', 'publishedAt']);

      const pendingTicketOverlays = supportTickets.filter(ticket => ticket.status === SUPPORT_TICKET_STATUS.PENDING_SUBMISSION);
      const canonicalTickets = [...responseRecords(ticketsResponse), ...responseRecords(ticketHistoryResponse)]
        .map(record => fromSupportTicketDocument(record.id, record));
      const canonicalTicketIds = new Set(canonicalTickets.map(ticket => ticket.id));
      const remoteTickets = sortNewestFirst([
        ...pendingTicketOverlays.filter(ticket => !canonicalTicketIds.has(ticket.id)),
        ...canonicalTickets
      ], ['updatedAt', 'createdAt']);
      const remoteUsers = isMember
        ? []
        : responseRecords(usersResponse).map(record => fromUserDocument(record.id || record.employeeId, record));
      const remoteUserById = new Map(remoteUsers.flatMap(user => {
        const ids = [user.id, user.employeeId, user.userId].filter(Boolean).map(String);
        return ids.map(id => [id, user]);
      }));
      [...remoteFields, ...remoteArchivedFields].forEach(field => {
        const memberId = String(field.memberUserId || '').trim();
        const member = remoteUserById.get(memberId);
        const memberName = member?.displayName || member?.name || field.memberName || field.member || memberId || '';
        field.memberName = memberName;
        field.member = memberName;
      });
      const remoteReports = isMember
        ? []
        : sortNewestFirst(responseRecords(reportsResponse).map(record => fromAuditReportDocument(record.id, record)), ['compiledAt', 'createdAt']);
      const pendingAuditIds = new Set(getOutboxQueue()
        .filter(item => ['audit_report', 'audit_submission', 'audit_return', 'audit_certification', 'audit_qr_import'].includes(item.type))
        .map(item => String(item.payload?.id || item.payload?.reportId || '').trim())
        .filter(Boolean));
      const pendingAuditOverlays = auditReports.filter(report => pendingAuditIds.has(String(report.reportId || report.id || '').trim()));
      const reconciledReportsById = new Map(remoteReports.map(report => [String(report.reportId || report.id), report]));
      pendingAuditOverlays.forEach(report => {
        const reportId = String(report.reportId || report.id);
        reconciledReportsById.set(reportId, { ...(reconciledReportsById.get(reportId) || {}), ...report });
      });
      // Manager audit reports are append-only lifecycle records. A background
      // read may have started before compilation was acknowledged, so its
      // response can omit the just-created report. Preserve the manager's
      // canonical local acknowledgement until a later scoped read includes it.
      // SRA inbox reads deliberately do not use this merge because omission
      // there can mean a report was certified and moved into history.
      if (activeRole === ROLES.FARM_MANAGER) {
        const assignedFarmIds = new Set(remoteBlockFarms
          .filter(farm => String(farm.managerUserId || '').trim() === sessionUserId)
          .map(farm => String(farm.id)));
        auditReports.forEach(report => {
          const reportId = String(report?.reportId || report?.id || '').trim();
          if (!reportId) return;
          if (!assignedFarmIds.has(String(report.blockFarmId || ''))) return;
          const remoteReport = reconciledReportsById.get(reportId);
          const localUpdatedAt = Date.parse(report.updatedAt || report.compiledAt || report.createdAt || '') || 0;
          const remoteUpdatedAt = Date.parse(remoteReport?.updatedAt || remoteReport?.compiledAt || remoteReport?.createdAt || '') || 0;
          if (!remoteReport || localUpdatedAt > remoteUpdatedAt) {
            reconciledReportsById.set(reportId, { ...(remoteReport || {}), ...report });
          }
        });
      }
      const reconciledReports = sortNewestFirst(Array.from(reconciledReportsById.values()), ['compiledAt', 'createdAt']);
      const remoteHistory = isMember ? [] : sortNewestFirst(responseRecords(auditEventsResponse), ['createdAt']);

      blockFarms.length = 0;
      blockFarms.push(...remoteBlockFarms);
      cropCycles.length = 0;
      cropCycles.push(...remoteCycles);
      fields.length = 0;
      fields.push(...remoteFields);
      archivedFields.length = 0;
      archivedFields.push(...remoteArchivedFields);
      operationLogs.length = 0;
      operationLogs.push(...reconciledLogs);
      priceHistory.length = 0;
      priceHistory.push(...orderedRemotePrices);
      supportTickets.length = 0;
      supportTickets.push(...remoteTickets);
      if (!isMember) {
        users.length = 0;
        users.push(...remoteUsers);
        auditReports.length = 0;
        auditReports.push(...reconciledReports);
        systemHistory.length = 0;
        systemHistory.push(...remoteHistory);
      }

      const pendingCount = getPendingSyncCount(CURRENT_SESSION);
      IS_SYNCED = pendingCount === 0;
      CURRENT_SESSION.pendingLogs = pendingCount;

      const cacheEntries = [
        [STORAGE_KEYS.BLOCK_FARMS, blockFarms],
        [STORAGE_KEYS.CROP_CYCLES, cropCycles],
        [STORAGE_KEYS.FIELDS, fields],
        [STORAGE_KEYS.ARCHIVED_FIELDS, archivedFields],
        [STORAGE_KEYS.LOGS, operationLogs],
        [STORAGE_KEYS.PRICES, priceHistory],
        [STORAGE_KEYS.TICKETS, supportTickets],
        [STORAGE_KEYS.SESSION, CURRENT_SESSION]
      ];
      if (!isMember) {
        cacheEntries.push(
          [STORAGE_KEYS.USERS, users],
          [STORAGE_KEYS.AUDIT_REPORTS, auditReports],
          [STORAGE_KEYS.SYSTEM_HISTORY, systemHistory]
        );
      }
      await multiSave(cacheEntries);
      if (active) notify();
      return true;
    } catch (error) {
      if (error.status === 401) {
        stop();
        return false;
      }
      console.warn('[Mobile] Server data refresh notice:', error.message);
      return false;
    } finally {
      requestInFlight = false;
    }
  };

  activeCloudRefresh = refresh;
  stop.initialRefresh = refresh();
  refreshTimer = setInterval(refresh, 60000);
  appStateSubscription = AppState.addEventListener('change', nextState => {
    const returnedToForeground = appState !== 'active' && nextState === 'active';
    appState = nextState;
    if (returnedToForeground) refresh();
  });
  return stop;
};

let activeCloudSyncStop = null;
let activeCloudRefresh = null;

const stopActiveCloudSync = () => {
  if (typeof activeCloudSyncStop === 'function') activeCloudSyncStop();
  activeCloudSyncStop = null;
};

export const restartCloudSyncIfReady = async () => {
  stopActiveCloudSync();

  const token = await getItem(STORAGE_KEYS.AUTH_TOKEN);
  const activeRole = canonicalRole(CURRENT_SESSION?.role || CURRENT_SESSION?.roleKey);
  const sessionUserId = String(CURRENT_SESSION?.employeeId || CURRENT_SESSION?.id || '').trim();
  const accountReady = CURRENT_SESSION?.phoneVerified === true
    && CURRENT_SESSION?.requiresPasswordChange !== true
    && CURRENT_SESSION?.pendingFirstLoginVerification !== true;

  if (!token || !activeRole || !sessionUserId || !accountReady) return false;
  if (!auth?.currentUser || auth.currentUser.uid !== sessionUserId) return false;

  activeCloudSyncStop = listenToCloudSync();
  if (activeRole === ROLES.SRA_ADMIN) {
    const initialRefreshSucceeded = await activeCloudSyncStop.initialRefresh;
    if (!initialRefreshSucceeded) {
      stopActiveCloudSync();
      return false;
    }
  }
  return true;
};

let mobileSyncPromise = null;

const canonicalStageName = stageNumber => {
  const numericStage = Number(stageNumber);
  return SUGARCANE_STAGES.find(stage => stage.stageNumber === numericStage)?.name || null;
};

const reconcileSuccessfulMutations = async (queueBefore, responses = {}) => {
  let logsChanged = false;
  let fieldsChanged = false;
  let auditsChanged = false;
  let ticketsChanged = false;

  queueBefore.forEach(item => {
    const response = responses[item.mutationId];
    if (!response?.success) return;

    if (item.type === 'operation_log' || item.type === 'takeover_log') {
      const serverRecord = response.data;
      if (!serverRecord?.id) return;
      const localId = item.payload?.id;
      const existingIndex = operationLogs.findIndex(log => log.id === localId || log.id === serverRecord.id);
      const reconciled = {
        ...(existingIndex >= 0 ? operationLogs[existingIndex] : {}),
        ...fromOperationLogDocument(serverRecord.id, serverRecord),
        synced: true,
        isOffline: false,
        cloudQueueStatus: 'synced',
        syncedAt: new Date().toISOString()
      };
      if (existingIndex >= 0) operationLogs[existingIndex] = reconciled;
      else operationLogs.unshift(reconciled);
      logsChanged = true;
      console.info(`[OPERATION] Server acknowledged: ${serverRecord.id}`);
    }

    if (item.type === 'operation_amendment') {
      const serverRecord = response.data;
      if (!serverRecord?.id) return;
      const existingIndex = operationLogs.findIndex(log => log.id === serverRecord.id || log.id === item.payload?.id);
      const reconciled = {
        ...(existingIndex >= 0 ? operationLogs[existingIndex] : {}),
        ...fromOperationLogDocument(serverRecord.id, serverRecord),
        synced: true,
        isOffline: false,
        cloudQueueStatus: 'synced',
        syncedAt: new Date().toISOString()
      };
      if (existingIndex >= 0) operationLogs[existingIndex] = reconciled;
      else operationLogs.unshift(reconciled);
      logsChanged = true;
      console.info(`[OPERATION] Amendment acknowledged: ${serverRecord.id}`);
    }

    if (item.type === 'stage_update') {
      const serverCycle = response.data;
      if (!serverCycle?.id) return;
      const cycleIndex = cropCycles.findIndex(cycle => cycle.id === serverCycle.id);
      if (cycleIndex >= 0) cropCycles[cycleIndex] = { ...cropCycles[cycleIndex], ...serverCycle };
      else cropCycles.push(fromCycleDocument(serverCycle.id, serverCycle));
      const targetField = fields.find(field => field.currentCycleId === serverCycle.id);
      if (targetField) {
        targetField.stageNumber = Number(serverCycle.currentStageNumber);
        targetField.stage = canonicalStageName(serverCycle.currentStageNumber);
        targetField.month = Number(serverCycle.elapsedMonths || 0);
        targetField.synced = true;
        targetField.lastSync = 'Just now';
        fieldsChanged = true;
        console.info(`[FIELD] Stage refreshed: ${targetField.id}`);
      }
    }

    if (item.type === 'ticket' || item.type === 'ticket_message') {
      const serverRecord = response.data;
      const ticketId = serverRecord?.id || item.payload?.id;
      if (serverRecord && ticketId) {
        const canonical = fromSupportTicketDocument(ticketId, serverRecord);
        const ticketIndex = supportTickets.findIndex(ticket => ticket.id === ticketId);
        if (ticketIndex >= 0) supportTickets[ticketIndex] = canonical;
        else supportTickets.unshift(canonical);
        ticketsChanged = true;
      }
    }

    if (['audit_report', 'audit_submission', 'audit_return', 'audit_certification', 'audit_qr_import'].includes(item.type)) {
      const serverRecord = response.data?.report || response.data;
      const reportId = serverRecord?.id || serverRecord?.reportId || item.payload?.id || item.payload?.reportId;
      if (serverRecord && reportId) {
        const normalized = fromAuditReportDocument(reportId, serverRecord);
        const reportIndex = auditReports.findIndex(report => (report.reportId || report.id) === reportId);
        if (reportIndex >= 0) auditReports[reportIndex] = { ...auditReports[reportIndex], ...normalized };
        else auditReports.unshift(normalized);
        auditsChanged = true;
      }
    }
  });

  if (logsChanged) {
    const deduped = sortOperationsNewestFirst(cleanupDuplicateLogs(operationLogs));
    operationLogs.length = 0;
    operationLogs.push(...deduped);
    await saveItem(STORAGE_KEYS.LOGS, operationLogs);
  }
  if (fieldsChanged) await saveItem(STORAGE_KEYS.FIELDS, fields);
  if (auditsChanged) await saveItem(STORAGE_KEYS.AUDIT_REPORTS, auditReports);
  if (ticketsChanged) await saveItem(STORAGE_KEYS.TICKETS, supportTickets);
};

export const performMobileSync = async (trigger = 'MANUAL_SYNC') => {
  if (mobileSyncPromise) return mobileSyncPromise;

  mobileSyncPromise = (async () => {
    console.info(`[SYNC] Trigger: ${trigger}`);
    const remainingBefore = getOutboxCount();
    if (remainingBefore === 0) {
      IS_SYNCED = true;
      if (CURRENT_SESSION) CURRENT_SESSION.pendingLogs = 0;
      notify();
      if (canReportAgriculturalSyncTelemetry()) {
        reportMobileSync({
          pendingMutationCount: 0,
          failedMutationCount: 0,
          syncState: 'UNKNOWN',
          connectionState: getNetworkStatus() ? 'ONLINE' : 'OFFLINE',
          syncSucceeded: false
        }).catch(() => {});
      }
      return { success: true, attemptedCount: 0, processedCount: 0, failedCount: 0, remainingCount: 0, responses: {} };
    }
    if (!getNetworkStatus()) {
      return {
        success: false, attemptedCount: 0, processedCount: 0, failedCount: 0,
        remainingCount: remainingBefore, reason: 'OFFLINE',
        remainingItems: getOutboxQueue().map(item => ({
          mutationId: item.mutationId, entityKey: item.entityKey, type: item.type,
          status: item.status, retryCount: Number(item.retryCount || 0),
          lastError: item.lastError || null, dependsOnMutationId: item.dependsOnMutationId || null
        }))
      };
    }
    if (!CURRENT_SESSION?.employeeId || !auth?.currentUser) {
      return {
        success: false, attemptedCount: 0, processedCount: 0, failedCount: 0,
        remainingCount: remainingBefore, reason: 'AUTHENTICATION_REQUIRED',
        remainingItems: getOutboxQueue()
      };
    }

    try {
      const refreshed = await refreshMobileSessionFromFirebase();
      if (refreshed?.user) {
        CURRENT_SESSION = { ...normalizeSessionUser(refreshed.user), lastActiveAt: Date.now() };
        await saveItem(STORAGE_KEYS.SESSION, CURRENT_SESSION);
      }
    } catch (error) {
      console.info(`[SYNC] Failed: AUTHENTICATION ${error?.message || 'Session refresh failed'}`);
      return {
        success: false,
        attemptedCount: 0,
        processedCount: 0,
        failedCount: remainingBefore,
        remainingCount: remainingBefore,
        reason: error?.status === 403 ? 'AUTHORIZATION_FAILURE' : 'AUTHENTICATION_RECOVERY',
        remainingItems: getOutboxQueue()
      };
    }

    const queueBefore = getOutboxQueue();
    const result = await flushOutboxToApi();
    await reconcileSuccessfulMutations(queueBefore, result.responses);
    IS_SYNCED = getOutboxCount() === 0;
    if (CURRENT_SESSION) CURRENT_SESSION.pendingLogs = getPendingSyncCount(CURRENT_SESSION);
    notify();
    const normalizedResult = {
      attemptedCount: Number(result.attemptedCount || 0),
      processedCount: Number(result.processedCount || 0),
      failedCount: Number(result.failedCount || 0),
      remainingCount: getOutboxCount(),
      ...result,
      success: result.success === true && getOutboxCount() === 0
    };
    const failedRemainingCount = getOutboxQueue()
      .filter(item => item.status && !['queued', 'syncing'].includes(item.status))
      .length;
    const reportedFailedCount = Math.max(normalizedResult.failedCount, failedRemainingCount);
    if (canReportAgriculturalSyncTelemetry()) {
      reportMobileSync({
        pendingMutationCount: normalizedResult.remainingCount,
        failedMutationCount: reportedFailedCount,
        syncState: reportedFailedCount > 0
          ? 'SYNC_FAILED'
          : normalizedResult.remainingCount > 0 ? 'PENDING_SYNC' : 'UP_TO_DATE',
        connectionState: 'ONLINE',
        syncSucceeded: normalizedResult.success && normalizedResult.processedCount > 0
      }).catch(() => {});
    }
    return normalizedResult;
  })();

  try {
    return await mobileSyncPromise;
  } finally {
    mobileSyncPromise = null;
  }
};

export const fetchAuditHistoryPage = async ({ cursor = null, limit = 20 } = {}) => {
  const query = new URLSearchParams({ view: 'history', limit: String(limit) });
  if (cursor) query.set('cursor', cursor);
  const response = await authenticatedRequest(`/api/audit-reports?${query.toString()}`);
  return {
    reports: responseRecords(response).map(record => fromAuditReportDocument(record.id, record)),
    hasMore: Boolean(response.hasMore),
    nextCursor: response.nextCursor || null
  };
};

// Register automatic sync on network reconnection
setOnReconnectCallback(async trigger => {
  const result = await performMobileSync(trigger || 'NETWORK_RESTORED');
  if (typeof activeCloudRefresh === 'function') await activeCloudRefresh();
  return result;
});

export const initializeOfflineStorage = async () => {
  try {
    await ensureCurrentCacheSchema();
    const stored = await hydrateAllStorage();
    if (stored[STORAGE_KEYS.AUTH_TOKEN] && stored[STORAGE_KEYS.SESSION]) {
      CURRENT_SESSION = normalizeSessionUser(stored[STORAGE_KEYS.SESSION]);
    } else if (stored[STORAGE_KEYS.SESSION]) {
      CURRENT_SESSION = normalizeSessionUser(stored[STORAGE_KEYS.SESSION]);
    } else {
      CURRENT_SESSION = { ...DEFAULT_GUEST_SESSION };
    }
    await initSyncEngine(CURRENT_SESSION.employeeId || CURRENT_SESSION.id);
    if (Array.isArray(stored[STORAGE_KEYS.BLOCK_FARMS]) && stored[STORAGE_KEYS.BLOCK_FARMS].length > 0) {
      blockFarms.length = 0;
      stored[STORAGE_KEYS.BLOCK_FARMS].forEach(farm => blockFarms.push(farm));
    }
    if (Array.isArray(stored[STORAGE_KEYS.CROP_CYCLES]) && stored[STORAGE_KEYS.CROP_CYCLES].length > 0) {
      cropCycles.length = 0;
      stored[STORAGE_KEYS.CROP_CYCLES].forEach(cycle => cropCycles.push(cycle));
    }
    if (Array.isArray(stored[STORAGE_KEYS.USERS]) && stored[STORAGE_KEYS.USERS].length > 0) {
      users.length = 0;
      stored[STORAGE_KEYS.USERS].forEach(u => users.push(normalizeSessionUser(u)));
    }
    if (Array.isArray(stored[STORAGE_KEYS.LOGS]) && stored[STORAGE_KEYS.LOGS].length > 0) {
      operationLogs.length = 0;
      const normalized = sortOperationsNewestFirst(cleanupDuplicateLogs(stored[STORAGE_KEYS.LOGS])
        .filter(l => l && l.cycleId && (l.status === 'ACTIVE' || l.status === 'ARCHIVED'))
        .map(l => {
        const effCost = Number(l.totalCost != null ? l.totalCost : (l.cost || 0));
        const displayDate = formatDisplayDate(l.date || l.period);
        return {
          ...l,
          synced: l.synced !== undefined ? l.synced : true,
          isOffline: l.isOffline === true,
          cloudQueueStatus: l.cloudQueueStatus || (l.isOffline ? 'offline_queued' : 'synced'),
          cost: effCost,
          totalCost: effCost,
          date: displayDate,
          period: displayDate,
          isoDate: toISODateString(displayDate)
        };
      }));
      normalized.forEach(l => operationLogs.push(l));
    }
    draftLogs.length = 0;
    const draftKey = currentDraftKey();
    const scopedDrafts = draftKey ? await getItem(draftKey, []) : [];
    if (Array.isArray(scopedDrafts)) scopedDrafts.forEach(d => draftLogs.push(d));
    // Preserve legacy drafts in their original key. Only safe, attributable
    // drafts are copied into the current account scope; invalid drafts remain
    // untouched for inspection and never become submittable.
    if (Array.isArray(stored[STORAGE_KEYS.DRAFTS]) && currentActorId()) {
      const safeLegacy = stored[STORAGE_KEYS.DRAFTS].filter(draft => {
        const field = fields.find(item => String(item.id || '').trim().toUpperCase() === String(draft?.fieldId || '').trim().toUpperCase());
        const creator = String(draft?.createdByUserId || draft?.submittedByUserId || draft?.loggedById || '').trim();
        return creator === currentActorId() && String(field?.memberUserId || '').trim() === currentActorId();
      });
      safeLegacy.forEach(draft => {
        if (!draftLogs.some(existing => existing.id === draft.id)) draftLogs.push({
          ...draft,
          createdByUserId: currentActorId(),
          status: 'DRAFT',
          localOnly: true,
          submittedOperationId: draft.submittedOperationId || `OP-${String(draft.fieldId || '').trim().toUpperCase()}-${Date.now().toString(36).toUpperCase()}`
        });
      });
      if (safeLegacy.length) await persistCurrentUserDrafts();
    }
    if (Array.isArray(stored[STORAGE_KEYS.ARCHIVED_FIELDS]) && stored[STORAGE_KEYS.ARCHIVED_FIELDS].length > 0) {
      archivedFields.length = 0;
      stored[STORAGE_KEYS.ARCHIVED_FIELDS].forEach(af => archivedFields.push(af));
    }
    if (Array.isArray(stored[STORAGE_KEYS.FIELDS]) && stored[STORAGE_KEYS.FIELDS].length > 0) {
      const cleanFields = mergeActiveFields(stored[STORAGE_KEYS.FIELDS], archivedFields);
      fields.length = 0;
      cleanFields.forEach(f => fields.push(f));
    }
    if (Array.isArray(stored[STORAGE_KEYS.DRAFTS]) && currentActorId()) {
      const safeLegacyAfterFieldHydration = stored[STORAGE_KEYS.DRAFTS].filter(draft => {
        const field = fields.find(item => String(item.id || '').trim().toUpperCase() === String(draft?.fieldId || '').trim().toUpperCase());
        const creator = String(draft?.createdByUserId || draft?.submittedByUserId || draft?.loggedById || '').trim();
        return creator === currentActorId() && String(field?.memberUserId || '').trim() === currentActorId();
      });
      safeLegacyAfterFieldHydration.forEach(draft => {
        if (!draftLogs.some(existing => existing.id === draft.id)) draftLogs.push({
          ...draft,
          createdByUserId: currentActorId(),
          status: 'DRAFT',
          localOnly: true,
          submittedOperationId: draft.submittedOperationId || `OP-${String(draft.fieldId || '').trim().toUpperCase()}-${Date.now().toString(36).toUpperCase()}`
        });
      });
      if (safeLegacyAfterFieldHydration.length) await persistCurrentUserDrafts();
    }
    if (Array.isArray(stored[STORAGE_KEYS.TICKETS]) && stored[STORAGE_KEYS.TICKETS].length > 0) {
      supportTickets.length = 0;
      supportTickets.push(...sortNewestFirst(stored[STORAGE_KEYS.TICKETS], ['createdAt']));
    }
    if (stored[STORAGE_KEYS.PREFS]) SECURITY_PREFERENCES = stored[STORAGE_KEYS.PREFS];

    // Hydrate cached price circulars
    if (Array.isArray(stored[STORAGE_KEYS.PRICES]) && stored[STORAGE_KEYS.PRICES].length > 0) {
      priceHistory.length = 0;
      stored[STORAGE_KEYS.PRICES].forEach(p => {
        try {
          priceHistory.push(fromPriceDocument(p.id, p));
        } catch (error) {
          console.warn('[Mobile] Ignoring non-canonical cached sra_prices record:', p?.id || '(missing id)', error.message);
        }
      });
    }

    // Hydrate cached pending member registrations
    if (Array.isArray(stored[STORAGE_KEYS.PENDING_USERS]) && stored[STORAGE_KEYS.PENDING_USERS].length > 0) {
      pendingUsers.length = 0;
      stored[STORAGE_KEYS.PENDING_USERS].forEach(u => pendingUsers.push(u));
    }

    // Hydrate cached audit reports
    if (Array.isArray(stored[STORAGE_KEYS.AUDIT_REPORTS]) && stored[STORAGE_KEYS.AUDIT_REPORTS].length > 0) {
      auditReports.length = 0;
      auditReports.push(...sortNewestFirst(
        stored[STORAGE_KEYS.AUDIT_REPORTS]
          .filter(Boolean)
          .map(report => fromAuditReportDocument(report.id || report.reportId, report))
          .filter(report => ['PENDING_REVIEW', 'COMPILED', 'PENDING_SUBMISSION', 'RETURNED', 'CERTIFIED'].includes(report.status)),
        ['compiledAt', 'createdAt']
      ));
    }

    // Hydrate cached system history
    if (Array.isArray(stored[STORAGE_KEYS.SYSTEM_HISTORY]) && stored[STORAGE_KEYS.SYSTEM_HISTORY].length > 0) {
      systemHistory.length = 0;
      systemHistory.push(...sortNewestFirst(stored[STORAGE_KEYS.SYSTEM_HISTORY], ['createdAt', 'rawTimestamp', 'timestamp']));
    }

    // SRA is online-only. Never render device-cached district records while a
    // live, authorization-scoped server snapshot is still pending.
    if (canonicalRole(CURRENT_SESSION?.canonicalRole || CURRENT_SESSION?.role || CURRENT_SESSION?.roleKey) === ROLES.SRA_ADMIN) {
      clearCanonicalRuntimeData();
    }
    
    const pendingCount = getPendingSyncCount(CURRENT_SESSION);
    if (pendingCount > 0) {
      IS_SYNCED = false;
      if (CURRENT_SESSION) CURRENT_SESSION.pendingLogs = pendingCount;
    } else {
      IS_SYNCED = true;
      if (CURRENT_SESSION) CURRENT_SESSION.pendingLogs = 0;
    }

    notify();

    try {
      if (auth) {
        onAuthStateChanged(auth, firebaseUser => {
          const sessionUserId = String(CURRENT_SESSION?.employeeId || CURRENT_SESSION?.id || '').trim();
          if (!firebaseUser || !sessionUserId || firebaseUser.uid !== sessionUserId) {
            stopActiveCloudSync();
          }
        });
      }
      // Publish background device telemetry
      if (CURRENT_SESSION && CURRENT_SESSION.name && canReportAgriculturalSyncTelemetry()) {
        publishTerminalTelemetry(CURRENT_SESSION, pendingCount).catch(() => {});
      }
      // If internet is connected, auto-sync immediately on launch
      checkConnectivity().then(online => {
        if (online) {
          restoreSessionFromToken()
            .then(result => { if (result.success) return performMobileSync('APP_START'); })
            .catch(() => {});
        }
      });
    } catch (cloudErr) {
      console.warn('[dataStore] Cloud sync listener deferred:', cloudErr);
    }
  } catch (error) {
    console.warn('[dataStore] Startup hydration notice:', error);
  }
};

// Auto-invoke hydration on bundle load
initializeOfflineStorage();
