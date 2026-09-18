import { STORAGE_KEYS, saveItem, getItem, clearHugpongStorage, hydrateAllStorage, multiSave, ensureCurrentCacheSchema } from '../services/storageService';
import { initSyncEngine, enqueueAndFlushMutation, getOutboxCount, getOutboxQueue, clearOutbox, flushOutboxToApi, generateTicketId } from '../services/syncEngine';
import { publishTerminalTelemetry } from '../services/telemetryService';
import { db, auth } from '../firebase/config';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { getNetworkStatus, subscribeToNetwork, setOnReconnectCallback, checkConnectivity } from '../services/networkService';
import {
  loginWithServer,
  refreshServerSession,
  verifyPasswordWithServer,
  changePasswordWithServer,
  changePhoneWithServer,
  registerWithServer,
  requestPhoneVerificationWithServer,
  verifyPhoneWithServer,
  logoutFromServer
} from '../services/authService';
import {
  COLLECTIONS,
  ROLES,
  canonicalRole,
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

const commitExplicitMutation = async (type, payload, options = {}) => {
  const outcome = await enqueueAndFlushMutation(type, payload, options);
  const retainedStatus = outcome.queued ? outcome.item?.status : null;
  if (retainedStatus === 'conflict' || retainedStatus === 'rejected') {
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

// ══════════════════════════════════════════════════════════════
// HUGPONG — Canonical Database Entities & Offline Working Store
// Single Canonical Source of Truth: Cloud Firestore / Server DB
// ══════════════════════════════════════════════════════════════

// ── CANONICAL DATE & DEDUPLICATION UTILITIES ────────────────
export function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const str = String(dateStr).trim();
  if (/^[A-Za-z]+ \d{1,2}, \d{4}$/.test(str)) {
    return str;
  }
  const m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const y = parseInt(m[1], 10);
    const monthIdx = parseInt(m[2], 10) - 1;
    const d = parseInt(m[3], 10);
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    if (monthIdx >= 0 && monthIdx < 12) {
      return `${months[monthIdx]} ${d}, ${y}`;
    }
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }
  return str;
}

export function toISODateString(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  const str = String(dateStr).trim();
  const m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const y = m[1];
    const month = m[2].padStart(2, '0');
    const day = m[3].padStart(2, '0');
    return `${y}-${month}-${day}`;
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return new Date().toISOString().split('T')[0];
}

export function cleanupDuplicateLogs(logs) {
  if (!Array.isArray(logs)) return [];
  const byId = new Map();
  for (const l of logs) {
    if (!l) continue;
    const logId = l.id || `LOG-${l.fieldId}-${l.stageNumber || 1}-${l.activity || 'op'}-${l.date || Date.now()}`;
    if (!byId.has(logId)) {
      byId.set(logId, l);
    } else {
      const existing = byId.get(logId);
      const timeExisting = new Date(existing.updatedAt || existing.createdAt || existing.date || 0).getTime();
      const timeCurrent = new Date(l.updatedAt || l.createdAt || l.date || 0).getTime();
      if (timeCurrent >= timeExisting) {
        byId.set(logId, l);
      }
    }
  }
  return Array.from(byId.values());
}

export const cleanDataForFirestore = (obj) => {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(cleanDataForFirestore);
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      clean[k] = cleanDataForFirestore(v);
    }
  }
  return clean;
};

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
        req.error = 'Assignment requires an existing field and Member Farmer.';
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

export const approvePendingRegistration = async (contact, options = {}) => {
  const cleanContact = String(contact || '').replace(/\D/g, '');
  const idx = pendingUsers.findIndex(u => (u.contact || '').replace(/\D/g, '') === cleanContact);
  if (idx === -1) return { success: false, message: 'Applicant not found in pending list.' };

  const applicant = pendingUsers[idx];
  const assignedFarm = blockFarms.find(farm => farm.id === options.blockFarmId || farm.name === applicant.blockFarm);
  if (!assignedFarm) return { success: false, message: 'Select an existing block farm before approving this registration.' };

  // Determine plot ID & Hectares
  const assignedPlotId = options.fieldId || applicant.fieldId || generateNextFieldId(assignedFarm.name, fields, blockFarms);
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
      role: applicant.role || 'Member Farmer',
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
  const existingField = fields.find(f => f.id === assignedPlotId);
  const fieldResult = await saveFieldPlot({
    ...(existingField || {}),
    id: assignedPlotId,
    blockFarmId: assignedFarm.id,
    memberUserId: empId,
    ha: assignedHa,
    status: existingField?.status || 'ACTIVE'
  }, !existingField);
  if (!fieldResult.success) {
    if (createdUser) users.splice(users.indexOf(createdUser), 1);
    if (existingUser && existingUserSnapshot) Object.assign(existingUser, existingUserSnapshot);
    return fieldResult;
  }

  try {
    const approvalOutcome = await commitExplicitMutation('user_approve', {
      id: empId,
      role: 'MEMBER_FARMER'
    }, { baseVersion: existingUserSnapshot?.updatedAt || applicant.updatedAt || null });
    const approved = approvalOutcome.response;
    const activeUser = users.find(user => user.employeeId === empId);
    if (activeUser && approved.data) Object.assign(activeUser, fromUserDocument(empId, approved.data));
  } catch (error) {
    return { success: false, message: error.message || 'Server approval failed.' };
  }

  pendingUsers.splice(idx, 1);
  await saveItem(STORAGE_KEYS.PENDING_USERS, pendingUsers);
  await saveItem(STORAGE_KEYS.USERS, users);

  notifyDataUpdate();
  return { success: true, applicant, fieldId: assignedPlotId };
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
 * Unified Field ID Code Resolution and Auto-Generation (Synchronous Parity with Web)
 */
export const extractFarmCodeFromName = (name) => {
  if (!name) return '';
  const clean = String(name).replace(/\b(block|farm|cooperative|coop|cluster|group|association)\b/gi, '').trim();
  const words = clean.split(/[\s-_]+/).filter(Boolean);
  if (words.length >= 2) {
    return words.map(w => w[0]).join('').toUpperCase().slice(0, 4);
  } else if (words.length === 1) {
    const word = words[0].toUpperCase();
    if (word.length <= 4) return word;
    if (word === 'NACAYAO') return 'NCY';
    const vowelsRemoved = word.charAt(0) + word.slice(1).replace(/[AEIOU]/gi, '');
    if (vowelsRemoved.length >= 3) return vowelsRemoved.slice(0, 3);
    return word.slice(0, 3);
  }
  return String(name).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3) || 'FLD';
};

