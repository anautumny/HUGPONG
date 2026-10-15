import React, { useEffect, useRef } from 'react';

export default function OtpCodeInput({ value = '', onChange, onComplete, disabled = false, error = false }) {
  const inputRef = useRef(null);
  const completedCodeRef = useRef('');
  const digits = String(value || '').replace(/\D/g, '').slice(0, 6);

  useEffect(() => {
    if (digits.length < 6) completedCodeRef.current = '';
  }, [digits]);

  const updateCode = event => {
    const nextCode = String(event.target.value || '').replace(/\D/g, '').slice(0, 6);
    onChange?.(nextCode);
    if (nextCode.length === 6 && completedCodeRef.current !== nextCode) {
      completedCodeRef.current = nextCode;
      onComplete?.(nextCode);
    }
  };

  return (
    <div className="relative" onClick={() => inputRef.current?.focus()}>
      <div className="grid grid-cols-6 gap-2" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className={`flex aspect-square min-h-11 items-center justify-center rounded-xl border-2 bg-white text-xl font-black text-primary dark:bg-[#0C1015] ${
              error
                ? 'border-danger'
                : index === Math.min(digits.length, 5) && !disabled
                  ? 'border-primary bg-primary/5'
                  : 'border-border'
            } ${disabled ? 'opacity-60' : ''}`}
          >
            {digits[index] || ''}
          </div>
        ))}
      </div>
      <input
        ref={inputRef}
        id="otp-code-input"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        value={digits}
        onChange={updateCode}
        autoComplete="one-time-code"
        autoFocus
        disabled={disabled}
        aria-label="Six digit verification code"
        className="absolute inset-0 h-full w-full cursor-text opacity-0"
      />
    </div>
  );
}
