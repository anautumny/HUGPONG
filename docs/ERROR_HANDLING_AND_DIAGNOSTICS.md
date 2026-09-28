# HUGPONG Error Handling and Diagnostics

## Boundaries

- Normal Web and Mobile users receive only a short safe message, a next action,
  and a reference ID. Server exception text and stack traces are never returned.
- `diagnostic_events` contains sanitized technical summaries. `GET /api/diagnostics`
  is authorized only for `SUPER_ADMIN`, whose platform is restricted to Web.
- Private structured server logs may add sanitized stack, operation, endpoint, and
  retry detail. Request bodies, credentials, tokens, keys, secrets, and unnecessary
  personal data are never logged.
- `audit_logs` remains the Audit Ledger for meaningful user/system actions. It is
  not a diagnostic log and diagnostics are never inserted into it.

## End-to-end behavior

1. The server intercepts every HTTP error, creates a module-prefixed reference ID,
   writes a sanitized diagnostic event, and returns the safe error envelope.
2. Web and Mobile API clients display the server message, next action, and reference
   ID. Client network failures receive a local reference ID, and render failures are
   submitted to the authenticated client-diagnostics endpoint when reachable.
3. Sync telemetry automatically creates a warning diagnostic when failed mutations,
   failed synchronization, or a conflict is reported.
4. The Super Admin Web route `/diagnostics` displays the separate terminal-style
   console with level, module, date, reference-ID, and text filters.

## Data access policy

Firestore client access to `diagnostic_events` is denied. The Express API is the
only authority: all authenticated roles may submit the restricted client failure
shape, while only Super Admin may list diagnostics. All inputs pass through the
global transport validator and the route accepts only known levels/modules and
bounded strings.
