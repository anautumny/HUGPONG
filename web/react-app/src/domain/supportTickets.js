export const TICKET_CATEGORIES = Object.freeze([
  'Account / Login',
  'Synchronization',
  'Field / Operation Data',
  'Audit / QR',
  'SRA Price',
  'Other'
]);

export const TICKET_STATUSES = Object.freeze(['PENDING_SUBMISSION', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);
export const ACTIVE_TICKET_STATUSES = Object.freeze(['PENDING_SUBMISSION', 'OPEN', 'IN_PROGRESS']);
export const HISTORY_TICKET_STATUSES = Object.freeze(['RESOLVED', 'CLOSED']);

export function canonicalSupportRole(value) {
  const role = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (role === 'MEMBER' || role === 'FARM_MEMBER') return 'MEMBER_FARMER';
  if (role === 'ADMIN') return 'SRA_ADMIN';
  if (role === 'SUPERADMIN') return 'SUPER_ADMIN';
  return role;
}

export function canCreateSupportTicket(role) {
  return ['MEMBER_FARMER', 'FARM_MANAGER', 'SRA_ADMIN'].includes(canonicalSupportRole(role));
}

export function isSupportAdministrator(role) {
  return canonicalSupportRole(role) === 'SUPER_ADMIN';
}

export function statusLabel(status) {
  return String(status || 'OPEN').replace(/_/g, ' ').replace(/\b\w/g, value => value.toUpperCase());
}

export function nextTicketStatus(status) {
  return ({ OPEN: 'IN_PROGRESS', IN_PROGRESS: 'RESOLVED', RESOLVED: 'CLOSED' })[status] || null;
}
