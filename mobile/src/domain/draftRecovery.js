// Claims coordinate one running process; a previous process cannot still own
// them. Preserve submittedOperationId so reconciliation/retry stays idempotent.
export function recoverAbandonedDraftClaims(drafts) {
  return Array.isArray(drafts) ? drafts.map(draft => ({ ...draft, submitting: false, submissionClaimedAt: null })) : [];
}