export const getFarmCode = (blockFarmInput, blockFarmsList = blockFarms) => {
  const bfList = blockFarmsList || blockFarms || [];
  if (!blockFarmInput) {
    const defaultBf = Array.isArray(bfList) ? bfList[0] : null;
    if (defaultBf) return getFarmCode(defaultBf, bfList);
    return '';
  }
  let bf = (typeof blockFarmInput === 'object' && blockFarmInput !== null) ? blockFarmInput : null;
  if (!bf && Array.isArray(bfList)) {
    bf = bfList.find(b => b.name === blockFarmInput || b.id === blockFarmInput || b.code === blockFarmInput) || null;
  }
  
  if (bf) {
    if (bf.code) {
      let c = String(bf.code).replace(/^BLK[-_]?/i, '').replace(/[-_]\d+$/, '').trim().toUpperCase();
      if (c && !/^\d+$/.test(c)) return c;
    }
    if (bf.id) {
      let c = String(bf.id).replace(/^BLK[-_]?/i, '').replace(/[-_]\d+$/, '').trim().toUpperCase();
      if (c && !/^\d+$/.test(c)) return c;
    }
    if (bf.name) {
      return extractFarmCodeFromName(bf.name);
    }
    if (bf.code) {
      let c = String(bf.code).replace(/^BLK[-_]?/i, '').trim().toUpperCase();
      if (c) return c;
    }
  }

  if (typeof blockFarmInput === 'string' && blockFarmInput.trim()) {
    return extractFarmCodeFromName(blockFarmInput);
  }
  return '';
};

export const generateNextFieldId = (blockFarmInput, existingFields = fields, blockFarmsList = blockFarms) => {
  const fList = existingFields || fields || [];
  const bfList = blockFarmsList || blockFarms || [];

  const farmCode = getFarmCode(blockFarmInput, bfList);
  const prefix = farmCode ? `FLD-${farmCode}` : 'FLD';

  const matchingFields = (fList || []).filter(f => {
    if (!f || !f.id) return false;
    const fId = String(f.id).toUpperCase();
    if (fId.startsWith(prefix + '-')) return true;
    if (farmCode && (f.blockFarm === blockFarmInput || f.blockFarmId === blockFarmInput)) return true;
    return false;
  });

  const existingNums = matchingFields
    .map(f => {
      const m = String(f.id || '').match(/(\d+)$/);
      return m ? parseInt(m[1], 10) : null;
    })
    .filter(n => n !== null && !isNaN(n));

  let nextNum = 1;
  if (existingNums.length > 0) {
    nextNum = Math.max(...existingNums) + 1;
  }

  return `${prefix}-${String(nextNum).padStart(3, '0')}`;
};

/**
 * Comprehensive Validation for Field Plots (Add & Edit)
 */
export const validateFieldPlotData = (fieldData, isNew = false) => {
  if (!fieldData || typeof fieldData !== 'object') {
    return { valid: false, error: 'INVALID_DATA', message: 'Field data is required.' };
  }

  // 1. Field ID Validation
  const fieldId = String(fieldData.id || '').trim().toUpperCase();
  if (!fieldId) {
    return { valid: false, error: 'REQUIRED_FIELD_ID', message: 'Field ID is required.' };
  }
  if (!/^[A-Za-z0-9_-]{3,25}$/.test(fieldId)) {
    return { valid: false, error: 'INVALID_FIELD_ID_FORMAT', message: 'Field ID must be 3-25 alphanumeric characters (e.g., FLD-001).' };
  }

  const existingIdx = fields.findIndex(f => f.id.toUpperCase() === fieldId);
  if (isNew && existingIdx >= 0) {
    return { valid: false, error: 'FIELD_EXISTS', message: `Field ID "${fieldId}" already exists. Please use a unique Field ID.` };
  }
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
        message: `Member ID or Contact "${rawMemberId}" is not registered in the system. Please enter an existing Member ID (e.g., 04000001) or registered mobile number.` 
      };
    }
    if (canonicalRole(matchedUser.role) !== 'MEMBER_FARMER') {
      return { valid: false, error: 'INVALID_MEMBER_ROLE', message: 'The assigned user must have the Member Farmer role.' };
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
  const existingIdx = fields.findIndex(f => f.id.toUpperCase() === targetId);
  const nowIso = new Date().toISOString();
  
  const currentF = existingIdx >= 0 ? fields[existingIdx] : {};
  const resolvedBlockFarmId = String(fieldData.blockFarmId || currentF.blockFarmId || '').trim().toUpperCase();
  if (!resolvedBlockFarmId || !blockFarms.some(farm => farm.id === resolvedBlockFarmId)) {
    return { success: false, error: 'BLOCK_FARM_NOT_FOUND', message: 'Select an existing block farm before saving the field.' };
  }
  const resolvedCurrentCycleId = String(fieldData.currentCycleId || currentF.currentCycleId || (isNew ? createCycleId(targetId, 1) : '')).trim().toUpperCase();
  if (!resolvedCurrentCycleId) {
    return { success: false, error: 'CURRENT_CYCLE_REQUIRED', message: 'The field must reference an existing current crop cycle.' };
  }

  // Resolve verified user if assigned
  const rawMemberId = fieldData.memberUserId || fieldData.memberId || fieldData.userId || fieldData.memberContact || fieldData.member || fieldData.memberName;
  const isUnassigned = !rawMemberId || String(rawMemberId).trim().toLowerCase() === 'unassigned';
  const matchedUser = !isUnassigned ? findUserByIdOrContact(rawMemberId) : null;

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
    cropYear: fieldData.cropYear || currentF.cropYear || '',
    month: fieldData.month !== undefined ? fieldData.month : (currentF.month !== undefined ? currentF.month : 0),
    batchMonth: fieldData.batchMonth || currentF.batchMonth || 1,
    synced: fieldData.synced !== undefined ? fieldData.synced : true,
    lastSync: fieldData.lastSync || currentF.lastSync || 'Just now',
    variety: fieldData.variety || currentF.variety || '',
    soilType: fieldData.soilType || currentF.soilType || '',
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
    isNew,
    ...(isNew ? {
      cropType: formattedField.cycleType,
      cropYear: formattedField.cropYear,
      currentStageNumber: formattedField.stageNumber,
      elapsedMonths: formattedField.month,
      batchNumber: formattedField.batchMonth
    } : {})
  };
  try {
    const outcome = await commitExplicitMutation('field_upsert', fieldMutationPayload, {
      baseVersion: isNew ? null : (currentF.updatedAt || null)
    });
    if (outcome.response?.data?.cycle) {
      cropCycles.push(fromCycleDocument(outcome.response.data.cycle.id, outcome.response.data.cycle));
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
  return u ? u.name : 'Unassigned';
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

// ── Deterministic Price Parsing & Sorting Helper ─────────────
function parsePriceTime(p) {
  if (p.publishedAt) {
    const t = new Date(p.publishedAt).getTime();
    if (!isNaN(t)) return t;
  }
  if (p.effectiveDate) {
    const t = new Date(`${p.effectiveDate}T00:00:00Z`).getTime();
    if (!isNaN(t)) return t;
  }
  return 0;
}

export const getSortedPrices = () => {
  return [...priceHistory].sort((a, b) => parsePriceTime(b) - parsePriceTime(a));
};

// ── Dynamic Current Price & Market Observation ──────────────
export const currentPrice = {
  get value() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? sorted[0].sugarPricePerLkg : 0;
  },
  get change() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? sorted[0].sugarPriceChange : 0;
  },
  get unit() { return 'Lkg'; },
  get mill() { return 'HPCo'; },
  get location() { return 'Silay'; },
  get lastUpdated() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? sorted[0].effectiveDate : 'No records';
  },
  get week() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? sorted[0].weekLabel : 'No records';
  }
};

