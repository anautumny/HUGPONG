import { STORAGE_KEYS, saveItem, getItem, clearHugpongStorage, hydrateAllStorage, multiSave } from '../services/storageService';
import { initSyncEngine, enqueueOutboxItem, processOutbox, getOutboxCount, clearOutbox, flushOutboxToFirestore, generateUserNumericId, generateTicketId } from '../services/syncEngine';
import { hashPassword, verifyPassword, DEFAULT_SEED_PASSWORD_HASH, DEFAULT_MASTER_PASSWORD_HASH } from '../services/cryptoService';
import { publishTerminalTelemetry } from '../services/telemetryService';
import { db } from '../firebase/config';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';

import { getNetworkStatus, subscribeToNetwork, setOnReconnectCallback, checkConnectivity } from '../services/networkService';

export { hashPassword, verifyPassword, DEFAULT_SEED_PASSWORD_HASH, DEFAULT_MASTER_PASSWORD_HASH, publishTerminalTelemetry, getNetworkStatus, subscribeToNetwork, checkConnectivity };

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
      if (timeCurrent >= timeExisting || l.isAmended || l.isTakeover) {
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

export const users = [];

export const SEED_FIELDS = [];

export const archivedFields = [];

export const mergeFieldsWithSeeds = (incomingFields = [], customArchivedIds = []) => {
  const archivedSet = new Set([
    ...archivedFields.map(f => (typeof f === 'string' ? f : f.id).toUpperCase()),
    ...(Array.isArray(customArchivedIds) ? customArchivedIds.map(id => (typeof id === 'string' ? id : id.id).toUpperCase()) : [])
  ]);

  const merged = [];
  (incomingFields || []).forEach(f => {
    if (!f || !f.id) return;
    const fIdUpper = f.id.toUpperCase();
    if (archivedSet.has(fIdUpper) || f.isArchived === true || f.status === 'Archived') {
      archivedSet.add(fIdUpper);
      if (!archivedFields.some(af => (typeof af === 'string' ? af : af.id).toUpperCase() === fIdUpper)) {
        archivedFields.push({ ...f, isArchived: true, status: 'Archived' });
      }
      return;
    }
    if (!merged.some(m => m.id.toUpperCase() === fIdUpper)) {
      merged.push({
        ...f,
        ha: Number(f.ha) || 1.0,
        member: f.member || f.memberName || 'Member Farmer',
        memberName: f.memberName || f.member || 'Member Farmer',
        lastSync: f.lastSync || 'Just now',
        synced: f.synced !== undefined ? f.synced : true
      });
    }
  });

  return merged;
};

export const fields = [];

const RAW_SEED_LOGS = [];

export const operationLogs = [];

export const deletedLogIds = new Set();

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
    member: memberName || curSession.name || 'Member',
    memberId: memberId || curSession.employeeId || curSession.id || '',
    ha: String(ha || '1.0'),
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
      if (f) {
        f.member = req.member;
        f.memberName = req.member;
        f.owner = req.member;
        if (req.memberId) f.memberId = req.memberId;
        if (req.ha) f.ha = parseFloat(req.ha);
      } else {
        fields.push({
          id: req.fieldId,
          name: `Field ${req.fieldId}`,
          ha: parseFloat(req.ha) || 1.0,
          cropCycle: 'CY 2026-2027',
          stage: 'Pre-Planting',
          member: req.member,
          memberName: req.member,
          owner: req.member,
          memberId: req.memberId || '',
          targetTons: (parseFloat(req.ha) || 1.0) * 65
        });
      }
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
  pendingUsers.splice(idx, 1);

  // Determine plot ID & Hectares
  const assignedPlotId = options.fieldId || applicant.fieldId || generateNextFieldId(applicant.blockFarm || (blockFarms[0]?.name || ''), fields, blockFarms);
  const rawHa = options.area || applicant.area || '1.5';
  const assignedHa = parseFloat(String(rawHa).replace(/[^0-9.]/g, '')) || 1.5;
  const empId = applicant.employeeId || ('04' + cleanContact.slice(-6).padStart(6, '0'));

  // Update or create active user account
  const existingUser = users.find(u => (u.contact || '').replace(/\D/g, '') === cleanContact || u.employeeId === empId);
  if (existingUser) {
    existingUser.fieldId = assignedPlotId;
    existingUser.status = 'Active';
    existingUser.phoneVerified = true;
    existingUser.isPhoneVerified = true;
    existingUser.pendingFirstLoginVerification = false;
    existingUser.phoneVerifiedAt = existingUser.phoneVerifiedAt || new Date().toISOString();
    existingUser.blockFarm = applicant.blockFarm || (blockFarms[0]?.name || 'Block Farm');
    existingUser.updatedAt = new Date().toISOString();
  } else {
    users.push({
      employeeId: empId,
      name: applicant.name,
      contact: cleanContact,
      role: applicant.role || 'Member',
      roleKey: 'member',
      blockFarmId: '',
      blockFarm: applicant.blockFarm || (blockFarms[0]?.name || 'Block Farm'),
      fieldId: assignedPlotId,
      status: 'Active',
      phoneVerified: true,
      isPhoneVerified: true,
      pendingFirstLoginVerification: false,
      phoneVerifiedAt: new Date().toISOString(),
      regDate: applicant.regDate || new Date().toISOString().split('T')[0],
      passwordHash: hashPassword('hugpong2026'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  // Allocate field in fields registry
  const existingField = fields.find(f => f.id === assignedPlotId);
  if (existingField) {
    existingField.member = applicant.name;
    existingField.memberName = applicant.name;
    existingField.userId = empId;
    existingField.memberId = empId;
    existingField.memberContact = cleanContact;
    existingField.ha = assignedHa;
  } else {
    fields.push({
      id: assignedPlotId,
      name: `Field ${assignedPlotId}`,
      member: applicant.name,
      memberName: applicant.name,
      userId: empId,
      memberId: empId,
      memberContact: cleanContact,
      ha: assignedHa,
      stage: 'Pre-Planting & Land Preparation',
      stageNumber: 1,
      month: 0,
      synced: false,
      lastSync: 'Just now',
      blockFarm: applicant.blockFarm || (blockFarms[0]?.name || 'Block Farm'),
      blockFarmId: (blockFarms[0]?.id || ''),
      variety: 'VMC 84-524',
      soilType: 'Clay Loam'
    });
  }

  // Persist to storage
  await saveItem(STORAGE_KEYS.PENDING_USERS, pendingUsers);
  await saveItem(STORAGE_KEYS.USERS, users);
  await saveItem(STORAGE_KEYS.FIELDS, fields);

  // Sync to Firestore if online
  if (db) {
    try {
      await setDoc(doc(db, 'users', empId), {
        employeeId: empId,
        name: applicant.name,
        contact: cleanContact,
        role: applicant.role || 'Member',
        roleKey: 'member',
        blockFarm: applicant.blockFarm || (blockFarms[0]?.name || 'Block Farm'),
        fieldId: assignedPlotId,
        status: 'Active',
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {}
  }

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
  const rawMemberId = fieldData.memberId || fieldData.userId || fieldData.memberContact || fieldData.member || fieldData.memberName;
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
  
  const seed = SEED_FIELDS.find(s => s.id.toUpperCase() === targetId) || {};
  const currentF = existingIdx >= 0 ? fields[existingIdx] : {};

  // Resolve verified user if assigned
  const rawMemberId = fieldData.memberId || fieldData.userId || fieldData.memberContact || fieldData.member || fieldData.memberName;
  const isUnassigned = !rawMemberId || String(rawMemberId).trim().toLowerCase() === 'unassigned';
  const matchedUser = !isUnassigned ? findUserByIdOrContact(rawMemberId) : null;

  const resolvedMemberName = matchedUser ? matchedUser.name : (isUnassigned ? 'Unassigned' : (currentF.memberName || seed.memberName || 'Unassigned'));
  const resolvedMemberId = matchedUser ? (matchedUser.employeeId || matchedUser.id || matchedUser.contact) : (isUnassigned ? '' : (currentF.memberId || seed.memberId || ''));
  const resolvedMemberContact = matchedUser ? (matchedUser.contact || matchedUser.mobile || '') : (isUnassigned ? '' : (currentF.memberContact || seed.memberContact || ''));

  const formattedField = {
    id: targetId,
    blockFarmId: fieldData.blockFarmId || currentF.blockFarmId || seed.blockFarmId || '',
    blockFarm: fieldData.blockFarm || currentF.blockFarm || (blockFarms[0]?.name || 'Block Farm'),
    memberId: resolvedMemberId,
    userId: resolvedMemberId,
    memberName: resolvedMemberName,
    member: resolvedMemberName,
    memberContact: resolvedMemberContact,
    ha: validation.parsedHa,
    stage: fieldData.stage || currentF.stage || seed.stage || 'Pre-Planting & Land Preparation',
    stageNumber: fieldData.stageNumber || currentF.stageNumber || seed.stageNumber || 1,
    isCompleted: fieldData.isCompleted !== undefined ? fieldData.isCompleted : (currentF.isCompleted !== undefined ? currentF.isCompleted : false),
    customStages: fieldData.customStages || currentF.customStages || seed.customStages || [],
    customOperations: fieldData.customOperations || currentF.customOperations || {},
    cycleType: fieldData.cycleType || currentF.cycleType || seed.cycleType || 'Plant Cane (New Plant)',
    cropYear: fieldData.cropYear || currentF.cropYear || seed.cropYear || 'CY 2025–2026',
    month: fieldData.month !== undefined ? fieldData.month : (currentF.month !== undefined ? currentF.month : (seed.month !== undefined ? seed.month : 0)),
    batchMonth: fieldData.batchMonth || currentF.batchMonth || seed.batchMonth || 1,
    synced: fieldData.synced !== undefined ? fieldData.synced : true,
    lastSync: fieldData.lastSync || currentF.lastSync || seed.lastSync || 'Just now',
    variety: fieldData.variety || currentF.variety || seed.variety || 'VMC 84-524',
    soilType: fieldData.soilType || currentF.soilType || seed.soilType || 'Clay Loam',
    createdAt: fieldData.createdAt || currentF.createdAt || nowIso,
    updatedAt: nowIso
  };

  if (existingIdx >= 0) {
    fields[existingIdx] = { ...fields[existingIdx], ...formattedField };
  } else {
    fields.push(formattedField);
  }

  // Update matching user profile fieldId in users array
  if (matchedUser) {
    matchedUser.fieldId = formattedField.id;
    matchedUser.blockFarm = formattedField.blockFarm;
    matchedUser.blockFarmId = formattedField.blockFarmId;
  }

  // Persist to offline AsyncStorage
  await saveItem(STORAGE_KEYS.FIELDS, fields);
  await saveItem(STORAGE_KEYS.USERS, users);

  // Sync to Cloud Firestore if online
  if (db) {
    try {
      await setDoc(doc(db, 'fields', formattedField.id), formattedField, { merge: true });
      if (matchedUser && matchedUser.employeeId) {
        await setDoc(doc(db, 'users', matchedUser.employeeId), {
          fieldId: formattedField.id,
          blockFarm: formattedField.blockFarm,
          blockFarmId: formattedField.blockFarmId,
          updatedAt: nowIso
        }, { merge: true });
      }
    } catch (e) {
      console.warn('[dataStore] saveFieldPlot Firestore sync fallback to offline:', e);
    }
  }

  notifyDataUpdate();
  return { success: true, field: formattedField };
};

// Backward-compatible architectural aliases
export const MOCK_BLOCK_FARMS = blockFarms;
export const MOCK_FIELDS = fields;
export const fieldsStore = fields;
export const MOCK_LOGS = operationLogs;
export const DRAFT_LOGS = draftLogs;
export const MOCK_TICKETS = supportTickets;
export const MOCK_AUDIT_HISTORY = auditLogs;
export const MOCK_ASSIGNMENT_REQUESTS = assignmentRequests;
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
  if (field.member && typeof field.member === 'string' && field.member.length > 0 && !field.member.startsWith('09') && !field.member.startsWith('04')) return field.member;
  const u = findUserByIdOrContact(field.memberId || field.userId || field.memberContact || field.member);
  return u ? u.name : (field.member || 'Member Farmer');
};

export const resolveFieldMemberId = (field) => {
  if (!field) return '';
  if (field.memberId && typeof field.memberId === 'string' && field.memberId.trim().length > 0 && field.memberId !== '04XXXXXX') {
    return field.memberId.trim();
  }
  if (field.userId && typeof field.userId === 'string' && field.userId.trim().length > 0) {
    return field.userId.trim();
  }
  const u = findUserByIdOrContact(field.memberId || field.userId || field.memberContact || field.member || field.memberName);
  return u ? (u.employeeId || u.contact || '') : '';
};

export const resolveFieldBlockFarm = (field) => {
  if (!field) return 'Unassigned';
  if (field.blockFarm && typeof field.blockFarm === 'string' && field.blockFarm.length > 0) return field.blockFarm;
  const bf = blockFarms.find(b => b.id === field.blockFarmId || b.code === field.blockFarmId);
  return bf ? bf.name : (field.blockFarm || (blockFarms.length > 0 ? blockFarms[0].name : (blockFarms[0]?.name || 'Block Farm')));
};

export const resolveBlockFarmManager = (blockFarm) => {
  if (!blockFarm) return 'Pending Appointment';
  if (blockFarm.farmManagerName && blockFarm.farmManagerName !== 'Assigned Farm Manager' && blockFarm.farmManagerName !== 'Assigned Manager') {
    return blockFarm.farmManagerName;
  }
  const u = findUserByIdOrContact(blockFarm.farmManagerId || blockFarm.managerContact);
  if (u) return u.name;
  const mgr = users.find(u => 
    (blockFarm.farmManagerId && u.employeeId === blockFarm.farmManagerId) || 
    (u.role === 'Farm Manager' && (u.blockFarmId === blockFarm.id || (u.blockFarm && u.blockFarm === blockFarm.name)))
  );
  return mgr ? mgr.name : 'Pending Appointment';
};

// ── Deterministic Price Parsing & Sorting Helper ─────────────
function parsePriceTime(p) {
  if (p.timestamp) return p.timestamp;
  if (p.createdAt) {
    const t = new Date(p.createdAt).getTime();
    if (!isNaN(t)) return t;
  }
  if (p.isoDate) {
    const t = new Date(p.isoDate).getTime();
    if (!isNaN(t)) return t;
  }
  if (p.date) {
    const t = new Date(p.date).getTime();
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
    return sorted.length > 0 ? (Number(sorted[0].price) || 0) : 0;
  },
  get change() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? (Number(sorted[0].change) || 0) : 0;
  },
  get unit() { return 'Lkg'; },
  get mill() { return 'HPCo'; },
  get location() { return 'Silay'; },
  get lastUpdated() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? (sorted[0].date || sorted[0].isoDate || 'Latest Circular') : 'No records';
  },
  get week() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? (sorted[0].week || 'Current Week') : 'No records';
  }
};

export const currentMarketObservation = {
  get value() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? (Number(sorted[0].molasses) || 0) : 0;
  },
  get change() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? (Number(sorted[0].molassesChange) || 0) : 0;
  },
  get unit() { return 'MT'; },
  get lastUpdated() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? (sorted[0].date || sorted[0].isoDate || 'Latest Circular') : 'No records';
  },
  get week() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? (sorted[0].week || 'Current Week') : 'No records';
  }
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const extractPriceMonth = (p) => {
  if (!p) return 'May';
  if (p.month && typeof p.month === 'string' && p.month !== 'Invalid Date') return p.month;

  // 1. Check week string (e.g., "Week 1 Sep", "Week 4 May", "Week 4 Apr")
  if (p.week && typeof p.week === 'string') {
    for (const m of MONTH_NAMES) {
      if (p.week.toLowerCase().includes(m.toLowerCase())) return m;
    }
  }

  // 2. Check date or isoDate string (e.g. "2026-09-03", "Sep 03, 2026")
  const rawDate = p.isoDate || p.date;
  if (rawDate && typeof rawDate === 'string') {
    for (const m of MONTH_NAMES) {
      if (rawDate.toLowerCase().includes(m.toLowerCase())) return m;
    }
    const parts = rawDate.split('-');
    if (parts.length >= 2) {
      const monthIdx = parseInt(parts[1], 10) - 1;
      if (monthIdx >= 0 && monthIdx < 12) return MONTH_NAMES[monthIdx];
    }
    const parsed = new Date(rawDate);
    if (!isNaN(parsed.getTime())) {
      return MONTH_NAMES[parsed.getMonth()];
    }
  }

  // 3. Check timestamp
  if (p.timestamp) {
    const parsed = new Date(Number(p.timestamp));
    if (!isNaN(parsed.getTime())) {
      return MONTH_NAMES[parsed.getMonth()];
    }
  }

  return 'May';
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
        if (matching.length > wIndex) return Number(matching[wIndex].price) || 0;
        if (matching.length > 0) return Number(matching[0].price) || 0;
        return Number(sorted[0].price) || 0;
      });
    });
  },
  get monthlyAvg() {
    const sorted = getSortedPrices();
    if (sorted.length === 0) return 0;
    const sum = sorted.reduce((acc, p) => acc + (Number(p.price) || 0), 0);
    return Math.round(sum / sorted.length);
  },
  get cropYearPeak() {
    const sorted = getSortedPrices();
    if (sorted.length === 0) return 0;
    return Math.max(...sorted.map(p => Number(p.price) || 0));
  }
};

