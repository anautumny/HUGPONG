const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const str = String(dateStr).trim();
  if (/^[A-Za-z]+ \d{1,2}, \d{4}$/.test(str)) return str;
  const match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const monthIndex = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const fullMonthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    if (monthIndex >= 0 && monthIndex < 12) return `${fullMonthNames[monthIndex]} ${day}, ${year}`;
  }
  const date = new Date(str);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }
  return str;
}

export function toISODateString(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  const str = String(dateStr).trim();
  const match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  const date = new Date(str);
  if (!Number.isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return new Date().toISOString().split('T')[0];
}

export function cleanupDuplicateLogs(logs) {
  if (!Array.isArray(logs)) return [];
  const byId = new Map();
  for (const log of logs) {
    if (!log) continue;
    const logId = log.id || `LOG-${log.fieldId}-${log.stageNumber || 1}-${log.activity || 'op'}-${log.date || Date.now()}`;
    const existing = byId.get(logId);
    if (!existing) {
      byId.set(logId, log);
      continue;
    }
    const existingTime = new Date(existing.updatedAt || existing.createdAt || existing.date || 0).getTime();
    const currentTime = new Date(log.updatedAt || log.createdAt || log.date || 0).getTime();
    if (currentTime >= existingTime) byId.set(logId, log);
  }
  return Array.from(byId.values());
}

export function cleanDataForFirestore(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cleanDataForFirestore);
  const clean = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (fieldValue !== undefined) clean[key] = cleanDataForFirestore(fieldValue);
  }
  return clean;
}

export function extractFarmCodeFromName(name) {
  if (!name) return '';
  const clean = String(name).replace(/\b(block|farm|cooperative|coop|cluster|group|association)\b/gi, '').trim();
  const words = clean.split(/[\s-_]+/).filter(Boolean);
  if (words.length >= 2) return words.map(word => word[0]).join('').toUpperCase().slice(0, 4);
  if (words.length === 1) {
    const word = words[0].toUpperCase();
    if (word.length <= 4) return word;
    if (word === 'NACAYAO') return 'NCY';
    const vowelsRemoved = word.charAt(0) + word.slice(1).replace(/[AEIOU]/gi, '');
    return vowelsRemoved.length >= 3 ? vowelsRemoved.slice(0, 3) : word.slice(0, 3);
  }
  return String(name).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3) || 'FLD';
}

export function getFarmCode(blockFarmInput, blockFarms = []) {
  if (!blockFarmInput) return blockFarms[0] ? getFarmCode(blockFarms[0], blockFarms) : '';
  let farm = typeof blockFarmInput === 'object' && blockFarmInput !== null ? blockFarmInput : null;
  if (!farm) farm = blockFarms.find(item => item.name === blockFarmInput || item.id === blockFarmInput || item.code === blockFarmInput) || null;
  if (farm) {
    const code = String(farm.code || '').replace(/^BLK[-_]?/i, '').replace(/[-_]\d+$/, '').trim().toUpperCase();
    if (code && !/^\d+$/.test(code)) return code;
    const idCode = String(farm.id || '').replace(/^BLK[-_]?/i, '').replace(/[-_]\d+$/, '').trim().toUpperCase();
    if (idCode && !/^\d+$/.test(idCode)) return idCode;
    if (farm.name) return extractFarmCodeFromName(farm.name);
    const fallbackCode = String(farm.code || '').replace(/^BLK[-_]?/i, '').trim().toUpperCase();
    if (fallbackCode) return fallbackCode;
  }
  return typeof blockFarmInput === 'string' && blockFarmInput.trim() ? extractFarmCodeFromName(blockFarmInput) : '';
}

export function generateNextFieldId(blockFarmInput, existingFields = [], blockFarms = []) {
  const farmCode = getFarmCode(blockFarmInput, blockFarms);
  const prefix = farmCode ? `FLD-${farmCode}` : 'FLD';
  const existingNumbers = existingFields
    .filter(field => {
      if (!field?.id) return false;
      if (String(field.id).toUpperCase().startsWith(`${prefix}-`)) return true;
      return Boolean(farmCode && (field.blockFarm === blockFarmInput || field.blockFarmId === blockFarmInput));
    })
    .map(field => String(field.id).match(/(\d+)$/))
    .filter(Boolean)
    .map(match => parseInt(match[1], 10));
  const nextNumber = existingNumbers.length ? Math.max(...existingNumbers) + 1 : 1;
  return `${prefix}-${String(nextNumber).padStart(3, '0')}`;
}

