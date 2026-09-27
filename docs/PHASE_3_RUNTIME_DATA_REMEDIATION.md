# Phase 3 — Runtime Data and Claim Remediation

Phase 3 removes fabricated runtime defaults and closes the remaining client-authority gap in price publication. HUGPONG remains a farm-management platform; the UI must not imply government endorsement or silently manufacture an issuing source.

## Database / schema

- `sra_prices` keeps the existing canonical fields, so no destructive migration is required.
- `sugarPriceChange` and `molassesPriceChange` are now server-derived persisted values. Existing records remain readable; all new publications use the prior persisted effective-date record as their comparison point.
- The first chronological publication stores both change values as `0`.

## Server / API

- `POST /api/prices` ignores client-supplied price-change values.
- The price transaction reads the preceding persisted price, calculates both changes, creates the publication, and writes its audit event atomically.
- Source, circular/reference number, effective date, reporting period, and both positive price values remain required.

## Web

- The publishing form no longer prefills a fabricated issuing source.
- The client submits observed price values and source metadata but leaves authoritative changes to the server.
- Unsupported “Official SRA” and verification claims were replaced with neutral, accurate wording such as “Published Price Reference” and “Certified Audit.”

## Mobile

- The full-screen publishing form matches the web source and reference requirements.
- Price publication is online-only and enters the mobile cache only after the server returns the canonical record; mobile no longer inserts an optimistic publication.
- Dead demo labels, named mill/site samples, and unsupported official/verification claims were removed from active runtime content.

## Deliberate constants

UI labels, validation limits, role definitions, crop-stage definitions, and operation catalogue definitions are application rules rather than fabricated records. They remain version-controlled and contract-tested across server, web, and mobile. Farm, account, price, audit, and operational records must come from the authenticated API or the account-scoped mobile cache.
