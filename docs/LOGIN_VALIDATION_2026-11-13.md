# Login identifier and acknowledgement order

## Root cause

Web's login form checked its acknowledgement box before calling `/auth/login`. Consequently wrong credentials showed an acknowledgement error before the server had a chance to reject them. The acknowledgement was only enforced by Web UI code. Android did not have an equivalent acknowledgement control.

Both identifier inputs used unrestricted text editing. Android also consulted its cached directory when validating identifiers, and the server's phone lookup stripped non-digits. That allowed a malformed value containing letters to resolve to a registered phone number. None of these checks should establish whether an account exists locally.

## Database / schema

No migration or stored account changes are needed. This is validation of a new sign-in request, not a change to existing session restoration or a persistent consent ledger. Existing records, passwords, audit data, offline queues and drafts are preserved.

## Server / API

`POST /auth/login` accepts an 8-digit account ID with an existing role prefix (`01` through `04`) or a Philippine mobile number. `09…`, `639…`, `+639…` and common phone separators normalize to the same stored mobile number. Identifiers containing letters, incorrect lengths or other characters return `INVALID_LOGIN_IDENTIFIER` before lookup.

The request now includes `sessionAcknowledged: true` when the user checks the acknowledgement. The server checks credentials, account status and existing platform restrictions first. For valid credentials with acknowledgement absent, false or a non-boolean value, it returns HTTP 400 and `SESSION_ACKNOWLEDGEMENT_REQUIRED`. That response contains no user profile or authentication tokens, does not regenerate an authenticated session and does not record a successful login. A subsequent submit verifies credentials again; there is no cached credential approval or pre-authentication grant.

Wrong credentials continue to return `INVALID_CREDENTIALS`, subject to the existing rate limits and lockout, regardless of acknowledgement. Account status is checked after password verification. Password creation/change policy, RBAC, first-login phone verification, required password changes and token issuance policies remain in place.

Files:

- `server/domain/loginIdentifier.js` (new canonical format rules)
- `server/routes/auth.js`
- `server/scripts/bootstrapDevelopmentTestAccounts.js`
- `server/scripts/measureApplicationCapacity.js`

The existing development bootstrap and staging capacity tools explicitly acknowledge their sign-in requests. Neither tool was run against an environment during this task.

## Web

The identifier field remains a text field to preserve leading zeroes, uses a numeric keyboard hint, and rejects letter edits/pastes instead of stripping them into another account's number. Phone formatting pasted into the field becomes digits. Overlong input is rejected rather than truncated.

The form sends the checkbox state with the credentials. Credential errors appear in the existing authentication error area. Only a server acknowledgement error displays below the checkbox and focuses it. Editing credentials or checking the box clears that inline error. The form retains credentials for correction/resubmission and prevents edits while submitting.

Files:

- `web/react-app/src/domain/loginIdentifier.js` (format-only mirror)
- `web/react-app/src/views/LoginView.jsx`
- `web/react-app/src/context/AuthContext.jsx`

## Android

The identifier field uses the same digit-editing and format rules and a numeric keyboard. Login validation no longer uses the cached user directory. Password presence is checked locally; credential correctness remains server-authoritative.

An accessible acknowledgement checkbox and a link to the existing legal documents now accompany sign-in. It is not a client-side prerequisite to checking credentials. The server acknowledgement response produces an inline checkbox error; wrong credentials retain their authentication error. English, Filipino and Hiligaynon translations are provided. No Firebase sign-in, local session/cache replacement or synchronization begins when the server rejects credentials or acknowledgement.

Files:

- `mobile/src/domain/loginIdentifier.js` (format-only mirror)
- `mobile/src/screens/auth/LoginScreen.js`
- `mobile/src/services/authService.js`
- `mobile/src/data/dataStore.js`
- `mobile/src/services/i18n.js`

## Verification

- Full server suite: **739 passed, 0 failed** (`output/login-server-tests.tap`).
- Full Web suite: **60 passed, 0 failed** (`output/login-web-tests.tap`).
- Web production build passed (`output/login-web-build.txt`).
- Android development bundle export passed (`output/login-android-export.txt`).
- Client binding and runtime authority audits: **zero findings** (`output/login-client-bindings.json`, `output/login-runtime-authority.json`).
- `git -c core.safecrlf=false diff --check` passed.

New behavioral tests are `server/tests/login-validation.test.js` and `server/tests/login-client-flow.test.js`. They exercise the real Express login middleware/handler stack with isolated in-memory data and execute client handlers/services with stubbed network responses. Tests cover numeric/format parity, malformed direct API requests, correct/incorrect/nonexistent accounts with unchecked acknowledgement, strict boolean enforcement, no session/token issuance before acknowledgement, resubmission with changed credentials, all six authorized role/platform combinations, platform restrictions, inactive accounts, first-login setup flags and five-attempt lockout. Client tests verify server requests occur with unchecked acknowledgement and unsuccessful responses cannot save sessions, sign into Firebase or navigate to the application.

## Remaining delivery work

Changes are local and have not been deployed. Release the server and Web together with the updated Android client: older Android versions have no acknowledgement checkbox and cannot satisfy the new login contract. Existing authenticated sessions use the existing restoration flow; users performing a new login need the updated client. Coordinate installation/update availability before enabling this server change in production.

Live staging role-account logins, Web browser interaction and physical Android keyboard, checkbox, screen-reader and sign-in acceptance checks have not been performed. Automated handler tests and an Android bundle export are not physical-device verification. No production account or record was modified.