export function findUserByIdOrContact(users, input) {
  if (!input) return null;
  const raw = String(input).trim();
  const clean = raw.replace(/\D/g, '');
  return users.find(user => {
    const employeeId = String(user.employeeId || '').trim();
    const employeeDigits = employeeId.replace(/\D/g, '');
    const contact = String(user.contact || '').replace(/\D/g, '');
    const mobile = String(user.mobile || '').replace(/\D/g, '');
    const id = String(user.id || '').trim();
    const name = String(user.name || '').trim().toLowerCase();
    if (employeeId && (employeeId === raw || (clean && employeeDigits === clean))) return true;
    if (clean && (contact === clean || mobile === clean)) return true;
    if (clean.length >= 7 && ((contact.length >= 7 && (contact.endsWith(clean) || clean.endsWith(contact))) || (mobile.length >= 7 && (mobile.endsWith(clean) || clean.endsWith(mobile))))) return true;
    if (id && (id === raw || (clean && id.replace(/\D/g, '') === clean))) return true;
    return Boolean(name && name === raw.toLowerCase());
  }) || null;
}

export function isValidUserIdentifier(users, input, requireExisting = true) {
  if (!input) return false;
  if (findUserByIdOrContact(users, input)) return true;
  if (requireExisting) return false;
  const raw = String(input).trim();
  const clean = raw.replace(/\D/g, '');
  return /^0[1-4]\d{6}$/.test(raw) || /^0[1-4]\d{6}$/.test(clean) || /^09\d{9}$/.test(clean) || (clean.startsWith('639') && clean.length === 12);
}

export function sortPrices(prices) {
  const time = price => {
    const published = price?.publishedAt ? new Date(price.publishedAt).getTime() : Number.NaN;
    if (!Number.isNaN(published)) return published;
    const effective = price?.effectiveDate ? new Date(`${price.effectiveDate}T00:00:00Z`).getTime() : Number.NaN;
    return Number.isNaN(effective) ? 0 : effective;
  };
  return [...prices].sort((left, right) => time(right) - time(left));
}

export function extractPriceMonth(price) {
  if (!price || !/^\d{4}-\d{2}-\d{2}$/.test(price.effectiveDate || '')) return null;
  return MONTH_NAMES[Number(price.effectiveDate.slice(5, 7)) - 1] || null;
}

export function formatFullName(first = '', middle = '', last = '') {
  const firstName = (first || '').trim();
  const middleName = (middle || '').trim();
  const lastName = (last || '').trim();
  if (!firstName && !lastName) return '';
  if (middleName) return `${firstName} ${middleName.length === 1 ? `${middleName}.` : middleName} ${lastName}`.trim();
  return `${firstName} ${lastName}`.trim();
}

export function splitFullName(fullName = '') {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', middleName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], middleName: '', lastName: '' };
  if (parts.length === 2) return { firstName: parts[0], middleName: '', lastName: parts[1] };
  if (parts.length === 3) {
    return { firstName: parts[0], middleName: parts[1].length <= 2 ? parts[1].replace('.', '') : parts[1], lastName: parts[2] };
  }
  return { firstName: parts.slice(0, -2).join(' '), middleName: parts[parts.length - 2], lastName: parts[parts.length - 1] };
}

export function calculateSRAWeekLabel(dateInput = new Date()) {
  let date = dateInput;
  if (!(date instanceof Date)) {
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
      const [year, month, day] = dateInput.trim().split('-').map(Number);
      date = new Date(year, month - 1, day);
    } else {
      date = new Date(dateInput);
    }
  }
  if (Number.isNaN(date.getTime())) date = new Date();
  const week = Math.ceil((date.getDate() + new Date(date.getFullYear(), date.getMonth(), 1).getDay()) / 7);
  return `Week ${Math.min(Math.max(week, 1), 5)} ${MONTH_NAMES[date.getMonth()]}`;
}
