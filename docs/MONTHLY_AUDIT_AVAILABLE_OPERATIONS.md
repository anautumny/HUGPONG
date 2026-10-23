# Monthly audits use available recorded operations

Monthly reports no longer require an operation from every active plot. A field
can legitimately have no work in a month. A missing synchronized record is not
automatically treated as either inactivity or a failure to submit.

## Database / schema

No new collections, fields, indexes, or migration. Existing immutable operation
and field snapshots record precisely what was included. `fieldCount`, audited
hectares, member count, and costs describe included records only. No zero-activity
operations or audit entries are fabricated for plots without records.

## Server / API

- The compile endpoint selects eligible synchronized records for the assigned
  Block Farm and month directly from the database.
- Plots without recorded operations no longer trigger `AUDIT_MONTH_INCOMPLETE`.
- At least one eligible operation is still required; empty reports are rejected.
- Readiness exposes `canCompile`. Legacy `isComplete`, `incompleteFieldCount`,
  and `incompleteFields` remain coverage information for compatibility, not a
  compilation restriction. `canCompile` is an activity precheck; normal existing
  report/version rules still apply.
- Existing authorization, future-month validation, report limits, idempotency,
  certification, and duplicate-operation protection remain enforced.
- Later submissions can enter a later report version under the existing audit
  lifecycle; certified snapshots are not edited or counted again.

## Web

The compilation control permits available eligible operations even when other
plots have no monthly records. Coverage is an optional expandable list with
contact links. Review and printed reports explain that plots without recorded
operations are not counted as audited.

Clicking Review & Compile refreshes a server-generated member review first.
Compile Available Operations is a separate continuation action; Cancel/Back does
not write a report. The member list is paginated in groups of 10.

## Mobile

The online readiness check opens a paginated member review with Call Member,
Cancel, and Compile Available Operations controls. The review does not require
an operation from every member. Locally pending recorded changes still need
synchronization before an official compilation. Farm/month, connectivity, and
pending changes are checked again when continuing after the review. Review and
PDF output explain record coverage.

## Member follow-up and inactivity

The server lists every active affiliated member with no recorded monthly
operations, including members without an assigned active plot. Owners of active
plots are included through their canonical assignment too. Each member appears
once with their plot IDs. Unassigned plots remain in field-level coverage.

The list also flags members with recorded monthly operations whose account
activity needs attention. Existing account monitoring thresholds apply: warning
after 3 days and critical after 5 days since the last recorded account activity.
When an account has never reported activity, the existing registration-date
fallback is stated explicitly; missing dates or unavailable telemetry are not
presented as proof of inactivity. Monthly absence and account inactivity are
separate facts, and activity observed offline may not yet have reached the API.

Telephone links use the registered member contact number and launch the user's
phone application. Missing contacts have a disabled Call control. The system
does not place calls automatically or mark a member as contacted/verified.
No new database records or verification claims are written by the review.

## Delivery and validation

API tests cover compilation with idle plots, authoritative record selection,
accurate totals, replay, later submissions after certification, empty months,
and another manager's farm. Ship the API and Web changes together with an updated
APK: an older installed client can still enforce its older local restriction.
Existing saved reports remain unchanged. This change has not been deployed.