export const currentMarketObservation = {
  get value() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? sorted[0].molassesPricePerMetricTon : 0;
  },
  get change() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? sorted[0].molassesPriceChange : 0;
  },
  get unit() { return 'MT'; },
  get lastUpdated() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? sorted[0].effectiveDate : 'No records';
  },
  get week() {
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
      return [[0], [0], [0], [0]];
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
    if (sorted.length === 0) return 0;
    const sum = sorted.reduce((acc, p) => acc + p.sugarPricePerLkg, 0);
    return Math.round(sum / sorted.length);
  },
  get cropYearPeak() {
    const sorted = getSortedPrices();
    if (sorted.length === 0) return 0;
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

export const verifyCurrentPassword = async (password) => {
  try {
    await verifyPasswordWithServer(password);
    return true;
  } catch (error) {
    return false;
  }
};

export const restoreSessionFromToken = async () => {
  try {
    const token = await getItem(STORAGE_KEYS.AUTH_TOKEN);
    const session = await getItem(STORAGE_KEYS.SESSION);
    if (!token || !session) return { success: false, reason: 'no_stored_session' };
    if (auth?.authStateReady) await auth.authStateReady();
    if (!auth?.currentUser || auth.currentUser.uid !== session.employeeId) {
      return { success: false, reason: 'firebase_session_missing' };
    }
    // Offline restoration trusts only a session previously issued after a
    // successful server login. Online validation refreshes both server and
    // Firebase credentials without exposing password material to the client.
    CURRENT_SESSION = { ...session, lastActiveAt: Date.now() };
    await saveItem(STORAGE_KEYS.SESSION, CURRENT_SESSION);
    notify();
    if (getNetworkStatus()) {
      try {
        const refreshed = await refreshServerSession(token);
        CURRENT_SESSION = { ...refreshed.user, lastActiveAt: Date.now() };
        await saveItem(STORAGE_KEYS.SESSION, CURRENT_SESSION);
      } catch (error) {
        if (error.status === 401) {
          CURRENT_SESSION = { ...DEFAULT_GUEST_SESSION };
          await clearAuthSessionStorage();
          return { success: false, reason: 'server_session_rejected' };
        }
      }
    }
    if (CURRENT_SESSION.pendingFirstLoginVerification === true
      || CURRENT_SESSION.phoneVerified === false
      || CURRENT_SESSION.requiresPasswordChange === true) {
      return { success: false, reason: 'account_setup_required' };
    }
    notify();
    return { success: true, user: CURRENT_SESSION, token: await getItem(STORAGE_KEYS.AUTH_TOKEN) };
  } catch (err) {
    console.warn('[dataStore] Error restoring session:', err);
    return { success: false, error: err.message };
  }
};

export const logoutUser = async () => {
  await logoutFromServer();
  CURRENT_SESSION = { ...DEFAULT_GUEST_SESSION };
  await clearAuthSessionStorage();
  notify();
  return { success: true };
};

// ── User Directory & Authentication ──────────────────────────
export const authenticateUser = async (contactOrId, password) => {
  try {
    const result = await loginWithServer(contactOrId, password);
    if (result.user?.role === 'Super Admin') {
      await logoutFromServer();
      return { success: false, error: 'Super Admin access is restricted to the Web Management Console.' };
    }
    CURRENT_SESSION = { ...result.user, lastActiveAt: Date.now() };
    await saveItem(STORAGE_KEYS.SESSION, CURRENT_SESSION);
    notify();
    return { ...result, requiresPasswordChange: result.user?.requiresPasswordChange === true };
  } catch (error) {
    return { success: false, error: error.message || 'Authentication service is unavailable.' };
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
  role: 'Member Farmer',
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

/**
 * Returns accurate count of pending unsynced logs & outbox entries
 * Counts only submitted ACTIVE records that have not reached Firestore.
 */
export const getPendingSyncCount = (userSession = CURRENT_SESSION) => {
  const outboxCount = typeof getOutboxCount === 'function' ? getOutboxCount() : 0;
  const userRole = userSession?.role || 'Member Farmer';

  if (userRole === 'SRA Admin') return 0;

  const activeUnsyncedLogs = operationLogs.filter(l => {
    if (!l) return false;
    if (l.status !== 'ACTIVE' || l.isDraft === true) return false;

    // Check if log is flagged offline or unsynced or queued
    return l.isOffline === true || l.synced === false || l.cloudQueueStatus === 'offline_queued';
  });

  return activeUnsyncedLogs.length + outboxCount;
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
        [STORAGE_KEYS.LOGS, operationLogs],
        [STORAGE_KEYS.DRAFTS, draftLogs],
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
  if (CURRENT_SESSION && CURRENT_SESSION.role === 'Member Farmer') {
    CURRENT_SESSION.fieldId = fieldId;
    notify();
  }
};

export const updateFieldStageAndCycle = async (fieldId, updates) => {
  if (!fieldId) return { success: false, message: 'Field ID is required.' };
  const targetField = fields.find(f => f.id === fieldId);
  if (!targetField?.currentCycleId) return { success: false, message: 'Field has no explicit currentCycleId.' };
  const previousField = { ...targetField };
  const localCycle = cropCycles.find(c => c.id === targetField.currentCycleId);
  const baseVersion = localCycle?.updatedAt || null;
  Object.assign(targetField, updates);
  await saveItem(STORAGE_KEYS.FIELDS, fields);
  notify();

  try {
    const cycleUpdate = {
      currentStageNumber: Number(updates.stageNumber || targetField.stageNumber || 1),
      elapsedMonths: Number(updates.month ?? targetField.month ?? 0)
    };
    const outcome = await commitExplicitMutation('stage_update', {
      cycleId: targetField.currentCycleId,
      ...cycleUpdate
    }, { baseVersion });
    if (localCycle && outcome.response?.data) Object.assign(localCycle, outcome.response.data);
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
  const nowIso = new Date().toISOString();
  
  const targetField = fields.find(f => String(f.id || '').trim().toUpperCase() === cleanId);
  if (!targetField?.currentCycleId) return { success: false, message: 'Field has no explicit current crop cycle' };
  const oldCycleId = targetField.currentCycleId;
  const oldCycle = cropCycles.find(c => c.id === oldCycleId);
  const nextSequence = Number(oldCycle?.sequenceNumber || targetField.cycleNumber || 1) + 1;
  const newCycleId = createCycleId(cleanId, nextSequence);
  const actorUserId = getCurrentSession()?.employeeId || getCurrentSession()?.id || '';
  const finalCycleType = options.cycleType || targetField.cycleType || 'Plant Cane (New Plant)';
  const finalCropYear = formatCropYear(options.cropYear || targetField.cropYear || '2026-2027');
  const request = {
    previousCycleId: oldCycleId,
    cropType: finalCycleType,
    cropYear: finalCropYear,
    batchNumber: targetField.batchMonth || 1
  };
  let result;
  let queuedOffline = false;
  try {
    const outcome = await commitExplicitMutation('cycle_rollover', { fieldId: cleanId, ...request }, {
      baseVersion: targetField.updatedAt || null
    });
    queuedOffline = outcome.queued;
    result = outcome.response?.data;
    if (!queuedOffline && !result) throw new Error('Crop-cycle rollover returned no server response.');
  } catch (err) {
    return { success: false, message: err.message || 'Crop-cycle rollover was rejected by the server.' };
  }
  if (queuedOffline) {
    const offlineLogIds = operationLogs
      .filter(log => log.cycleId === oldCycleId && log.status === 'ACTIVE')
      .map(log => log.id);
    result = {
      oldCycleId,
      newCycleId,
      archivedLogCount: offlineLogIds.length,
      archivedOperationLogIds: offlineLogIds,
      oldCycle: { ...oldCycle, status: 'ARCHIVED', archivedAt: nowIso, archivedByUserId: actorUserId, updatedAt: nowIso },
      newCycle: {
        fieldId: cleanId,
        sequenceNumber: nextSequence,
        cropType: finalCycleType,
        cropYear: finalCropYear,
        currentStageNumber: 1,
        elapsedMonths: 0,
        batchNumber: request.batchNumber,
        status: 'ACTIVE',
        startedAt: nowIso,
        updatedAt: nowIso,
        archivedAt: null,
        archivedByUserId: null
      }
    };
  }
  if (!result?.newCycleId || !result.newCycle) {
    return { success: false, message: 'Crop-cycle rollover returned an incomplete response.' };
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
    targetField.lastSync = queuedOffline ? targetField.lastSync : 'Just now';
    targetField.synced = !queuedOffline;
    await saveItem(STORAGE_KEYS.FIELDS, fields);
  }

  if (oldCycle && result.oldCycle) Object.assign(oldCycle, result.oldCycle);
  const existingNewCycle = cropCycles.find(cycle => cycle.id === result.newCycleId);
  if (existingNewCycle) Object.assign(existingNewCycle, fromCycleDocument(result.newCycleId, result.newCycle));
  else cropCycles.push(fromCycleDocument(result.newCycleId, result.newCycle));

  await saveItem(STORAGE_KEYS.LOGS, operationLogs);
  await saveItem(STORAGE_KEYS.DRAFTS, draftLogs);
  notify();

  // Record audit history event shared with Web & Cloud
  const session = getCurrentSession();
  const actorName = session?.name ? `${session.name} (${session.role || 'Farm Manager'})` : 'Farm Manager';
  await logSystemEvent(
    'operation',
    'Crop Cycle Renewal',
    fieldId,
    `Archived ${targetLogs.length} current log(s) and reset ${fieldId} to Stage 1: "${options?.stage || 'Pre-Planting & Land Preparation'}" (${formatCropYear(options?.cropYear || targetField?.cropYear || '2026-2027')}).`,
    actorName,
    'Completed'
  );
  return { success: true, archivedCount: result.archivedLogCount, cycleId: result.newCycleId, queuedOffline };
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
  await saveItem(STORAGE_KEYS.DRAFTS, draftLogs);
  notify();
};

export const clearAllDraftsForField = async (fieldId) => {
  if (!fieldId) return;
  const remaining = draftLogs.filter(d => d.fieldId !== fieldId);
  draftLogs.length = 0;
  remaining.forEach(d => draftLogs.push(d));
  await saveItem(STORAGE_KEYS.DRAFTS, draftLogs);
  notify();
};

export const saveDraftLogs = async () => {
  await saveItem(STORAGE_KEYS.DRAFTS, draftLogs);
  notify();
};

export const isLogLocked = (log) => {
  return Boolean(log && log.status === 'ARCHIVED');
};

export const getLogAuditTrail = (logId) => {
  const target = operationLogs.find(l => l.id === logId);
  return target && Array.isArray(target.amendments) ? target.amendments : [];
};

export const updateOperationLogWithSecurity = async (logId, updates, editReason, passwordVerification) => {
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

  try {
    await verifyPasswordWithServer(passwordVerification);
  } catch (error) {
    return { success: false, error: 'Incorrect password. Please enter your account password to authorize modifying this log.' };
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
  const hasCostChanged = Math.round(Number(previousValues.cost || 0)) !== Math.round(Number(newValues.cost || 0));
  const hasHaChanged = Math.abs(parseFloat(previousValues.hectares || 0) - parseFloat(newValues.hectares || 0)) > 0.001;
  const hasPeopleChanged = String(previousValues.people || '').trim() !== String(newValues.people || '').trim();
  const hasDateChanged = formatDisplayDate(previousValues.date) !== formatDisplayDate(newValues.date);
  const hasInputQtyChanged = String(previousValues.inputQty || '').trim() !== String(newValues.inputQty || '').trim();
  const hasInputUnitChanged = String(previousValues.inputUnit || '').trim() !== String(newValues.inputUnit || '').trim();

  const hasChanges = hasActivityChanged || hasCostChanged || hasHaChanged || hasPeopleChanged || hasDateChanged || hasInputQtyChanged || hasInputUnitChanged || subItemsChanged;

  if (!hasChanges) {
    return {
      success: false,
      noChanges: true,
      error: 'No changes detected. The operation details are identical to the current record. Nothing was submitted.'
    };
  }

  const changes = {};
  Object.keys(newValues).forEach(key => {
    if (JSON.stringify(previousValues[key]) !== JSON.stringify(newValues[key])) {
      changes[key] = { before: previousValues[key], after: newValues[key] };
    }
  });
  const editRecord = {
    amendmentId: `AMD-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
    amendedByUserId: CURRENT_SESSION.employeeId || CURRENT_SESSION.id || '',
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
    }, { baseVersion: originalLog.updatedAt || null });
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

  // Record audit history event shared with Web & Cloud
  const actorName = `${CURRENT_SESSION.name || 'User'} (${CURRENT_SESSION.role || 'Member Farmer'})`;
  await logSystemEvent(
    'operation',
    'Operation Log Correction',
    targetLog.id,
    `Amended operation record ${targetLog.id} (${targetLog.activity || targetLog.task || 'Operation'}, ₱${costNum.toLocaleString()}). Reason: ${reasonTrimmed}`,
    actorName,
    'Amended'
  );

  notify();
  return { success: true, log: targetLog, editRecord };
};

export const archivePastLogsForField = async (fieldId) => {
  if (!fieldId) return { success: false, message: 'Field ID is required' };
  const fId = fieldId.trim().toUpperCase();
  const nowIso = new Date().toISOString();
  
  const field = fields.find(item => String(item.id || '').trim().toUpperCase() === fId);
  if (!field?.currentCycleId) return { success: false, message: 'Field has no explicit current crop cycle' };
  const actorUserId = getCurrentSession()?.employeeId || getCurrentSession()?.id || '';
  const toArchive = operationLogs.filter(l => l.cycleId === field.currentCycleId && l.status === 'ACTIVE');
  if (!toArchive.length) return { success: true, archivedCount: 0 };

  let archivedAt = nowIso;
  try {
    const outcome = await commitExplicitMutation('operation_archive', {
      operationLogIds: toArchive.map(log => log.id)
    }, {
      baseVersion: Object.fromEntries(toArchive.map(log => [log.id, log.updatedAt || null]))
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
  const sorted = getSortedPrices();
  const prevPrice = sorted.length > 0 ? sorted[0].sugarPricePerLkg : sugarPricePerLkg;
  const prevMol = sorted.length > 0 ? sorted[0].molassesPricePerMetricTon : molassesPricePerMetricTon;
  const change = sugarPricePerLkg - prevPrice;
  const molChange = molassesPricePerMetricTon - prevMol;

  const pId = `PRC-${Date.now()}`;
  const newPost = toPriceDocument({
    id: pId,
    effectiveDate,
    weekLabel,
    sugarPricePerLkg,
    sugarPriceChange: change,
    molassesPricePerMetricTon,
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

let MEMBER_SYNC_LAG_DAYS = 0;
let MEMBER_LAST_SYNC_STR = '15 mins ago';

export const getMemberSyncHealth = () => {
  const isOffline = !IS_SYNCED || MEMBER_SYNC_LAG_DAYS >= 3;
  let status = 'healthy';
  if (MEMBER_SYNC_LAG_DAYS >= 7) status = 'critical';
  else if (MEMBER_SYNC_LAG_DAYS >= 3 || !IS_SYNCED) status = 'warning';

  const sessionUserId = CURRENT_SESSION?.employeeId || CURRENT_SESSION?.id || '';
  const assignedField = fields.find(field => field.memberUserId === sessionUserId);
  const assignedFarm = blockFarms.find(farm => farm.id === assignedField?.blockFarmId);
  const mgr = users.find(user => (user.id || user.employeeId) === assignedFarm?.managerUserId) || {};

  return {
    status,
    days: MEMBER_SYNC_LAG_DAYS,
    lastSync: MEMBER_LAST_SYNC_STR,
    isOffline: !IS_SYNCED,
    manager: {
      name: mgr.name || '',
      role: mgr.role || 'Farm Manager',
      blockFarm: assignedFarm?.name || 'Unassigned',
      phone: mgr.mobile || mgr.contact || ''
    }
  };
};


export const setSynced = (synced) => {
  IS_SYNCED = synced;
  if (!synced) {
    CURRENT_SESSION.pendingLogs = (CURRENT_SESSION.pendingLogs || 0) + 1;
  } else {
    performMobileSync();
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


export const SRA_OPERATIONS_CATALOGUE = [
  // ── Stage 1: Pre-Planting & Land Preparation ──
  {
    id: 'SRA-01',
    stageNumber: 1,
    stageName: 'Stage 1: Pre-Planting & Land Preparation',
    section: 'I. Direct Operations',
    name: 'Soil Sampling',
    category: 'prep',
    inputType: 'direct',
    isGroup: false,
    perHa: 1,
    unit: 'ha',
    rate: 100,
    costPerHa: 100,
    subItems: [
      { id: 'SI-01-1', description: 'Soil Laboratory Sampling & Analysis', qty: 1, unit: 'ha', unitCost: 100, subTotal: 100 }
    ]
  },
  {
    id: 'SRA-02',
    stageNumber: 1,
    stageName: 'Stage 1: Pre-Planting & Land Preparation',
    section: 'I. Direct Operations',
    name: 'Land Preparation',
    category: 'prep',
    inputType: 'group',
    isGroup: true,
    unit: 'ha',
    costPerHa: 12000,
    subItems: [
      { id: 'SI-02-1', description: '1st Pass Disc Plowing (Tractor)', qty: 1, unit: 'ha', unitCost: 5000, subTotal: 5000 },
      { id: 'SI-02-2', description: '2nd Pass Disc Harrowing', qty: 1, unit: 'ha', unitCost: 4000, subTotal: 4000 },
      { id: 'SI-02-3', description: 'Furrowing / Tudling', qty: 1, unit: 'ha', unitCost: 3000, subTotal: 3000 }
    ]
  },

  // ── Stage 2: Planting & Crop Establishment ──
  {
    id: 'SRA-03',
    stageNumber: 2,
    stageName: 'Stage 2: Planting & Crop Establishment',
    section: 'I. Direct Operations',
    name: 'Cost of Planting Material (Seedcane acquisition)',
    category: 'plant',
    inputType: 'group',
    isGroup: true,
    unit: 'ha',
    costPerHa: 15000,
    subItems: [
      { id: 'SI-03-1', description: 'Seedpieces (Patdan acquisition - 40,000 pts/ha)', qty: 5, unit: 'lac', unitCost: 3000, subTotal: 15000 }
    ]
  },
  {
    id: 'SRA-04',
    stageNumber: 2,
    stageName: 'Stage 2: Planting & Crop Establishment',
    section: 'I. Direct Operations',
    name: 'Planting Operations (Labor & Handling)',
    category: 'plant',
    inputType: 'group',
    isGroup: true,
    unit: 'ha',
    costPerHa: 5000,
    subItems: [
      { id: 'SI-04-1', description: 'Cutting, Bundling, Loading & Transport of Seedpieces', qty: 5, unit: 'lac', unitCost: 600, subTotal: 3000 },
      { id: 'SI-04-2', description: 'Distributing and Planting Seedpieces in Furrows', qty: 5, unit: 'lac', unitCost: 400, subTotal: 2000 }
    ]
  },

  // ── Stage 3: Basal Nutrition & Early Care ──
  {
    id: 'SRA-05',
    stageNumber: 3,
    stageName: 'Stage 3: Basal Nutrition & Early Care',
    section: 'I. Direct Operations',
    name: 'Basal Fertilizer Application (Labor & Materials)',
    category: 'fert',
    inputType: 'group',
    isGroup: true,
    unit: 'ha',
    costPerHa: 15800,
    subItems: [
      { id: 'SI-05-1', description: 'Application of 46-00-00 (Urea)', qty: 2, unit: 'bag', unitCost: 1600, subTotal: 3200 },
      { id: 'SI-05-2', description: 'Application of 18-46-00 (DAP / Complete)', qty: 3, unit: 'bag', unitCost: 2500, subTotal: 7500 },
      { id: 'SI-05-3', description: 'Application of 00-00-60 (MOP / Potash)', qty: 2, unit: 'bag', unitCost: 2200, subTotal: 4400 },
      { id: 'SI-05-4', description: 'Fertilizer Application Labor', qty: 7, unit: 'bag', unitCost: 100, subTotal: 700 }
    ]
  },
  {
    id: 'SRA-06',
    stageNumber: 3,
    stageName: 'Stage 3: Basal Nutrition & Early Care',
    section: 'I. Direct Operations',
    name: 'Lime Application (Soil Amending)',
    category: 'fert',
    inputType: 'direct',
    isGroup: false,
    perHa: 2,
    unit: 'ton',
    rate: 2500,
    costPerHa: 5000,
    subItems: [
      { id: 'SI-06-1', description: 'Agricultural Lime (Cal-Mag / Dolomite)', qty: 2, unit: 'ton', unitCost: 2500, subTotal: 5000 }
    ]
  },

  // ── Stage 4: Cultivation & Weed Management ──
  {
    id: 'SRA-07',
    stageNumber: 4,
    stageName: 'Stage 4: Cultivation & Weed Management',
    section: 'I. Direct Operations',
    name: 'Cultivation (Off-barring & On-barring)',
    category: 'weed',
    inputType: 'group',
    isGroup: true,
    unit: 'ha',
    costPerHa: 3000,
    subItems: [
      { id: 'SI-07-1', description: '1st Off-barring (Pahubas)', qty: 2, unit: 'pass', unitCost: 750, subTotal: 1500 },
      { id: 'SI-07-2', description: '2nd Off-barring (Pahubas)', qty: 2, unit: 'pass', unitCost: 750, subTotal: 1500 }
    ]
  },
  {
    id: 'SRA-08',
    stageNumber: 4,
    stageName: 'Stage 4: Cultivation & Weed Management',
    section: 'I. Direct Operations',
    name: 'Weeding Operations',
    category: 'weed',
    inputType: 'group',
    isGroup: true,
    unit: 'ha',
    costPerHa: 6000,
    subItems: [
      { id: 'SI-08-1', description: 'Manual Weeding (1st Round)', qty: 1, unit: 'ha', unitCost: 2000, subTotal: 2000 },
      { id: 'SI-08-2', description: 'Manual Weeding (2nd Round)', qty: 1, unit: 'ha', unitCost: 2000, subTotal: 2000 },
      { id: 'SI-08-3', description: 'Manual Weeding (3rd Round)', qty: 1, unit: 'ha', unitCost: 2000, subTotal: 2000 }
    ]
  },

  // ── Stage 5: Crop Maintenance & Final Hilling-Up ──
  {
    id: 'SRA-09',
    stageNumber: 5,
    stageName: 'Stage 5: Crop Maintenance & Final Hilling-Up',
    section: 'I. Direct Operations',
    name: 'Top-Dress / 2nd Dose Fertilization',
    category: 'maint',
    inputType: 'group',
    isGroup: true,
    unit: 'ha',
    costPerHa: 2500,
    subItems: [
      { id: 'SI-09-1', description: '2nd Dose Urea (Side-dressing)', qty: 1.5, unit: 'bag', unitCost: 1600, subTotal: 2400 },
      { id: 'SI-09-2', description: 'Side-dressing Application Labor', qty: 1.5, unit: 'bag', unitCost: 66.67, subTotal: 100 }
    ]
  },
  {
    id: 'SRA-10',
    stageNumber: 5,
    stageName: 'Stage 5: Crop Maintenance & Final Hilling-Up',
    section: 'I. Direct Operations',
    name: 'Final Hilling-up (Pasungkal)',
    category: 'maint',
    inputType: 'direct',
    isGroup: false,
    perHa: 1,
    unit: 'ha',
    rate: 2500,
    costPerHa: 2500,
    subItems: [
      { id: 'SI-10-1', description: 'Final Hilling-Up / Pasungkal Pass', qty: 1, unit: 'ha', unitCost: 2500, subTotal: 2500 }
    ]
  },

  // ── Stage 6: Harvesting & Transport ──
  {
    id: 'SRA-11',
    stageNumber: 6,
    stageName: 'Stage 6: Harvesting & Transport',
    section: 'I. Direct Operations',
    name: 'Cutting and Loading Operations',
    category: 'harvest',
    inputType: 'direct',
    isGroup: false,
    perHa: 60,
    unit: 'ton',
    rate: 450,
    costPerHa: 27000,
    subItems: [
      { id: 'SI-11-1', description: 'Cutting, De-trashing, and Truck Loading', qty: 60, unit: 'ton', unitCost: 450, subTotal: 27000 }
    ]
  },
  {
    id: 'SRA-12',
    stageNumber: 6,
    stageName: 'Stage 6: Harvesting & Transport',
    section: 'I. Direct Operations',
    name: 'Hauling (Trucking to Mill)',
    category: 'harvest',
    inputType: 'direct',
    isGroup: false,
    perHa: 60,
    unit: 'ton',
    rate: 250,
    costPerHa: 15000,
    subItems: [
      { id: 'SI-12-1', description: 'Flatbed Hauling to Haw-Phil Milling Terminal', qty: 60, unit: 'ton', unitCost: 250, subTotal: 15000 }
    ]
  },
  {
    id: 'SRA-13',
    stageNumber: 6,
    stageName: 'Stage 6: Harvesting & Transport',
    section: 'I. Direct Operations',
    name: 'Bull Cart / In-field Transport',
    category: 'harvest',
    inputType: 'direct',
    isGroup: false,
    perHa: 60,
    unit: 'ton',
    rate: 120,
    costPerHa: 7200,
    subItems: [
      { id: 'SI-13-1', description: 'Carabao / Bull cart hauling to loading ramp', qty: 60, unit: 'ton', unitCost: 120, subTotal: 7200 }
    ]
  },
  {
    id: 'SRA-14',
    stageNumber: 6,
    stageName: 'Stage 6: Harvesting & Transport',
    section: 'I. Direct Operations',
    name: 'Drainage & Post-Harvest Field Clearing',
    category: 'prep',
    inputType: 'direct',
    isGroup: false,
    perHa: 1,
    unit: 'ha',
    rate: 2000,
    costPerHa: 2000,
    subItems: [
      { id: 'SI-14-1', description: 'Trash farming, field clearing & drainage', qty: 1, unit: 'ha', unitCost: 2000, subTotal: 2000 }
    ]
  }
];

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

export const getDefaultStageOperations = (stageNumber) => {
  return SRA_OPERATIONS_CATALOGUE
    .filter(op => op.stageNumber === Number(stageNumber))
    .map(op => ({
      id: op.id,
      name: op.name,
      stageNumber: op.stageNumber,
      stageName: op.stageName,
      inputType: op.inputType || (op.isGroup ? 'group' : 'direct'),
      isGroup: op.isGroup !== undefined ? op.isGroup : false,
      perHa: op.perHa !== undefined ? op.perHa : (op.subItems && op.subItems[0] ? op.subItems[0].qty : 1),
      rate: op.rate !== undefined ? op.rate : (op.subItems && op.subItems[0] ? op.subItems[0].unitCost : op.costPerHa || 0),
      category: op.category || 'prep',
      unit: op.unit || 'ha',
      costPerHa: op.costPerHa || 0,
      subItems: (op.subItems || []).map(si => ({ ...si }))
    }));
};

export const getFieldCustomOperations = (fieldId, stageNumber) => {
  const cleanId = String(fieldId || '').trim().toUpperCase();
  const field = fields.find(f => f.id.toUpperCase() === cleanId);
  const sNum = Number(stageNumber) || 1;
  let baseOps = [];

  if (field && field.customOperations && field.customOperations[sNum] && field.customOperations[sNum].length > 0) {
    baseOps = field.customOperations[sNum].map(op => ({
      ...op,
      isGroup: op.isGroup !== undefined ? op.isGroup : (op.inputType === 'group' || (op.subItems && op.subItems.length > 0)),
      inputType: op.inputType || (op.isGroup ? 'group' : 'direct'),
      subItems: (op.subItems || []).map(si => ({ ...si }))
    }));
  } else {
    baseOps = getDefaultStageOperations(sNum);
  }

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
  if (field) {
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
  }
};

export const saveFieldFullPlan = async (fieldId, fullPlanByStage) => {
  const cleanId = String(fieldId || '').trim().toUpperCase();
  const field = fields.find(f => f.id.toUpperCase() === cleanId);
  if (field) {
    const baseVersion = field.updatedAt || null;
    field.customOperations = { ...(fullPlanByStage || {}) };
    field.updatedAt = new Date().toISOString();
    await saveItem(STORAGE_KEYS.FIELDS, fields);
    await commitExplicitMutation('custom_operations', {
      fieldId: field.id,
      customOperations: field.customOperations
    }, { baseVersion });
    notifyDataUpdate();
  }
};

export const submitSupportTicket = async (ticket) => {
  const newId = generateTicketId(800 + supportTickets.length + 1);
  const sessionUserId = CURRENT_SESSION.employeeId || CURRENT_SESSION.id || '';
  const assignedField = fields.find(field => field.memberUserId === sessionUserId);
  const assignedFarm = blockFarms.find(farm => farm.id === assignedField?.blockFarmId);
  const farmName = assignedFarm?.name || 'Unassigned';
  const newTicket = {
    id: newId,
    subject: ticket.title || ticket.subject || 'Support Request',
    memberName: CURRENT_SESSION.name,
    memberId: CURRENT_SESSION.employeeId || '',
    contact: CURRENT_SESSION.contact || '',
    fieldId: ticket.fieldId || assignedField?.id || null,
    blockFarm: farmName,
    category: ticket.category || 'General Support',
    priority: ticket.priority || 'Normal',
    status: 'Open',
    messages: [
      {
        sender: CURRENT_SESSION.name,
        text: ticket.details || ticket.message || '',
        timestamp: new Date().toISOString()
      }
    ],
    createdAt: new Date().toISOString()
  };
  supportTickets.unshift(newTicket);

  const ticketPayload = { id: newId, ...toSupportTicketDocument({ ...newTicket, title: newTicket.subject, details: ticket.details || ticket.message || '' }, CURRENT_SESSION?.employeeId || '') };
  await commitExplicitMutation('ticket', ticketPayload);

  notify();
  return newTicket;
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
  draftLogs.length = 0;
  IS_SYNCED = true;
  await clearOutbox();
  await clearHugpongStorage();
  if (CURRENT_SESSION) {
    await saveItem(STORAGE_KEYS.SESSION, CURRENT_SESSION);
  }
  notify();
  return true;
};

// ── Real-Time Cloud Firestore Sync ──────────────────────────
export const listenToCloudSync = () => {
  if (!db || !auth?.currentUser) return () => {};

  try {
    const activeRole = canonicalRole(CURRENT_SESSION?.role || CURRENT_SESSION?.roleKey);
    const isMember = activeRole === ROLES.MEMBER_FARMER;
    const memberUserId = auth.currentUser.uid;
    const memberFieldId = CURRENT_SESSION?.fieldId || '__unassigned__';
    let rawFieldDocuments = [];
    const refreshFieldViews = () => {
      const cycleById = new Map(cropCycles.map(cycle => [cycle.id, cycle]));
      const mapped = rawFieldDocuments.map(field => fromFieldDocument(field.id, field, cycleById.get(field.currentCycleId)));
      fields.length = 0;
      archivedFields.length = 0;
      mapped.forEach(field => (field.status === 'ARCHIVED' ? archivedFields : fields).push(field));
      saveItem(STORAGE_KEYS.FIELDS, fields);
      saveItem(STORAGE_KEYS.ARCHIVED_FIELDS, archivedFields);
      notify();
    };

    const unsubBlockFarms = onSnapshot(collection(db, COLLECTIONS.BLOCK_FARMS), (snapshot) => {
      const remoteBF = [];
      snapshot.forEach(docSnap => remoteBF.push(fromBlockFarmDocument(docSnap.id, docSnap.data())));

      blockFarms.length = 0;
      remoteBF.forEach(bf => blockFarms.push(bf));
      saveItem('@hugpong_block_farms', blockFarms);
      notify();
    }, (err) => console.warn('[Mobile] Block farms listener notice:', err));

    // 1. Live SRA Sugar Prices Listener
    const unsubPrices = onSnapshot(collection(db, COLLECTIONS.SRA_PRICES), (snapshot) => {
      const remotePrices = [];
      snapshot.forEach(docSnap => {
        try {
          remotePrices.push(fromPriceDocument(docSnap.id, docSnap.data()));
        } catch (error) {
          console.error('[Mobile] Rejected invalid sra_prices document:', docSnap.id, error.message);
        }
      });
      
      remotePrices.sort((a, b) => parsePriceTime(b) - parsePriceTime(a));

      priceHistory.length = 0;
      remotePrices.forEach(p => priceHistory.push(p));
      saveItem(STORAGE_KEYS.PRICES, remotePrices);
      notify();
    }, (err) => console.warn('[Mobile] SRA prices listener notice:', err));

    const cyclesSource = isMember
      ? query(collection(db, COLLECTIONS.CROP_CYCLES), where('fieldId', '==', memberFieldId))
      : collection(db, COLLECTIONS.CROP_CYCLES);
    const unsubCycles = onSnapshot(cyclesSource, (snapshot) => {
      cropCycles.length = 0;
      snapshot.forEach(docSnap => cropCycles.push(fromCycleDocument(docSnap.id, docSnap.data())));
      refreshFieldViews();
    }, (err) => console.warn('[Mobile] Crop cycles listener notice:', err));

    const fieldsSource = isMember
      ? query(collection(db, COLLECTIONS.FIELDS), where('memberUserId', '==', memberUserId))
      : collection(db, COLLECTIONS.FIELDS);
    const unsubFields = onSnapshot(fieldsSource, (snapshot) => {
      rawFieldDocuments = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      refreshFieldViews();
    }, (err) => console.warn('[Mobile] Fields listener notice:', err));

    // 3. Live Operation Logs Listener (Authoritative Cloud Sync)
    const logsSource = isMember
      ? query(collection(db, COLLECTIONS.OPERATION_LOGS), where('fieldId', '==', memberFieldId))
      : collection(db, COLLECTIONS.OPERATION_LOGS);
    const unsubLogs = onSnapshot(logsSource, (snapshot) => {
      const remoteLogs = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if ((data.status === 'ACTIVE' || data.status === 'ARCHIVED') && data.cycleId) {
          remoteLogs.push(fromOperationLogDocument(docSnap.id, data));
        }
      });

      // Snapshot data replaces the canonical local replica. The only overlay is
      // derived from an explicit pending create mutation, never from a cached
      // record that happens to be absent from Firestore.
      const remoteIds = new Set(remoteLogs.map(r => r.id));
      const pendingCreateOverlays = getOutboxQueue()
        .filter(item =>
          (item.type === 'operation_log' || item.type === 'takeover_log') &&
          ['queued', 'retryable', 'failed', 'syncing'].includes(item.status) &&
          item.payload?.id && !remoteIds.has(item.payload.id)
        )
        .map(item => ({
          ...fromOperationLogDocument(item.payload.id, item.payload),
          synced: false,
          isOffline: true,
          cloudQueueStatus: 'offline_queued'
        }));

      const merged = [...remoteLogs, ...pendingCreateOverlays];
      merged.sort((a, b) => {
        const timeA = new Date(a.createdAt || a.timestamp || a.date || 0).getTime();
        const timeB = new Date(b.createdAt || b.timestamp || b.date || 0).getTime();
        if (timeA !== timeB && !isNaN(timeA) && !isNaN(timeB)) return timeB - timeA;
        return (b.id || '').localeCompare(a.id || '');
      });

      const dedupedLogs = cleanupDuplicateLogs(merged);
      operationLogs.length = 0;
      dedupedLogs.forEach(rl => operationLogs.push(rl));
      saveItem(STORAGE_KEYS.LOGS, operationLogs);

      const pendingCount = getPendingSyncCount(CURRENT_SESSION);
      IS_SYNCED = pendingCount === 0;
      if (CURRENT_SESSION) CURRENT_SESSION.pendingLogs = pendingCount;
      notify();
    }, (err) => console.warn('[Mobile] Operation logs listener notice:', err));

    // 4. Live Support Tickets Listener (Authoritative Cloud Sync)
    const ticketsSource = isMember
      ? query(collection(db, COLLECTIONS.SUPPORT_TICKETS), where('createdByUserId', '==', memberUserId))
      : collection(db, COLLECTIONS.SUPPORT_TICKETS);
    const unsubTickets = onSnapshot(ticketsSource, (snapshot) => {
      const remoteTickets = [];
      snapshot.forEach(docSnap => remoteTickets.push(fromSupportTicketDocument(docSnap.id, docSnap.data())));

      supportTickets.length = 0;
      remoteTickets.forEach(rt => supportTickets.push(rt));
      saveItem(STORAGE_KEYS.TICKETS, supportTickets);
      notify();
    }, (err) => console.warn('[Mobile] Support tickets listener notice:', err));

    // 5. Live Users Directory Listener (Authoritative Cloud Sync)
    const usersSource = isMember
      ? doc(db, COLLECTIONS.USERS, memberUserId)
      : collection(db, COLLECTIONS.USERS);
    const unsubUsers = onSnapshot(usersSource, (snapshot) => {
      const remoteUsers = [];
      if (isMember) {
        if (snapshot.exists()) remoteUsers.push(fromUserDocument(snapshot.id, snapshot.data()));
      } else {
        snapshot.forEach(docSnap => remoteUsers.push(fromUserDocument(docSnap.id, docSnap.data())));
      }

      users.length = 0;
      remoteUsers.forEach(ru => users.push(ru));
      saveItem(STORAGE_KEYS.USERS, users);
      notify();
    }, (err) => console.warn('[Mobile] Users listener notice:', err));

    // 6. Live Audit Reports Listener (Authoritative Cloud Sync)
    const unsubAuditReports = isMember ? () => {} : onSnapshot(collection(db, COLLECTIONS.AUDIT_REPORTS), (snapshot) => {
      const remoteAudits = [];
      snapshot.forEach(docSnap => remoteAudits.push(fromAuditReportDocument(docSnap.id, docSnap.data())));
      auditReports.length = 0;
      auditReports.push(...remoteAudits);
      saveItem(STORAGE_KEYS.AUDIT_REPORTS, auditReports);
      saveItem('@hugpong_audit_logs', auditReports);
      notify();
    }, (err) => console.warn('[Mobile] Audit reports listener notice:', err));

    // 7. Live Audit Logs / System History Listener (Authoritative Cloud Sync)
    const unsubAuditLogs = isMember ? () => {} : onSnapshot(collection(db, COLLECTIONS.AUDIT_LOGS), (snapshot) => {
      const remoteLogs = [];
      snapshot.forEach(docSnap => remoteLogs.push({ id: docSnap.id, ...docSnap.data() }));

      systemHistory.length = 0;
      systemHistory.push(...remoteLogs);
      saveItem(STORAGE_KEYS.SYSTEM_HISTORY, systemHistory);
      notify();
    }, (err) => console.warn('[Mobile] Audit logs listener notice:', err));

    return () => {
      unsubBlockFarms();
      unsubPrices();
      unsubCycles();
      unsubFields();
      unsubLogs();
      unsubTickets();
      unsubUsers();
      unsubAuditReports();
      unsubAuditLogs();
    };
  } catch (err) {
    console.warn('[Mobile] Error setting up Cloud listeners:', err);
    return () => {};
  }
};

export const performMobileSync = async () => {
  const res = await flushOutboxToApi();
  IS_SYNCED = getOutboxCount() === 0;
  if (CURRENT_SESSION) CURRENT_SESSION.pendingLogs = getPendingSyncCount(CURRENT_SESSION);
  notify();
  return res;
};

// Register automatic sync on network reconnection
setOnReconnectCallback(performMobileSync);

export const initializeOfflineStorage = async () => {
  try {
    await ensureCurrentCacheSchema();
    await initSyncEngine();
    const stored = await hydrateAllStorage();
    if (stored[STORAGE_KEYS.AUTH_TOKEN] && stored[STORAGE_KEYS.SESSION]) {
      CURRENT_SESSION = stripCredentialFields(stored[STORAGE_KEYS.SESSION]);
    } else if (stored[STORAGE_KEYS.SESSION]) {
      CURRENT_SESSION = stripCredentialFields(stored[STORAGE_KEYS.SESSION]);
    } else {
      CURRENT_SESSION = { ...DEFAULT_GUEST_SESSION };
    }
    if (Array.isArray(stored[STORAGE_KEYS.USERS]) && stored[STORAGE_KEYS.USERS].length > 0) {
      users.length = 0;
      stored[STORAGE_KEYS.USERS].forEach(u => users.push(stripCredentialFields(u)));
    }
    if (Array.isArray(stored[STORAGE_KEYS.LOGS]) && stored[STORAGE_KEYS.LOGS].length > 0) {
      operationLogs.length = 0;
      const normalized = cleanupDuplicateLogs(stored[STORAGE_KEYS.LOGS])
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
      });
      normalized.forEach(l => operationLogs.push(l));
    }
    if (Array.isArray(stored[STORAGE_KEYS.DRAFTS])) {
      draftLogs.length = 0;
      stored[STORAGE_KEYS.DRAFTS].forEach(d => draftLogs.push(d));
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
    if (Array.isArray(stored[STORAGE_KEYS.TICKETS]) && stored[STORAGE_KEYS.TICKETS].length > 0) {
      supportTickets.length = 0;
      stored[STORAGE_KEYS.TICKETS].forEach(t => supportTickets.push(t));
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
      stored[STORAGE_KEYS.AUDIT_REPORTS].forEach(a => {
        if (a && (a.status === 'PENDING' || a.status === 'CERTIFIED')) auditReports.push(a);
      });
    }

    // Hydrate cached system history
    if (Array.isArray(stored[STORAGE_KEYS.SYSTEM_HISTORY]) && stored[STORAGE_KEYS.SYSTEM_HISTORY].length > 0) {
      systemHistory.length = 0;
      stored[STORAGE_KEYS.SYSTEM_HISTORY].forEach(s => systemHistory.push(s));
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
      let stopCloudSync = null;
      if (auth) {
        onAuthStateChanged(auth, firebaseUser => {
          if (stopCloudSync) {
            stopCloudSync();
            stopCloudSync = null;
          }
          if (firebaseUser) stopCloudSync = listenToCloudSync();
        });
      }
      // Publish background device telemetry
      if (CURRENT_SESSION && CURRENT_SESSION.name) {
        publishTerminalTelemetry(CURRENT_SESSION, pendingCount).catch(() => {});
      }
      // If internet is connected, auto-sync immediately on launch
      checkConnectivity().then(online => {
        if (online) {
          restoreSessionFromToken()
            .then(result => { if (result.success) return performMobileSync(); })
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
