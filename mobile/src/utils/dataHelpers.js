// Pure data helpers shared by the mobile store and screens.
// Keep these functions free of React Native, Firebase, and storage side effects.
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
  for (const log of logs) {
    if (!log) continue;
    const logId = log.id || `LOG-${log.fieldId}-${log.stageNumber || 1}-${log.activity || 'op'}-${log.date || Date.now()}`;
    if (!byId.has(logId)) {
      byId.set(logId, log);
    } else {
      const existing = byId.get(logId);
      const timeExisting = new Date(existing.updatedAt || existing.createdAt || existing.date || 0).getTime();
      const timeCurrent = new Date(log.updatedAt || log.createdAt || log.date || 0).getTime();
      if (timeCurrent >= timeExisting) {
        byId.set(logId, log);
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
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      clean[key] = cleanDataForFirestore(value);
    }
  }
  return clean;
};
