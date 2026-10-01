export const PHONE_VERIFICATION_REASONS = Object.freeze([
  { value: 'LIVE_CALL_CONFIRMATION', label: 'Called the registered number and confirmed it with the user' },
  { value: 'ASSIGNED_MANAGER_CONFIRMED', label: 'I know the user and can confirm this is their number' },
  { value: 'ID_AND_SIM_IN_PERSON', label: 'Met the user face to face and confirmed the number' },
  { value: 'OTHER_DOCUMENTED_CHECK', label: 'Used another verification method' }
]);

export const DEFAULT_PHONE_VERIFICATION_REASON = PHONE_VERIFICATION_REASONS[0].value;

export const isOtherPhoneVerificationReason = value => value === 'OTHER_DOCUMENTED_CHECK';
