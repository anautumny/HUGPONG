# Planting Variety and Stage-Operation Audit

## Outcome

The stop-gate audit passed. Web and Android contained exactly 14 unique canonical SRA operation IDs, and every ID had one unambiguous stage. The server now carries and enforces the same catalogue.

| Stage | Allowed canonical operations |
| --- | --- |
| 1 — Land Preparation | SRA-01, SRA-02 |
| 2 — Planting | SRA-03, SRA-04 |
| 3 — Basal | SRA-05, SRA-06 |
| 4 — Weeding | SRA-07, SRA-08 |
| 5 — Top-Dress | SRA-09, SRA-10 |
| 6 — Harvest | SRA-11, SRA-12, SRA-13, SRA-14 |

## Ownership and lifecycle

- A Field remains the persistent parcel. Enrollment/editing contains its generated ID, Block Farm, Farm Member, area, and soil type; it no longer accepts sugarcane variety or an initial stage.
- Every new Crop Year Cycle starts at Stage 1 with `variety: ""`.
- Variety is required when a Stage 2 operation is submitted. The API transaction writes it to the Planting operation and, when unset, the active Crop Year Cycle.
- A conflicting submitted variety is rejected. Correction uses the existing amendment workflow and updates only that operation and its owning active cycle.
- Rollover preserves the archived cycle's variety and creates the next cycle with no variety. Legacy `fields.variety` values remain readable as compatibility context but are never rewritten or migrated into a new cycle.

## Enforcement and UX

- The API canonicalizes standard operation name/category and rejects an SRA ID assigned to the wrong stage. Stable field-configured custom operations remain supported within their configured stage; generic `CUSTOM` remains supported.
- Web Manager Takeover begins without an operation choice. Selecting/changing a stage clears the previous operation, filters the selector to that stage, and withholds the detail/cost form until an operation is chosen.
- Web and Android Planting forms require variety. An already established cycle variety is context-only during new entry; corrections are made through an amendment.
- Operation history and audit snapshots retain the Planting variety. Existing authorization, takeover grants, scope, archive lifecycle, offline outbox, and analytics calculations are unchanged.

## Verification

- Server contract and service tests cover all 14 IDs, all six stage lists, cross-platform parity, invalid pair rejection, required Planting variety, non-Planting rejection, amendment correction, and rollover history.
- Source contract tests verify enrollment forms omit variety/initial-stage controls and Web Takeover clears, disables, and stage-filters operation selection.
- The full server and Web test suites, Web production build, and Android Expo export are the release gates for this change.
