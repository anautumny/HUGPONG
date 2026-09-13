// ══════════════════════════════════════════════════════════════
// HUGPONG — Canonical Database Schema & Domain Configuration
// Single Canonical Source of Truth: Cloud Firestore / Server DB
// ══════════════════════════════════════════════════════════════

var INITIAL_DATABASE = {
  blockFarms: [],
  fields: [],
  users: [],
  logs: [],
  priceHistory: [],
  supportTickets: [],
  auditReports: [],
  systemHistory: [],
  pendingUsers: [],
  securityLogs: []
};

if (typeof window !== 'undefined') {
  window.INITIAL_DATABASE = INITIAL_DATABASE;
}