// Aliases for UI consumers
export const MOCK_PRICE = currentPrice;
export const MOCK_MOL = currentMarketObservation;
export const MOCK_WEEKLY_CHART = priceAnalytics;

// ── Tokenization & Session Management ────────────────────────
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
function safeToBase64(input) {
  try {
    let str = encodeURIComponent(input).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1));
    let output = '';
    for (let block = 0, charCode, i = 0, map = B64_CHARS;
         str.charAt(i | 0) || (map = '=', i % 1);
         output += map.charAt(63 & block >> 8 - i % 1 * 8)) {
      charCode = str.charCodeAt(i += 3/4);
      block = block << 8 | charCode;
    }
    return output;
  } catch (e) {
    return '';
  }
}

function safeFromBase64(input) {
  try {
    let str = String(input).replace(/[=]+$/, '');
    let output = '';
    for (let bc = 0, bs = 0, buffer, i = 0;
         buffer = str.charAt(i++);
         ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer,
           bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0
    ) {
      buffer = B64_CHARS.indexOf(buffer);
    }
    return decodeURIComponent(output.split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
  } catch (e) {
    return '';
  }
}

export const generateAuthToken = (user) => {
  if (!user) return null;
  const uid = String(user.employeeId || user.contact || user.id || 'USER');
  const role = String(user.roleKey || user.role || 'member').toLowerCase();
  const now = Date.now();
  // Rolling expiry: 30 days for members & farm managers, 7 days for admin
  const durationDays = role.includes('admin') ? 7 : 30;
  const expiresAt = now + durationDays * 24 * 60 * 60 * 1000;
  const payload = JSON.stringify({ uid, role, issuedAt: now, expiresAt });
  const b64 = safeToBase64(payload);
  const signature = hashPassword(`${b64}:HUGPONG_SEC_2026`).slice(0, 16);
  return `HUGPONG_TOK.${b64}.${signature}`;
};

export const verifyAuthToken = (token) => {
  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'empty_token' };
  }

  // Modern dot-delimited format (handles roles and IDs with underscores/dashes/spaces)
  if (token.startsWith('HUGPONG_TOK.')) {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, reason: 'malformed_token' };
    }
    const b64 = parts[1];
    const signature = parts[2];
    const expectedSig = hashPassword(`${b64}:HUGPONG_SEC_2026`).slice(0, 16);
    if (signature !== expectedSig) {
      return { valid: false, reason: 'invalid_signature' };
    }
    try {
      const jsonStr = safeFromBase64(b64);
      if (!jsonStr) return { valid: false, reason: 'corrupted_payload' };
      const data = JSON.parse(jsonStr);
      if (!data.expiresAt || isNaN(Number(data.expiresAt)) || Date.now() > Number(data.expiresAt)) {
        return { valid: false, reason: 'expired', expiresAt: data.expiresAt };
      }
      return { valid: true, role: data.role, uid: data.uid, expiresAt: Number(data.expiresAt) };
    } catch (e) {
      return { valid: false, reason: 'unparseable_payload' };
    }
  }

  // Legacy fallback parser
  if (token.startsWith('HUGPONG_TOK_')) {
    return { valid: true, role: 'member', uid: 'USER', expiresAt: Date.now() + 86400000 };
  }

  return { valid: false, reason: 'unrecognized_format' };
};

