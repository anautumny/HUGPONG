# Mobile UI and report-year update

## Database and server

No collection or index migration is needed. New audit reports store optional
`reportingCalendarYears`; new crop cycles store `previousCycleId` so recovery
does not force reuse of a retired cycle ID. Existing documents remain readable.

Operation snapshots take precedence over field and aggregate crop-year labels.
A second crop year is exposed only when it is recorded in the sources. Calendar
month columns follow operation dates, including harvesting and milling. Both
exporters support historical and cross-calendar records without deriving labels
from the device's current year.

The server rejects premature annual rollovers and future crop-year assignments
in a monthly compilation. Rollover after recovery skips retired sequence numbers
and remains idempotent. Client clocks cannot authorize a transition.

## Web and mobile

- One analytics Filters entry point, a plain scope summary, draft selections,
  dependent plot/month options, Reset and Apply.
- Archive selectors share one filter surface; record-ID search stays visible.
- Mobile selectors support handle gestures, background dismissal, Android Back,
  accessibility escape and explicit accessibility actions. Scrolling inside a
  list remains independent of handle dragging. Nested Back returns to filters.
- Mobile Reports replaces separate monthly/yearly header icons. Crop-year
  compilations remain reachable inside Reports. Connection details remain
  accessible when the status control switches to an icon on narrow screens.
- Shared mobile back arrows use plain 44-point controls. Analytics and ledger
  titles are shorter, with context below them.
- The scanner uses a responsive square camera frame, one instruction, a plain
  back arrow, flashlight and Upload QR. Camera/verification/retry behavior stays
  intact. New scanner copy has English, Filipino and Hiligaynon translations.
- QR sharing shows the farm, period/year, QR and totals. Manager and report ID
  live in Report details; Save QR and Copy ID are adjacent. Saved mobile QR images
  include identifying captions outside the four-module quiet zone.

## Recovery of the previously reset cycle

The read-only audit found active fields in 2026–2027, one retired 2027–2028 cycle
with `archivedReason: CROP_YEAR_RESET`, a certified V1 whose source operations are
2026–2027, and a pending V2 using the prematurely advanced cycle.

Run the report-specific dry run with:

```powershell
node server/scripts/repairResetCropYear.js --report=AUD-BFCF0B82E817C300A47D7D-2026-10-V2
```

The reviewed plan returns V2 without changing its original snapshot/hash,
corrects the one reset source operation's cycle reference, and creates V3 in
COMPILED state with 2026–2027 and a new integrity hash. The manager must review
V3 and choose delivery. Certified V1 remains untouched; its displayed crop year
comes from its immutable operations. Superseded PDF exports identify V3.

Execution requires both `--execute` and an exact `--expected-project` match.
The transaction stores a complete before-snapshot in `system_metadata` and an
audit event. It refuses certified reports, undocumented resets, changed source
work and overlapping non-returned coverage. Repeating an applied repair reopens
the existing replacement instead of creating another version.

The reviewed recovery was applied to `hugpong-production`: V2 was returned and
V3 was created with 2026–2027 in COMPILED state. Recovery snapshot ID:
`crop-year-report-correction-AUD-BFCF0B82E817C300A47D7D-2026-10-V2`.

## Verification

The regression suite covers camera event locking and upload races, draft-filter
application, nested Back, sheet gestures and safe areas, calendar-month placement,
snapshot precedence, year-boundary rollover, recovery validation, and QR transport.
Web production and native Metro bundle checks are performed separately.

Physical camera, touch/gesture rendering, VoiceOver and TalkBack still need a
device smoke test. No device or browser automation surface was connected during
this implementation. Local source changes require the normal deployment/build
process before installed clients receive them.
