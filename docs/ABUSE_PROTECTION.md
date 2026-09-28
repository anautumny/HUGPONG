# HUGPONG Request Abuse Protection

## Protection layers

HUGPONG applies complementary request limits. No API key embedded in Web or
Mobile is treated as a security boundary because a distributed client can
extract and replay such a value.

1. `createEarlyAbuseProtection()` runs before CORS, JSON parsing, sessions,
   authentication, request logging, and Firestore access. It uses a bounded
   in-memory store and rejects abusive IP bursts, sustained traffic, mutation
   floods, authentication floods, large-backup floods, and unknown-path scans.
2. Declared request bodies larger than the applicable parser ceiling are
   rejected before their bytes are parsed. Normal JSON is limited to 1 MB and
   the isolated encrypted-backup path to 12 MB.
3. Authenticated `/api/*` traffic has independent account and account-plus-IP
   budgets. Reads and mutations use separate limits.
4. Login uses three persistent Firestore-backed controls: IP, normalized
   account identifier, and IP-plus-identifier. This covers password spraying,
   attacks focused on one account, and repeated attempts from one network.
5. OTP, password recovery, SMS, account creation, and other sensitive
   operations retain their dedicated persistent limits. Backup export,
   validation, and recovery have separate Super Admin budgets.
6. Routine `401`, `404`, `413`, and `429` traffic is aggregated for 30 seconds.
   Similar events share one troubleshooting reference and produce one
   sanitized Diagnostics record and one private log entry rather than one
   Firestore write and log line per request.

All clients receive the same safe response with a reference ID and a generic
"try again later" instruction. Retry durations may be transmitted in standard
headers for client behavior but are not required to be displayed to users.

## Current budgets

The early single-instance guard applies these per-network ceilings:

- 100 requests per 10-second burst window.
- 300 requests per minute overall.
- 60 mutation requests per minute.
- 60 authentication requests per minute.
- 12 backup-upload requests per minute.
- 30 unknown-path requests per minute.

Authenticated accounts are limited over five-minute windows:

- 300 reads per account and 240 per account/network pair.
- 60 mutations per account and 45 per account/network pair.

Login permits at most 30 attempts per IP, 10 per normalized account identifier,
and 5 per IP/account pair during the existing 15-minute window. Backup export,
validation, and restore allow 5, 12, and 3 operations per Super Admin per hour.

These values are initial safety budgets and should be reviewed against real
production telemetry. They must not be increased merely to conceal a defective
client retry loop.

## Deployment boundary

The in-memory limiter protects the Node process and is appropriate for the
current single-server deployment. It is deliberately bounded so attackers
cannot grow memory without limit. Its counters reset when the process restarts
and are not shared between multiple backend instances. Persistent account
security controls continue to survive restarts in the server-only
`security_rate_limits` collection.

For an internet-facing production deployment, place the origin behind a
trusted edge proxy, WAF, or hosting-platform rate limiter. Edge protection is
required for volumetric DDoS traffic because application middleware cannot
reject bytes until they have already reached the server. Ensure `trust proxy`
matches the exact proxy topology and prevent direct public access to the
origin.

## Firebase App Check

Firebase App Check is the preferred app-attestation layer instead of a shared
client API secret. It is not enforced by this change because both the Web and
Android apps must first be registered with supported attestation providers.
Enabling backend enforcement before that registration would lock out valid
clients.

Safe rollout:

1. Register Web and Android providers in Firebase.
2. Add token acquisition to both clients and verification to the Express API.
3. Deploy in monitoring mode and verify valid-client coverage.
4. Enforce ordinary App Check tokens for application APIs.
5. Consider limited-use/replay-protected tokens only for selected sensitive
   operations after latency and provider quotas are reviewed.

App Check supplements authentication, authorization, rate limiting, and
Firestore rules; it does not replace any of them.
