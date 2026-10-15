export const PRICE_STATUSES = ['REPORTED', 'NO_BIDDING', 'MILLING_ENDED', 'NOT_REPORTED'];
export const priceStatusLabel = status => ({ REPORTED: 'Reported', NO_BIDDING: 'No bidding', MILLING_ENDED: 'Milling ended', NOT_REPORTED: 'Not reported' }[status] || 'Not reported');
export const priceText = (value, status = 'REPORTED', unit = '') => status === 'REPORTED' && value != null && Number.isFinite(Number(value))
  ? `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${unit ? ` / ${unit}` : ''}`
  : priceStatusLabel(status === 'REPORTED' ? 'NOT_REPORTED' : status);
export const movementText = value => value == null ? 'No comparison'
  : value === 0 ? 'Unchanged' : `${value > 0 ? '+' : '−'}₱${Math.abs(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