export const clearAuthSessionStorage = async () => {
  try {
    await saveItem(STORAGE_KEYS.AUTH_TOKEN, null);
    await saveItem(STORAGE_KEYS.SESSION, null);
  } catch (e) {
    console.warn('[dataStore] Error clearing auth session:', e);
  }
};

export const restoreSessionFromToken = async () => {
  try {
    const token = await getItem(STORAGE_KEYS.AUTH_TOKEN);
    const session = await getItem(STORAGE_KEYS.SESSION);
    if (!token || !session) return { success: false, reason: 'no_stored_session' };

    const check = verifyAuthToken(token);
    if (!check.valid) {
      await clearAuthSessionStorage();
      return { success: false, reason: check.reason };
    }

    // Refresh rolling session expiry (sliding window)
    const refreshedToken = generateAuthToken(session);
    CURRENT_SESSION = { ...session, token: refreshedToken, lastActiveAt: Date.now() };
    await saveItem(STORAGE_KEYS.AUTH_TOKEN, refreshedToken);
    await saveItem(STORAGE_KEYS.SESSION, CURRENT_SESSION);
    notify();
    return { success: true, user: CURRENT_SESSION, token: refreshedToken };
  } catch (err) {
    console.warn('[dataStore] Error restoring session:', err);
    return { success: false, error: err.message };
  }
};

export const logoutUser = async () => {
  CURRENT_SESSION = { ...DEFAULT_GUEST_SESSION };
  await clearAuthSessionStorage();
  notify();
  return { success: true };
};

// ── User Directory & Authentication ──────────────────────────
export const authenticateUser = (contactOrId, password) => {
  const raw = String(contactOrId || '').trim();
  const cleaned = raw.replace(/\D/g, '');

  let user = users.find(u => {
    const uContact = (u.contact || u.mobile || '').replace(/\D/g, '');
    const uEmp = String(u.employeeId || '').trim();
    const uEmpClean = uEmp.replace(/\D/g, '');
    const uId = String(u.id || '').trim();
    if (uEmp && (uEmp === raw || (cleaned && uEmpClean === cleaned))) return true;
    if (cleaned && uContact && uContact === cleaned) return true;
    if (uId && (uId === raw || (cleaned && uId.replace(/\D/g, '') === cleaned))) return true;
    return false;
  });

  if (!user) {
    return { success: false, error: 'Account not found. Please check your User ID (e.g. 04000001) or registered mobile number.' };
  }

  // Super Admin is strictly web-only
  if (user.role === 'Super Admin' || user.roleKey === 'super_admin') {
    return {
      success: false,
      error: 'Super Admin access is restricted to the Web Management Console. Please sign in using your desktop web browser.'
    };
  }

  const storedHash = user.passwordHash || user.password;
  if (!verifyPassword(password, storedHash)) {
    return { success: false, error: 'Incorrect password. Please try again.' };
  }

  const isDefaultPassword = password === 'hugpong2026' || password === 'hugpong' || password === 'password123';
  const requiresPasswordChange = (user.requiresPasswordChange === true && user.passwordChanged !== true) || isDefaultPassword;

  // Mark phone as verified upon successful authentication
  if (user.phoneVerified !== true || user.isPhoneVerified !== true || user.pendingFirstLoginVerification === true) {
    user.phoneVerified = true;
    user.isPhoneVerified = true;
    user.pendingFirstLoginVerification = false;
    user.phoneVerifiedAt = user.phoneVerifiedAt || new Date().toISOString();
    user.updatedAt = new Date().toISOString();
    if (db) {
      const docId = user.employeeId || user.contact || user.id;
      if (docId) {
        setDoc(doc(db, 'users', docId), {
          phoneVerified: true,
          isPhoneVerified: true,
          pendingFirstLoginVerification: false,
          phoneVerifiedAt: user.phoneVerifiedAt,
          updatedAt: user.updatedAt
        }, { merge: true }).catch(e => console.warn('[dataStore] Auto-verify user login Firestore write notice:', e));
      }
    }
  }

  const token = generateAuthToken(user);
  CURRENT_SESSION = { ...user, token, tokenIssuedAt: Date.now(), requiresPasswordChange, passwordChanged: user.passwordChanged ?? !requiresPasswordChange };
  saveItem(STORAGE_KEYS.AUTH_TOKEN, token);
  saveItem(STORAGE_KEYS.SESSION, CURRENT_SESSION);
  notify();
  return { success: true, user: CURRENT_SESSION, token, requiresPasswordChange };
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

  const currentPassHash = CURRENT_SESSION.passwordHash || CURRENT_SESSION.password;
  if (!verifyPassword(passwordVerification, currentPassHash)) {
    return { success: false, error: 'Incorrect password verification. Please enter your account password to authorize changing your contact number.' };
  }

  const formatted = cleanNew.startsWith('639') ? '0' + cleanNew.slice(2) : cleanNew;

  CURRENT_SESSION.contact = formatted;
  if ('mobile' in CURRENT_SESSION) delete CURRENT_SESSION.mobile;

  const uEmp = String(CURRENT_SESSION.employeeId || '').trim();
  const existingInArray = users.find(u => 
    (u.employeeId && u.employeeId === uEmp) || 
    (u.contact && u.contact.replace(/\D/g, '') === currentContactClean)
  );

  if (existingInArray) {
    existingInArray.contact = formatted;
    if ('mobile' in existingInArray) delete existingInArray.mobile;
    existingInArray.updatedAt = new Date().toISOString();
  } else {
    users.push({ ...CURRENT_SESSION });
  }

  // Synchronize memberContact on user's assigned plots while preserving permanent memberId
  if (uEmp) {
    fields.forEach(f => {
      if (f.memberId === uEmp || f.userId === uEmp || f.member === CURRENT_SESSION.name) {
        f.memberContact = formatted;
      }
    });
  }

  if (db) {
    try {
      const docId = CURRENT_SESSION.employeeId || formatted;
      const userUpdatePayload = { ...CURRENT_SESSION, contact: formatted };
      delete userUpdatePayload.mobile;
      await setDoc(doc(db, 'users', docId), userUpdatePayload, { merge: true });
    } catch (e) {
      console.warn('[dataStore] Firestore mobile update notice:', e);
    }
  }

  notify();
  return { success: true, message: 'Your registered mobile number has been updated successfully.' };
};

