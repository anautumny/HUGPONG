# HUGPONG Support Ticketing Completion Report

Date: 2026-09-25

## Root-cause audit

1. **Why Super Admin saw Create Ticket:** `TicketsView.jsx` rendered one shared header and an unconditional Create Ticket button for every authenticated role. The create modal was also mounted for every role.
2. **Where creation permission was checked:** before this change, nowhere in the create path. `POST /api/tickets` required authentication but had no requester-role authorization.
3. **UI-only check:** there was not even a complete UI check. The web calculated `isSuperAdmin` only for field loading and management controls; it did not use that result for creation. Mobile exposed submission to every mobile session.
4. **Web/mobile permission difference:** both allowed creation in their UI. Mobile used the Outbox; web posted directly. The server accepted any authenticated role, including Super Admin.
5. **Requester identity:** the server stored only `createdByUserId`. Mobile kept `memberName` in its local shape, but canonical records did not snapshot a human-readable requester name or canonical role.
6. **Statuses:** Firestore used `OPEN`, `IN_PROGRESS`, `RESOLVED`, and `CLOSED`. Mobile stored display strings and immediately marked an offline local ticket `Open`, so it could not distinguish queued work. Web and mobile had different labels and assumptions.
7. **Outbox:** mobile ticket creation already entered the canonical mobile mutation Outbox as type `ticket`. Web ticket creation did not have a durable offline queue.
8. **Offline creation:** mobile persisted the mutation but presented a false Open/submitted state and did not explicitly persist the pending ticket before enqueue. Web failed on a lost connection.
9. **Query performance:** `GET /api/tickets` loaded the entire authorized collection. Super Admin loaded all tickets, and normal users loaded all of their tickets, then the UI filtered/paginated in memory.
10. **Resolved tickets in active list:** yes. One list mixed every lifecycle status.
11. **History storage:** there was no duplicate history collection. This was correct and has been preserved.
12. **Duplicate risk:** mobile generated sequence-like IDs from local list length, and both UIs relied on asynchronous disabled state. Rapid or retried submissions could create separate IDs. Server replay protection applied only when the same ID happened to be reused.
13. **Requester-content editing:** the Super Admin API did not update `title` or `details`, so the original message was not directly editable. It did overwrite the single `resolutionNotes` field, losing prior response history.
14. **Requester scope:** list reads were server-scoped by `createdByUserId`, and Firestore rules also scoped direct reads. There was no dedicated server detail endpoint; one now enforces the same owner-or-Super-Admin rule.
15. **Indexes:** the old documented ticket index targeted `createdAt` and did not support active/history lifecycle queries. New indexes are declared for status/update time, requester scope, category, requester role, and Block Farm filters.

## Implemented model

- Requester roles: `MEMBER_FARMER`, `FARM_MANAGER`, and `SRA_ADMIN`.
- Handler role: `SUPER_ADMIN`.
- Local-only state: `PENDING_SUBMISSION`.
- Canonical lifecycle: `OPEN -> IN_PROGRESS -> RESOLVED -> CLOSED`.
- Active Inbox: `OPEN` and `IN_PROGRESS` only.
- Ticket History: `RESOLVED` and `CLOSED` only, newest first, page size 20 with a server cursor.
- One canonical `support_tickets` collection; no history copy was introduced.
- User input is limited to category, subject, description, and optional selected context. Identity and timestamps are server-owned.

## Authorization and auditability

- The server rejects normal ticket creation by Super Admin even when the endpoint is called directly.
- List and detail reads require the requester to own the ticket or the caller to be Super Admin.
- Only Super Admin can advance support status.
- Random status jumps are rejected.
- Public responses and requester follow-ups append author ID, name, role, timestamp, visibility, and content.
- Status changes append `statusHistory` and retain resolved/closed actor timestamps.
- Original subject and description have no Super Admin update path.

## Web changes

- Super Admin now sees Support Inbox, active counts, Ticket History, ticket management, and no Create Ticket control.
- Requesters see My Tickets with Active and Ticket History views.
- Category wording matches mobile.
- Ticket rows show requester name and role rather than only a raw ID.
- Public conversation history and active requester follow-up are visible.
- A stable ticket ID, synchronous submit lock, and persistent local ticket-create Outbox prevent duplicate submissions.
- Offline/network-failed creates show `PENDING_SUBMISSION` and explicit queued feedback; only a server acknowledgement produces `OPEN` and submitted feedback.

## Mobile changes

- Ticket creation checks the same canonical requester roles before writing locally.
- A pending record is persisted before the Outbox mutation is attempted.
- Stable randomized IDs and the existing logical-mutation deduplication prevent duplicate replay.
- Successful Outbox responses replace the local pending record with the canonical Open ticket.
- Reconnect reconciliation now handles ticket creates and ticket follow-up messages.
- Active and History views are separate, use canonical labels, share the six categories with web, and show conversation responses.
- Follow-up messages also use the existing mobile Outbox and stable message identity.

## Existing Firestore data inventory

A read-only production Firestore inventory was run on 2026-09-25. `support_tickets` contained **0 documents**, so no Super Admin-created records, missing owners/roles, invalid statuses, duplicates, stale pending records, or orphaned owners were found. No data was changed or deleted.

## Required deployment

Deploy `firestore.indexes.json` before enabling the new paginated queries in production. Required combinations are documented in `docs/FIRESTORE_SCHEMA.md`.

## Verification

- Final full server test suite: 217/217 passed. One legacy source-shape assertion found during the first pass was corrected before the final run.
- Focused security/outbox/support suite after correction: 48/48 passed.
- Web production build: passed.
- Android mobile production export: passed (1,151 modules bundled); the generated verification artifact was removed afterward.
- Live Firestore inventory: succeeded read-only; zero ticket documents.

## Remaining limitations

- A signed-in, multi-role device/browser end-to-end run was not possible because the live ticket collection is empty and no test-user session was supplied. Server authorization, transition, Outbox, source-boundary, and build checks cover the implemented paths, but UI automation against real role sessions remains a deployment smoke test.
- The established platform policy keeps Super Admin web-only. Mobile requester flows are complete for all mobile-authorized requester roles; a Super Admin mobile Inbox would require a separate authorized mobile navigation workspace because simply enabling that role would expose unrelated field screens and break the current platform security contract.
- Web offline creation is stored in browser local storage and retried on the online event. It is scoped by authenticated user but is not yet shown in the global mobile-style sync diagnostics screen.
- Full-text search is limited to the currently loaded page; category is server-filtered, while advanced cross-page text search would require a dedicated search index.
