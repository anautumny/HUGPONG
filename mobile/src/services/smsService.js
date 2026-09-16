// HUGPONG Philippine SMS service. Provider credentials remain server-side only.

export const formatToE164 = (phNumber) => {
  const digits = (phNumber || '').replace(/\D/g, '');
  if (digits.startsWith('09') && digits.length === 11) return `+63${digits.slice(1)}`;
  if (digits.startsWith('639') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('9') && digits.length === 10) return `+63${digits}`;
  return digits.startsWith('+') ? digits : `+63${digits}`;
};

export const formatToLocalPH = (phNumber) => {
  let digits = (phNumber || '').replace(/\D/g, '');
  if (digits.startsWith('63') && digits.length === 12) digits = '0' + digits.slice(2);
  else if (digits.length === 10 && digits.startsWith('9')) digits = '0' + digits;
  return digits;
};