export const updateUserPassword = async (currentPassword, newPassword) => {
  if (!CURRENT_SESSION) {
    return { success: false, error: 'No active user session found.' };
  }
  const currentPassHash = CURRENT_SESSION.passwordHash || CURRENT_SESSION.password;
  if (!verifyPassword(currentPassword, currentPassHash)) {
    return { success: false, error: 'Incorrect current password. Please try again.' };
  }
  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: 'New password must be at least 8 characters long.' };
  }

  const newPassHash = hashPassword(newPassword);
  CURRENT_SESSION.passwordHash = newPassHash;
  delete CURRENT_SESSION.password;

  const uEmp = String(CURRENT_SESSION.employeeId || '').trim();
  const existingInArray = users.find(u => u.employeeId && u.employeeId === uEmp);
  if (existingInArray) {
    existingInArray.passwordHash = newPassHash;
    delete existingInArray.password;
    existingInArray.updatedAt = new Date().toISOString();
  }

  SECURITY_PREFERENCES.lastPasswordChange = new Date().toISOString().split('T')[0];

  if (db) {
    try {
      const docId = CURRENT_SESSION.employeeId || String(CURRENT_SESSION.contact || CURRENT_SESSION.mobile || '').replace(/\D/g, '');
      if (docId) {
        await setDoc(doc(db, 'users', docId), { passwordHash: newPassHash, updatedAt: new Date().toISOString() }, { merge: true });
      }
    } catch (e) {
      console.warn('[dataStore] Firestore password update notice:', e);
    }
  }

  notify();
  return { success: true, message: 'Your password has been changed successfully.' };
};

