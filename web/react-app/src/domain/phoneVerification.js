export const PHONE_VERIFICATION_REASONS = Object.freeze([
  { value: 'ID_AND_SIM_IN_PERSON', label: 'Valid government ID and active SIM checked in person' },
  { value: 'ASSIGNED_MANAGER_CONFIRMED', label: 'Assigned Farm Manager confirmed the member and number' },
  { value: 'OFFICIAL_RECORD_MATCH', label: 'Identity and number matched official organization records' },
  { value: 'LIVE_CALL_CONFIRMATION', label: 'Identity and SIM ownership confirmed on a live video call' },
  { value: 'OTHER_DOCUMENTED_CHECK', label: 'Other documented identity and SIM check' }
]);

export const DEFAULT_PHONE_VERIFICATION_REASON = PHONE_VERIFICATION_REASONS[0].value;

export function isOtherPhoneVerificationReason(value) {
  return value === 'OTHER_DOCUMENTED_CHECK';
}
