// Readiness may need to wake a suspended host. Business writes retain their
// shorter request deadlines and are never automatically replayed here.
export const API_STARTUP_TIMEOUT_MS = 75000;
export const API_RECOVERY_RETRY_MS = 15000;