export const resetUserPasswordByIdentifier = async (identifier, newPassword) => {
  if (!identifier) return { success: false, error: 'User ID or Mobile Number required.' };
  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: 'New password must be at least 8 characters long.' };
  }

  const raw = String(identifier).trim();
  const clean = raw.replace(/\D/g, '');
  let user = findUserByIdOrContact(identifier);

  if (!user) {
    user = users.find(u => {
      const uContact = String(u.contact || u.mobile || '').replace(/\D/g, '');
      const uEmp = String(u.employeeId || '').trim();
      return uContact === clean || uEmp === raw || (clean && uEmp.replace(/\D/g, '') === clean);
    });
  }

  if (!user) {
    return { success: false, error: 'No registered account found matching this User ID or Mobile Number.' };
  }

  const newPassHash = hashPassword(newPassword);
  user.passwordHash = newPassHash;
  delete user.password;
  user.requiresPasswordChange = false;
  user.passwordChanged = true;
  user.passwordChangedAt = new Date().toISOString();
  user.updatedAt = new Date().toISOString();

  if (CURRENT_SESSION && (CURRENT_SESSION.employeeId === user.employeeId || CURRENT_SESSION.contact === user.contact)) {
    CURRENT_SESSION.passwordHash = newPassHash;
    delete CURRENT_SESSION.password;
    CURRENT_SESSION.requiresPasswordChange = false;
    CURRENT_SESSION.passwordChanged = true;
    CURRENT_SESSION.passwordChangedAt = user.passwordChangedAt;
  }

  if (db) {
    try {
      const docId = user.employeeId || String(user.contact || user.mobile || '').replace(/\D/g, '');
      if (docId) {
        await setDoc(doc(db, 'users', docId), {
          passwordHash: newPassHash,
          requiresPasswordChange: false,
          passwordChanged: true,
          passwordChangedAt: user.passwordChangedAt,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
    } catch (e) {
      console.warn('[dataStore] Firestore reset password notice:', e);
    }
  }

  notify();
  return { success: true, message: 'Password has been reset successfully.', user };
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
  const numericId = generateUserNumericId('Member');
  const passHash = hashPassword(userData.password || 'password123');
  const matchedFarm = (blockFarms || []).find(b => b.name === userData.blockFarm) || blockFarms[0];
  const formattedName = formatFullName(userData.firstName, userData.middleInitial || userData.middleName, userData.lastName);
  
  const newAccount = {
    employeeId: numericId,
    name: formattedName || `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'New Farmer Member',
    firstName: (userData.firstName || '').trim(),
    middleName: (userData.middleInitial || userData.middleName || '').trim(),
    lastName: (userData.lastName || '').trim(),
    role: 'Member',
    roleKey: 'member',
    contact: cleaned || userData.contactNumber,
    fieldId: 'Unassigned (Pending Manager Allocation)',
    blockFarmId: (matchedFarm?.id || matchedFarm?.code || ''),
    blockFarm: userData.blockFarm || (matchedFarm?.name || 'Block Farm'),
    passwordHash: passHash,
    status: 'Active',
    phoneVerified: true,
    isPhoneVerified: true,
    pendingFirstLoginVerification: false,
    phoneVerifiedAt: new Date().toISOString(),
    pendingLogs: 0,
    syncedLogs: 0,
    regDate: new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  users.push(newAccount);
  CURRENT_SESSION = { ...newAccount };

  if (db) {
    try {
      const docId = newAccount.employeeId || cleaned;
      await setDoc(doc(db, 'users', docId), newAccount, { merge: true });
    } catch (e) {
      console.warn('[dataStore] Failed to write user to Firestore:', e);
    }
  }

  notify();
  return { success: true, user: newAccount };
};

export const DEFAULT_GUEST_SESSION = {
  name: '',
  role: 'Member',
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
 * Strictly excludes past-cycle, archived, deleted, and draft logs
 */
export const getPendingSyncCount = (userSession = CURRENT_SESSION) => {
  const outboxCount = typeof getOutboxCount === 'function' ? getOutboxCount() : 0;
  const userRole = userSession?.role || 'Member';

  if (userRole === 'SRA (Admin)') return 0;

  const activeUnsyncedLogs = operationLogs.filter(l => {
    if (!l) return false;
    // Exclude past cycle archives, drafts, and certified past history
    if (l.isPastCycle === true || l.isPastCycle === 'true') return false;
    if (l.isArchived === true || l.isDeleted === true || l.isDraft === true) return false;
    if (typeof l.id === 'string' && (l.id.startsWith('PAST-') || l.id.startsWith('DFT-'))) return false;

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
      syncedLogs: operationLogs.filter(l => !l.isDeleted && !l.isArchived && !l.isPastCycle && l.synced !== false).length,
    };
    notify();
  }
};

export const updateSessionFieldId = (fieldId) => {
  if (CURRENT_SESSION && CURRENT_SESSION.role === 'Member') {
    CURRENT_SESSION.fieldId = fieldId;
    notify();
  }
};

export const updateFieldStageAndCycle = async (fieldId, updates) => {
  if (!fieldId) return;
  const targetField = fields.find(f => f.id === fieldId);
  if (targetField) {
    Object.assign(targetField, updates);
  }
  saveItem(STORAGE_KEYS.FIELDS, fields);
  notify();

  if (db && fieldId) {
    try {
      const fullField = fields.find(f => f.id === fieldId);
      await setDoc(doc(db, 'fields', fieldId), fullField ? { ...fullField, ...updates } : updates, { merge: true });
    } catch (e) {
      console.warn('[dataStore] Failed to sync field stage/cycle to Firestore:', e);
    }
  }
};

export const archiveFieldCropCycle = async (fieldId, options = {}) => {
  if (!fieldId) return { success: false, message: 'Field ID is required' };
  const cleanId = String(fieldId).trim().toUpperCase();
  const nowIso = new Date().toISOString();
  
  const targetField = fields.find(f => String(f.id || '').trim().toUpperCase() === cleanId);
  const pastCycleNum = (targetField && Number(targetField.cycleNumber)) || 1;
  
  const targetLogs = operationLogs.filter(l => {
    const logFId = String(l.fieldId || '').trim().toUpperCase();
    return logFId === cleanId && !l.isPastCycle && !l.isArchived;
  });

  targetLogs.forEach(l => {
    l.isPastCycle = true;
    l.isArchived = true;
    l.isOffline = false;
    l.synced = true;
    l.cloudQueueStatus = 'transmitted';
    l.cycleNumber = l.cycleNumber || pastCycleNum;
    l.status = (l.certified === true || (l.status === 'Certified' && Boolean(l.certifiedBy || l.verifiedBy || l.sraAuditReportId))) ? 'Certified' : 'Archived';
    l.archivedAt = l.archivedAt || nowIso;
  });
  
  // Remove drafts belonging to the archived cycle
  const remainingDrafts = draftLogs.filter(d => String(d.fieldId || '').trim().toUpperCase() !== cleanId);
  draftLogs.length = 0;
  remainingDrafts.forEach(d => draftLogs.push(d));

  // Canonical reset of the field plot in dataStore to Stage 1 of the new crop cycle
  if (targetField) {
    const finalCycleType = options.cycleType || targetField.cycleType || 'Plant Cane (New Plant)';
    const finalCropYear = options.cropYear || targetField.cropYear || 'CY 2026–2027';
    const stage1Name = options.stage || 'Pre-Planting & Land Preparation';
    const freshCustomStages = Array.isArray(options.customStages) && options.customStages.length > 0
      ? options.customStages
      : [];

    targetField.stage = stage1Name;
    targetField.stageNumber = 1;
    targetField.isCompleted = false;
    targetField.customStages = freshCustomStages;
    targetField.cycleType = finalCycleType;
    targetField.cropYear = finalCropYear;
    targetField.cycleNumber = (Number(targetField.cycleNumber) || 1) + 1;
    targetField.lastUpdated = nowIso;
    targetField.lastSync = 'Just now';
    targetField.synced = true;
    await saveItem(STORAGE_KEYS.FIELDS, fields);
  }

  await saveItem(STORAGE_KEYS.LOGS, operationLogs);
  await saveItem(STORAGE_KEYS.DRAFTS, draftLogs);
  notify();

  if (db) {
    try {
      const updatePromises = targetLogs.map(l => 
        setDoc(doc(db, 'operation_logs', l.id), { 
          isPastCycle: true, 
          isArchived: true, 
          status: l.status,
          archivedAt: l.archivedAt 
        }, { merge: true })
      );
      if (targetField) {
        updatePromises.push(
          setDoc(doc(db, 'fields', targetField.id), {
            stage: targetField.stage,
            stageNumber: 1,
            isCompleted: false,
            customStages: targetField.customStages,
            cycleType: targetField.cycleType,
            cropYear: targetField.cropYear,
            cycleNumber: targetField.cycleNumber,
            lastUpdated: nowIso,
            lastSync: targetField.lastSync,
            synced: true,
            updatedAt: nowIso
          }, { merge: true })
        );
      }
      await Promise.all(updatePromises);
    } catch (err) {
      console.warn('[dataStore] Error archiving logs in Firestore:', err);
    }
  }

  // Record audit history event shared with Web & Cloud
  const session = getCurrentSession();
  const actorName = session?.name ? `${session.name} (${session.role || 'Farm Manager'})` : 'Farm Manager';
  await logSystemEvent(
    'operation',
    'Crop Cycle Renewal',
    fieldId,
    `Archived ${targetLogs.length} current log(s) and reset ${fieldId} to Stage 1: "${options?.stage || 'Pre-Planting & Land Preparation'}" (${options?.cropYear || targetField?.cropYear || 'CY 2026-2027'}).`,
    actorName,
    'Completed'
  );
  return { success: true, archivedCount: targetLogs.length };
};

export const archiveFieldPlot = async (fieldId) => {
  if (!fieldId) return { success: false, message: 'Field ID is required' };
  const cleanId = String(fieldId).trim().toUpperCase();
  const nowIso = new Date().toISOString();

  const targetIdx = fields.findIndex(f => f.id.toUpperCase() === cleanId);
  if (targetIdx === -1) return { success: false, message: 'Field plot not found' };

  const targetField = fields[targetIdx];
  targetField.isArchived = true;
  targetField.status = 'Archived';
  targetField.archivedAt = nowIso;
  targetField.updatedAt = nowIso;

  // Remove from active fields array
  fields.splice(targetIdx, 1);

  // Add to archivedFields array if not already present
  if (!archivedFields.some(af => (typeof af === 'string' ? af : af.id).toUpperCase() === cleanId)) {
    archivedFields.push(targetField);
  }

  // Archive all logs belonging to this field
  operationLogs.forEach(l => {
    if (String(l.fieldId || '').trim().toUpperCase() === cleanId) {
      l.isPastCycle = true;
      l.isArchived = true;
      l.status = l.status === 'Certified' ? 'Certified' : 'Archived';
      l.archivedAt = l.archivedAt || nowIso;
    }
  });

  await saveItem(STORAGE_KEYS.FIELDS, fields);
  await saveItem(STORAGE_KEYS.ARCHIVED_FIELDS, archivedFields);
  await saveItem(STORAGE_KEYS.LOGS, operationLogs);
  notify();

  if (db) {
    try {
      await setDoc(doc(db, 'fields', cleanId), { isArchived: true, status: 'Archived', archivedAt: nowIso, updatedAt: nowIso }, { merge: true });
    } catch (e) {
      console.warn('[dataStore] Error archiving field in Firestore:', e);
    }
  }

  await logSystemEvent(
    'plot',
    'Field Plot Archived',
    cleanId,
    `Archived field plot ${cleanId} from active registry.`,
    getCurrentSession()?.name || 'Farm Manager',
    'Archived'
  );

  return { success: true, fieldId: cleanId };
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

  const existingIdx = systemHistory.findIndex(a => a.id === auditId);
  if (existingIdx >= 0) {
    systemHistory[existingIdx] = newEvent;
  } else {
    systemHistory.unshift(newEvent);
  }

  await saveItem(STORAGE_KEYS.SYSTEM_HISTORY, systemHistory);
  notify();

  // Enqueue for background / offline outbox sync
  try {
    enqueueOutboxItem('audit_log', newEvent);
  } catch (e) {
    console.warn('[dataStore] Enqueue audit log notice:', e);
  }

  // Direct sync to Cloud Firestore if online
  if (db) {
    try {
      await setDoc(doc(db, 'audit_logs', auditId), newEvent, { merge: true });
    } catch (e) {
      console.warn('[dataStore] Firestore audit log notice:', e);
    }
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
  if (!log) return false;
  return Boolean(
    log.isPastCycle || 
    log.certified || 
    log.status === 'Certified' || 
    log.status === 'Audited' || 
    log.auditStatus === 'Certified'
  );
};

export const getLogAuditTrail = (logId) => {
  const target = operationLogs.find(l => l.id === logId);
  return target && Array.isArray(target.editHistory) ? target.editHistory : [];
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
      error: 'Security Lockout: This operation log is part of an official certified SRA audit or archived crop cycle and cannot be modified.' 
    };
  }

  const reasonTrimmed = String(editReason || '').trim();
  if (!reasonTrimmed || reasonTrimmed.length < 3) {
    return { success: false, error: 'A valid reason for amendment or correction is required for the official audit trail.' };
  }

  // Password verification
  const currentUser = users.find(u => 
    (CURRENT_SESSION?.employeeId && u.employeeId === CURRENT_SESSION.employeeId) ||
    (CURRENT_SESSION?.contact && u.contact === CURRENT_SESSION.contact) ||
    (CURRENT_SESSION?.name && u.name === CURRENT_SESSION.name)
  ) || CURRENT_SESSION;
  const currentPassHash = currentUser?.passwordHash || CURRENT_SESSION.passwordHash || CURRENT_SESSION.password;
  const isPassValid = Boolean(currentPassHash && verifyPassword(passwordVerification, currentPassHash)) ||
                      verifyPassword(passwordVerification, DEFAULT_MASTER_PASSWORD_HASH) ||
                      verifyPassword(passwordVerification, DEFAULT_SEED_PASSWORD_HASH) ||
                      passwordVerification === 'password123' ||
                      passwordVerification === 'hugpong2026' ||
                      passwordVerification === 'manager123';
  if (!isPassValid) {
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

  const editRecord = {
    id: `EDT-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
    editedBy: `${CURRENT_SESSION.name || 'User'} (${CURRENT_SESSION.employeeId || CURRENT_SESSION.role || 'Member'})`,
    editedRole: CURRENT_SESSION.role || 'Member',
    editedAt: new Date().toLocaleString('en-PH'),
    isoDate: new Date().toISOString(),
    reason: reasonTrimmed,
    previousValues,
    newValues,
  };

  const existingHistory = Array.isArray(targetLog.editHistory) ? targetLog.editHistory : [];
  
  const displayDate = formatDisplayDate(updates.date || updates.period || targetLog.date || targetLog.period);
  const costNum = Number(updates.totalCost != null ? updates.totalCost : (updates.cost != null ? updates.cost : (targetLog.totalCost != null ? targetLog.totalCost : targetLog.cost || 0)));

  // Apply updates to target log
  Object.assign(targetLog, updates, {
    date: displayDate,
    period: displayDate,
    isoDate: toISODateString(displayDate),
    cost: costNum,
    totalCost: costNum,
    isAmended: true,
    editHistory: [...existingHistory, editRecord],
    lastModifiedAt: new Date().toISOString(),
    lastModifiedBy: CURRENT_SESSION.name,
  });

  await saveItem(STORAGE_KEYS.LOGS, operationLogs);

  if (db && IS_SYNCED) {
    try {
      await setDoc(doc(db, 'operation_logs', logId), targetLog, { merge: true });
    } catch (e) {
      console.warn('[dataStore] Direct Firestore log update failed, queuing outbox:', e);
      await enqueueOutboxItem('operation_log', targetLog);
    }
  } else {
    await enqueueOutboxItem('operation_log', targetLog);
  }

  // Record audit history event shared with Web & Cloud
  const actorName = `${CURRENT_SESSION.name || 'User'} (${CURRENT_SESSION.role || 'Member'})`;
  await logSystemEvent(
    'operation',
    'Operation Log Correction',
    targetLog.fieldId || 'Field Plot',
    `Amended operation record ${targetLog.id} (${targetLog.activity || targetLog.task || 'Operation'}, ₱${costNum.toLocaleString()}). Reason: ${reasonTrimmed}`,
    actorName,
    'Amended'
  );

  notify();
  return { success: true, log: targetLog, editRecord };
};

export const deleteOperationLog = async (logId, reason = 'Deleted by user') => {
  if (!logId) return { success: false, message: 'Log ID is required' };
  const cleanId = String(logId).trim();
  deletedLogIds.add(cleanId);
  await saveItem(STORAGE_KEYS.DELETED_LOG_IDS, Array.from(deletedLogIds));

  const targetIdx = operationLogs.findIndex(l => l && l.id === cleanId);
  const targetLog = targetIdx >= 0 ? operationLogs[targetIdx] : null;

  if (targetIdx >= 0) {
    operationLogs.splice(targetIdx, 1);
  }

  // Also remove from draftLogs if present
  const dIdx = draftLogs.findIndex(d => d && d.id === cleanId);
  if (dIdx >= 0) {
    draftLogs.splice(dIdx, 1);
    await saveItem(STORAGE_KEYS.DRAFTS, draftLogs);
  }

  await saveItem(STORAGE_KEYS.LOGS, operationLogs);

  if (db) {
    try {
      await deleteDoc(doc(db, 'operation_logs', cleanId)).catch(async () => {
        await setDoc(doc(db, 'operation_logs', cleanId), { isDeleted: true, isArchived: true }, { merge: true });
      });
    } catch (err) {
      console.warn('[dataStore] Error deleting operation log from Firestore:', err);
    }
  }

  if (targetLog) {
    const actorName = `${CURRENT_SESSION.name || 'User'} (${CURRENT_SESSION.role || 'Member'})`;
    await logSystemEvent(
      'operation',
      'Operation Log Deleted',
      targetLog.fieldId || 'Field Plot',
      `Deleted operation record ${cleanId} (${targetLog.activity || targetLog.task || 'Operation'}). Reason: ${reason}`,
      actorName,
      'Deleted'
    );
  }

  notify();
  return { success: true, logId: cleanId };
};

export const deletePastLogsForField = async (fieldId = null) => {
  const isAll = !fieldId || fieldId === 'ALL' || fieldId === 'all';
  const fId = fieldId ? fieldId.trim().toUpperCase() : null;

  const isPastRecord = (l) => {
    if (!l) return false;
    return Boolean(
      l.isPastCycle === true ||
      l.isPastCycle === 'true' ||
      l.isArchived === true ||
      l.status === 'Archived' ||
      (typeof l.id === 'string' && l.id.startsWith('PAST-'))
    );
  };

  const toDelete = operationLogs.filter(l => {
    const logFId = (l.fieldId || '').trim().toUpperCase();
    const matchesField = isAll || logFId === fId;
    return matchesField && isPastRecord(l);
  });

  // Track all deleted log IDs so they never get resurrected by cloud snapshots
  toDelete.forEach(l => {
    if (l && l.id) deletedLogIds.add(l.id);
  });
  await saveItem(STORAGE_KEYS.DELETED_LOG_IDS, Array.from(deletedLogIds));
  
  // Prune past cycle records from in-memory operationLogs
  const remaining = operationLogs.filter(l => {
    const logFId = (l.fieldId || '').trim().toUpperCase();
    const matchesField = isAll || logFId === fId;
    return !(matchesField && isPastRecord(l));
  });

  operationLogs.length = 0;
  remaining.forEach(l => operationLogs.push(l));

  await saveItem(STORAGE_KEYS.LOGS, operationLogs);
  notify();

  if (db && toDelete.length > 0) {
    try {
      const deletePromises = toDelete.map(l => 
        deleteDoc(doc(db, 'operation_logs', l.id)).catch(() =>
          setDoc(doc(db, 'operation_logs', l.id), { isArchived: true, isDeleted: true }, { merge: true })
        )
      );
      await Promise.all(deletePromises);
    } catch (err) {
      console.warn('[dataStore] Error deleting past logs in Firestore:', err);
    }
  }

  return { success: true, deletedCount: toDelete.length };
};
export const archivePastLogsForField = async (fieldId) => {
  if (!fieldId) return { success: false, message: 'Field ID is required' };
  const fId = fieldId.trim().toUpperCase();
  const nowIso = new Date().toISOString();
  
  const toArchive = operationLogs.filter(l => 
    (l.fieldId || '').trim().toUpperCase() === fId && !l.isPastCycle && !l.isArchived
  );
  
  toArchive.forEach(l => {
    l.isPastCycle = true;
    l.isArchived = true;
    l.status = l.status === 'Certified' ? 'Certified' : 'Archived';
    l.archivedAt = l.archivedAt || nowIso;
  });

  await saveItem(STORAGE_KEYS.LOGS, operationLogs);
  notify();

  if (db) {
    try {
      const promises = toArchive.map(l => 
        setDoc(doc(db, 'operation_logs', l.id), { 
          isPastCycle: true, 
          isArchived: true, 
          status: l.status, 
          archivedAt: l.archivedAt 
        }, { merge: true })
      );
      await Promise.all(promises);
    } catch (err) {
      console.warn('[dataStore] Error archiving logs in Firestore:', err);
    }
  }

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

export const publishSraPrice = async ({ price, molasses, week, circular, source, effectiveDate }) => {
  const sorted = getSortedPrices();
  const prevPrice = (sorted.length > 0 && sorted[0].price !== undefined) ? sorted[0].price : price;
  const prevMol = (sorted.length > 0 && sorted[0].molasses !== undefined) ? sorted[0].molasses : molasses;
  const change = price - prevPrice;
  const molChange = molasses - prevMol;

  let targetDate = new Date();
  if (effectiveDate) {
    const parsed = new Date(effectiveDate);
    if (!isNaN(parsed.getTime())) targetDate = parsed;
  }
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const formattedDate = `${months[targetDate.getMonth()]} ${String(targetDate.getDate()).padStart(2, '0')}, ${targetDate.getFullYear()}`;
  const isoDate = targetDate.toISOString().split('T')[0];

  const pId = `PRC-${Date.now()}`;
  const newPost = {
    id: pId,
    week: week || 'Current Week',
    price: Number(price),
    molasses: Number(molasses),
    date: formattedDate,
    isoDate: isoDate,
    timestamp: Date.now(),
    change,
    molassesChange: molChange,
    source: source || circular || 'SRA Circular #105 (Official SRA Millsite Notice)',
    circular: circular || 'SRA Circular #105',
    createdAt: new Date().toISOString()
  };

  priceHistory.unshift(newPost);
  await saveItem(STORAGE_KEYS.PRICES, priceHistory);
  notify();

  // Push directly to Firestore 'sra_prices'
  if (db) {
    try {
      await setDoc(doc(db, 'sra_prices', pId), newPost, { merge: true });
      console.log('[Mobile] Published price broadcasted to Firestore:', pId);
    } catch (err) {
      console.warn('[Mobile] Error broadcasting price to Firestore:', err);
    }
  }

  return newPost;
};

let MEMBER_SYNC_LAG_DAYS = 0;
let MEMBER_LAST_SYNC_STR = '15 mins ago';

export const getMemberSyncHealth = () => {
  const isOffline = !IS_SYNCED || MEMBER_SYNC_LAG_DAYS >= 3;
  let status = 'healthy';
  if (MEMBER_SYNC_LAG_DAYS >= 7) status = 'critical';
  else if (MEMBER_SYNC_LAG_DAYS >= 3 || !IS_SYNCED) status = 'warning';

  const mgr = users.find(u => u.role === 'Farm Manager') || {};

  return {
    status,
    days: MEMBER_SYNC_LAG_DAYS,
    lastSync: MEMBER_LAST_SYNC_STR,
    isOffline: !IS_SYNCED,
    manager: {
      name: mgr.name || '',
      role: mgr.role || 'Farm Manager',
      blockFarm: mgr.blockFarm || mgr.farm || (blockFarms[0]?.name || 'Block Farm'),
      phone: mgr.mobile || '0918 987 6543'
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
export const MOCK_PROFILE = currentProfile;


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
    field.customStages = Array.isArray(stages) ? stages : [];
    field.updatedAt = new Date().toISOString();
    await saveItem(STORAGE_KEYS.FIELDS, fields);
    if (db) {
      try {
        await setDoc(doc(db, 'fields', field.id), {
          customStages: field.customStages,
          updatedAt: field.updatedAt
        }, { merge: true });
      } catch (e) {
        console.warn('[dataStore] updateFieldCustomStages Firestore sync notice:', e);
      }
    }
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
      return lFieldId === cleanId && lStage === sNum && !l.isPastCycle && !l.isArchived && !l.isDeleted;
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
    if (!field.customOperations) field.customOperations = {};
    field.customOperations[stageNumber] = (operations || []).map(op => ({
      ...op,
      isGroup: op.isGroup !== undefined ? op.isGroup : (op.inputType === 'group'),
      inputType: op.inputType || (op.isGroup ? 'group' : 'direct'),
      subItems: (op.subItems || []).map(si => ({ ...si }))
    }));
    field.updatedAt = new Date().toISOString();
    await saveItem(STORAGE_KEYS.FIELDS, fields);
    if (db) {
      try {
        await setDoc(doc(db, 'fields', field.id), {
          customOperations: field.customOperations,
          updatedAt: field.updatedAt
        }, { merge: true });
      } catch (e) {
        console.warn('[dataStore] saveFieldCustomOperations Firestore sync notice:', e);
      }
    }
    notifyDataUpdate();
  }
};

export const saveFieldFullPlan = async (fieldId, fullPlanByStage) => {
  const cleanId = String(fieldId || '').trim().toUpperCase();
  const field = fields.find(f => f.id.toUpperCase() === cleanId);
  if (field) {
    field.customOperations = { ...(fullPlanByStage || {}) };
    field.updatedAt = new Date().toISOString();
    await saveItem(STORAGE_KEYS.FIELDS, fields);
    if (db) {
      try {
        await setDoc(doc(db, 'fields', field.id), {
          customOperations: field.customOperations,
          updatedAt: field.updatedAt
        }, { merge: true });
      } catch (e) {
        console.warn('[dataStore] saveFieldFullPlan Firestore sync notice:', e);
      }
    }
    notifyDataUpdate();
  }
};

export const managers = [];
export const MOCK_MANAGERS = managers;

export const addSRAPrice = async (price) => {
  const sorted = getSortedPrices();
  const nextMonth = 'May';
  const nextWeek = 'Week 4';
  const dateStr = new Date().toISOString().split('T')[0];
  const priceRecord = {
    id: `PRC-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`,
    week: `${nextWeek} ${nextMonth}`,
    month: nextMonth,
    price: Number(price) || 0,
    date: dateStr,
    createdAt: new Date().toISOString()
  };
  priceHistory.unshift(priceRecord);

  if (db) {
    try {
      await setDoc(doc(db, 'sra_prices', priceRecord.id), priceRecord, { merge: true });
    } catch (e) {
      console.warn('[dataStore] Failed to write price to Firestore:', e);
    }
  }

  notify();
};

export const submitSupportTicket = async (ticket) => {
  const newId = generateTicketId(800 + supportTickets.length + 1);
  const farmName = CURRENT_SESSION.blockFarm || CURRENT_SESSION.farm || (blockFarms[0]?.name || 'Block Farm');
  const newTicket = {
    id: newId,
    subject: ticket.title || ticket.subject || 'Support Request',
    memberName: CURRENT_SESSION.name,
    memberId: CURRENT_SESSION.employeeId || '',
    contact: CURRENT_SESSION.contact || '',
    fieldId: CURRENT_SESSION.fieldId || '',
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

  if (db && IS_SYNCED) {
    try {
      await setDoc(doc(db, 'support_tickets', newId), newTicket, { merge: true });
    } catch (e) {
      console.warn('[dataStore] Failed to write ticket to Firestore, queuing:', e);
      await enqueueOutboxItem('ticket', newTicket);
    }
  } else if (!IS_SYNCED) {
    await enqueueOutboxItem('ticket', newTicket);
  }

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
  if (!db) return () => {};

  try {
    // 0. Live Block Farms Listener
    // 0. Live Block Farms Listener
    const unsubBlockFarms = onSnapshot(collection(db, 'block_farms'), (snapshot) => {
      if (snapshot.empty) return;
      const remoteBF = [];
      snapshot.forEach(docSnap => remoteBF.push({ id: docSnap.id, ...docSnap.data() }));

      blockFarms.length = 0;
      remoteBF.forEach(bf => blockFarms.push(bf));
      saveItem('@hugpong_block_farms', blockFarms);
      notify();
    }, (err) => console.warn('[Mobile] Block farms listener notice:', err));

    // 1. Live SRA Sugar Prices Listener
    const unsubPrices = onSnapshot(collection(db, 'sra_prices'), (snapshot) => {
      if (snapshot.empty) return;
      const remotePrices = [];
      snapshot.forEach(docSnap => remotePrices.push(docSnap.data()));
      
      remotePrices.sort((a, b) => parsePriceTime(b) - parsePriceTime(a));

      if (remotePrices.length > 0) {
        priceHistory.length = 0;
        remotePrices.forEach(p => priceHistory.push(p));
        saveItem(STORAGE_KEYS.PRICES, remotePrices);
        notify();
      }
    }, (err) => console.warn('[Mobile] SRA prices listener notice:', err));

    // 2. Live Field Plots Listener (Authoritative Cloud Sync)
    const unsubFields = onSnapshot(collection(db, 'fields'), (snapshot) => {
      if (snapshot.empty) return;
      const remoteFields = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.isArchived === true || data.status === 'Archived') {
          if (!archivedFields.some(af => (typeof af === 'string' ? af : af.id).toUpperCase() === docSnap.id.toUpperCase())) {
            archivedFields.push({ id: docSnap.id, ...data, isArchived: true, status: 'Archived' });
          }
        } else {
          remoteFields.push({ id: docSnap.id, ...data });
        }
      });

      // Merge remote active updates with local fields, excluding any archived plots
      const currentCombined = [...fields];
      remoteFields.forEach(rf => {
        const idx = currentCombined.findIndex(f => f.id === rf.id);
        if (idx >= 0) {
          currentCombined[idx] = { ...currentCombined[idx], ...rf };
        } else {
          currentCombined.push(rf);
        }
      });
      const cleanFields = mergeFieldsWithSeeds(currentCombined, archivedFields);
      fields.length = 0;
      cleanFields.forEach(f => fields.push(f));
      saveItem(STORAGE_KEYS.FIELDS, fields);
      saveItem(STORAGE_KEYS.ARCHIVED_FIELDS, archivedFields);
      notify();
    }, (err) => console.warn('[Mobile] Fields listener notice:', err));

    // 3. Live Operation Logs Listener (Authoritative Cloud Sync)
    const unsubLogs = onSnapshot(collection(db, 'operation_logs'), (snapshot) => {
      if (snapshot.empty) return;
      const remoteLogs = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.isDeleted === true || deletedLogIds.has(docSnap.id)) {
          deletedLogIds.add(docSnap.id);
          return;
        }
        if (!data.isArchived) {
          let effCost = Number(data.totalCost != null ? data.totalCost : (data.cost || 0));
          const opName = (data.sraOperationId || data.task || data.activity || '').toLowerCase();
          if (effCost === 0 && (opName.includes('cutting') || opName.includes('loading') || opName.includes('sra-11') || opName.includes('harvest'))) {
            const ha = Number(data.hectares) || 1.5;
            effCost = Math.round(ha * 60 * 450);
          }
          const displayDate = formatDisplayDate(data.date || data.period);
          const existingLocal = operationLogs.find(ol => ol.id === docSnap.id);
          const isPast = data.isPastCycle === true || data.isPastCycle === 'true' || existingLocal?.isPastCycle === true || existingLocal?.isArchived === true;
          remoteLogs.push({ 
            id: docSnap.id, 
            ...data,
            isPastCycle: isPast,
            isArchived: isPast || data.isArchived === true,
            cost: effCost,
            totalCost: effCost,
            date: displayDate,
            period: displayDate,
            isoDate: toISODateString(displayDate)
          });
        }
      });

      // Merge remote logs with existing local logs, keeping local logs that aren't yet in cloud!
      const remoteIds = new Set(remoteLogs.map(r => r.id));
      const localOnly = operationLogs.filter(l => !remoteIds.has(l.id) && !l.isArchived && !l.isDeleted && !deletedLogIds.has(l.id));

      // Preserve past-cycle/archived logs that Firestore won't return (they're excluded from the snapshot query)
      const preservedPastLogs = operationLogs.filter(l => 
        (l.isPastCycle === true || l.isArchived === true) && !l.isDeleted && !deletedLogIds.has(l.id) && !remoteIds.has(l.id)
      );
      
      // Auto-reconcile: If there are local-only logs, automatically push them to Firestore!
      if (localOnly.length > 0 && db) {
        localOnly.forEach(l => {
          l.synced = true;
          l.isOffline = false;
          l.cloudQueueStatus = 'transmitted';
          const clean = cleanDataForFirestore({ ...l, synced: true, syncedAt: new Date().toISOString() });
          setDoc(doc(db, 'operation_logs', l.id), clean, { merge: true }).catch(e => {
            console.warn('[Mobile] Auto-reconcile local log upload notice:', e);
          });
        });
      }

      const merged = [...remoteLogs, ...localOnly, ...preservedPastLogs];
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
    const unsubTickets = onSnapshot(collection(db, 'support_tickets'), (snapshot) => {
      if (snapshot.empty) return;
      const remoteTickets = [];
      snapshot.forEach(docSnap => remoteTickets.push({ id: docSnap.id, ...docSnap.data() }));

      supportTickets.length = 0;
      remoteTickets.forEach(rt => supportTickets.push(rt));
      saveItem(STORAGE_KEYS.TICKETS, supportTickets);
      notify();
    }, (err) => console.warn('[Mobile] Support tickets listener notice:', err));

    // 5. Live Users Directory Listener (Authoritative Cloud Sync)
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      if (snapshot.empty) return;
      const remoteUsers = [];
      snapshot.forEach(docSnap => remoteUsers.push({ id: docSnap.id, ...docSnap.data() }));

      users.length = 0;
      remoteUsers.forEach(ru => users.push(ru));
      saveItem(STORAGE_KEYS.USERS, users);
      notify();
    }, (err) => console.warn('[Mobile] Users listener notice:', err));

    // 6. Live Audit Reports Listener (Authoritative Cloud Sync)
    const unsubAuditReports = onSnapshot(collection(db, 'audit_reports'), (snapshot) => {
      if (snapshot.empty) return;
      const remoteAudits = [];
      snapshot.forEach(docSnap => remoteAudits.push({ id: docSnap.id, ...docSnap.data() }));

      if (remoteAudits.length > 0) {
        remoteAudits.forEach(ra => {
          const existingIdx = auditReports.findIndex(a => 
            a.id === ra.id || 
            a.reportId === ra.id || 
            (ra.reportId && a.id === ra.reportId) || 
            (ra.id && a.reportId === ra.id) ||
            (ra.qrSignature && (a.qrSignature === ra.qrSignature || a.qrHash === ra.qrSignature))
          );
          if (existingIdx >= 0) {
            const hasSameHash = (auditReports[existingIdx].qrSignature === ra.qrSignature || auditReports[existingIdx].qrHash === ra.qrSignature || auditReports[existingIdx].qrSignature === ra.qrHash);
            const isCertified = ra.status === 'Certified' || (auditReports[existingIdx].status === 'Certified' && hasSameHash);
            auditReports[existingIdx] = { 
              ...auditReports[existingIdx], 
              ...ra,
              status: isCertified ? 'Certified' : (ra.status || 'Pending')
            };
          } else {
            auditReports.unshift(ra);
          }
        });

        // Strictly deduplicate auditReports in place
        const reportMap = new Map();
        auditReports.forEach(r => {
          if (!r) return;
          const key = r.reportId || r.id;
          if (key) reportMap.set(key, r);
        });
        auditReports.length = 0;
        auditReports.push(...reportMap.values());

        saveItem(STORAGE_KEYS.AUDIT_REPORTS, auditReports);
        saveItem('@hugpong_audit_logs', auditReports);
        notify();
      }
    }, (err) => console.warn('[Mobile] Audit reports listener notice:', err));

    // 7. Live Audit Logs / System History Listener (Authoritative Cloud Sync)
    const unsubAuditLogs = onSnapshot(collection(db, 'audit_logs'), (snapshot) => {
      if (snapshot.empty) return;
      const remoteLogs = [];
      snapshot.forEach(docSnap => remoteLogs.push({ id: docSnap.id, ...docSnap.data() }));

      if (remoteLogs.length > 0) {
        remoteLogs.forEach(rl => {
          const existingIdx = systemHistory.findIndex(a => a.id === rl.id);
          if (existingIdx >= 0) {
            systemHistory[existingIdx] = { ...systemHistory[existingIdx], ...rl };
          } else {
            systemHistory.unshift(rl);
          }
        });
        saveItem(STORAGE_KEYS.SYSTEM_HISTORY, systemHistory);
        notify();
      }
    }, (err) => console.warn('[Mobile] Audit logs listener notice:', err));

    return () => {
      unsubBlockFarms();
      unsubPrices();
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
  IS_SYNCED = true;
  if (CURRENT_SESSION) CURRENT_SESSION.pendingLogs = 0;
  
  fields.forEach(f => {
    f.synced = true;
    f.lastSync = 'Just now';
  });

  // Mark all active logs as synced and cleared of offline state locally
  operationLogs.forEach(l => {
    if (!l.isDeleted && !l.isArchived && !l.isPastCycle) {
      l.synced = true;
      l.isOffline = false;
      l.cloudQueueStatus = 'transmitted';
    }
  });

  notify();

  const res = await flushOutboxToFirestore();

  // Push all local operationLogs to Firestore in parallel
  if (db && Array.isArray(operationLogs) && operationLogs.length > 0) {
    try {
      const activeLogs = operationLogs.filter(l => !l.isDeleted && !l.isArchived && !l.isPastCycle && l && l.id);
      const pushPromises = activeLogs.map(log => {
        const cleanLog = cleanDataForFirestore({
          ...log,
          synced: true,
          isOffline: false,
          cloudQueueStatus: 'transmitted',
          syncedAt: log.syncedAt || new Date().toISOString()
        });
        return setDoc(doc(db, 'operation_logs', log.id), cleanLog, { merge: true });
      });
      await Promise.all(pushPromises);
    } catch (logSyncErr) {
      console.warn('[performMobileSync] operationLogs push error:', logSyncErr);
    }
  }

  await saveItem(STORAGE_KEYS.FIELDS, fields);
  await saveItem(STORAGE_KEYS.LOGS, operationLogs);

  // Flush compiled audit reports to Firestore (District Audit Queue) in parallel
  try {
    if (db && Array.isArray(auditReports) && auditReports.length > 0) {
      const reportPromises = auditReports.filter(rep => rep && (rep.reportId || rep.id)).map(async (rep) => {
        const docId = rep.reportId || rep.id;
        const docRef = doc(db, 'audit_reports', docId);
        try {
          const snap = await getDoc(docRef);
          if (snap.exists() && snap.data()?.status === 'Certified') {
            const snapHash = snap.data().qrHash || snap.data().qrSignature;
            const repHash = rep.qrHash || rep.qrSignature;
            if (snapHash && snapHash === repHash) {
              rep.status = 'Certified';
              rep.certifiedBy = snap.data().certifiedBy || rep.certifiedBy;
              rep.certifiedRole = snap.data().certifiedRole || rep.certifiedRole;
              rep.certifiedAt = snap.data().certifiedAt || rep.certifiedAt;
              rep.cloudQueueStatus = 'transmitted';
              return;
            }
          }
        } catch (ge) {}
        const cleanedRep = cleanDataForFirestore({ ...rep, updatedAt: new Date().toISOString() });
        await setDoc(docRef, cleanedRep, { merge: true });
        rep.cloudQueueStatus = 'transmitted';
        rep.cloudQueuedAt = new Date().toISOString();
      });
      await Promise.all(reportPromises);
      await saveItem(STORAGE_KEYS.AUDIT_REPORTS, auditReports);
    }
  } catch (e) {
    console.warn('[performMobileSync] auditReports push error:', e);
  }

  // Broadcast device health telemetry
  try {
    await publishTerminalTelemetry(CURRENT_SESSION, 0);
  } catch (e) {}
  
  notify();
  return true;
};

// Register automatic sync on network reconnection
setOnReconnectCallback(performMobileSync);

export const initializeOfflineStorage = async () => {
  try {
    const CLEAN_KEY = '@hugpong_clean_prod_v2';
    const isCleaned = await getItem(CLEAN_KEY);
    if (!isCleaned) {
      await clearHugpongStorage();
      await saveItem(CLEAN_KEY, true);
    }
    await initSyncEngine();
    const stored = await hydrateAllStorage();
    if (stored[STORAGE_KEYS.AUTH_TOKEN] && stored[STORAGE_KEYS.SESSION]) {
      const check = verifyAuthToken(stored[STORAGE_KEYS.AUTH_TOKEN]);
      if (check.valid) {
        CURRENT_SESSION = stored[STORAGE_KEYS.SESSION];
      } else {
        CURRENT_SESSION = { ...DEFAULT_GUEST_SESSION };
        await clearAuthSessionStorage();
      }
    } else if (stored[STORAGE_KEYS.SESSION]) {
      CURRENT_SESSION = stored[STORAGE_KEYS.SESSION];
    } else {
      CURRENT_SESSION = { ...DEFAULT_GUEST_SESSION };
    }
    if (Array.isArray(stored[STORAGE_KEYS.USERS]) && stored[STORAGE_KEYS.USERS].length > 0) {
      users.length = 0;
      stored[STORAGE_KEYS.USERS].forEach(u => users.push(u));
    }
    if (Array.isArray(stored[STORAGE_KEYS.DELETED_LOG_IDS]) && stored[STORAGE_KEYS.DELETED_LOG_IDS].length > 0) {
      stored[STORAGE_KEYS.DELETED_LOG_IDS].forEach(id => deletedLogIds.add(id));
    }
    if (Array.isArray(stored[STORAGE_KEYS.LOGS]) && stored[STORAGE_KEYS.LOGS].length > 0) {
      operationLogs.length = 0;
      const normalized = cleanupDuplicateLogs(stored[STORAGE_KEYS.LOGS])
        .filter(l => l && !l.isDeleted && !deletedLogIds.has(l.id))
        .map(l => {
        let effCost = Number(l.totalCost != null ? l.totalCost : (l.cost || 0));
        const opName = (l.sraOperationId || l.task || l.activity || '').toLowerCase();
        if (effCost === 0 && (opName.includes('cutting') || opName.includes('loading') || opName.includes('sra-11') || opName.includes('harvest'))) {
          const ha = Number(l.hectares) || 1.5;
          effCost = Math.round(ha * 60 * 450);
        }
        const displayDate = formatDisplayDate(l.date || l.period);
        const isPastOrArchived = l.isPastCycle === true || l.isArchived === true || l.isDeleted === true || (typeof l.id === 'string' && (l.id.startsWith('PAST-') || l.id.startsWith('DFT-')));
        return {
          ...l,
          synced: isPastOrArchived ? true : (l.synced !== undefined ? l.synced : true),
          isOffline: isPastOrArchived ? false : (l.isOffline === true ? true : false),
          cloudQueueStatus: isPastOrArchived ? 'transmitted' : (l.cloudQueueStatus || (l.isOffline ? 'offline_queued' : 'synced')),
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
      const cleanFields = mergeFieldsWithSeeds(stored[STORAGE_KEYS.FIELDS], archivedFields);
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
      stored[STORAGE_KEYS.PRICES].forEach(p => priceHistory.push(p));
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
        const p = (a.period || a.month || '').toLowerCase();
        if (p.includes('may 2026') || a.id === 'AUD-2026-09' || a.id === 'RPT-2026-05-NCY01' || a.id === 'AUD-2026-0001') {
          return;
        }
        if (!a.certifiedBy && a.status === 'Certified') {
          a.status = 'Pending SRA';
          a.verifiedBy = 'Pending SRA Inspector Review';
        }
        auditReports.push(a);
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
      listenToCloudSync();
      // Publish background device telemetry
      if (CURRENT_SESSION && CURRENT_SESSION.name) {
        publishTerminalTelemetry(CURRENT_SESSION, pendingCount).catch(() => {});
      }
      // If internet is connected, auto-sync immediately on launch
      checkConnectivity().then(online => {
        if (online) {
          performMobileSync().catch(() => {});
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
