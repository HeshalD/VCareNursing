import React, { useEffect, useState } from 'react';

// Formats raw digits typed by the user into an HH:MM masked string.
export const maskTimeInput = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
};

// True only for a complete, valid 24-hour HH:MM string.
export const isValidTime = (value) => {
  const m = /^(\d{2}):(\d{2})$/.exec(value || '');
  if (!m) return false;
  return Number(m[1]) <= 23 && Number(m[2]) <= 59;
};

// Trims a stored time ('16:30', '16:30:00') down to the HH:MM the field displays.
export const toHHMM = (value) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
  return m ? `${String(m[1]).padStart(2, '0')}:${m[2]}` : '';
};

/**
 * Drop-in replacement for <input type="time">. Always renders 24-hour HH:MM,
 * regardless of the browser/OS locale — the native control switches to a
 * 04:30 PM presentation on 12-hour locales, which this codebase never wants.
 * value/onChange still speak 'HH:mm', so existing state and submit logic are
 * unchanged.
 */
export default function TimeInput({
  value,
  onChange,
  name,
  id,
  required,
  disabled,
  className,
  style,
  placeholder = 'HH:MM',
  onBlur,
  ...rest
}) {
  const [display, setDisplay] = useState(() => toHHMM(value));
  const [error, setError] = useState('');

  // Resync from external value changes (form reset, autofill from schedule) without
  // fighting the user mid-keystroke: only resync when the prop no longer matches
  // what's currently on screen.
  useEffect(() => {
    if (display !== toHHMM(value)) {
      setDisplay(toHHMM(value));
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (e) => {
    const masked = maskTimeInput(e.target.value);
    setDisplay(masked);

    if (masked.length === 0) {
      setError('');
      onChange && onChange({ target: { name, value: '' } });
      return;
    }
    // Reject an out-of-range hour as soon as both its digits are in, rather than
    // waiting for the whole field — '25' can never become valid.
    if (masked.length >= 2 && Number(masked.slice(0, 2)) > 23) {
      setError('Hour must be 00–23');
      return;
    }
    if (masked.length < 5) {
      setError('');
      return;
    }
    if (!isValidTime(masked)) {
      setError('Enter a valid 24-hour time');
      return;
    }

    setError('');
    onChange && onChange({ target: { name, value: masked } });
  };

  return (
    <div>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        name={name}
        id={id}
        value={display}
        onChange={handleChange}
        onBlur={onBlur}
        placeholder={placeholder}
        maxLength={5}
        required={required}
        disabled={disabled}
        className={className}
        style={style}
        {...rest}
      />
      {error && (
        <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#BC4338' }}>{error}</p>
      )}
    </div>
  );
}
