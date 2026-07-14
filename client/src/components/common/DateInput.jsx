import React, { useEffect, useState } from 'react';

// Formats raw digits typed by the user into a DD/MM/YYYY masked string
export const maskDateInput = (raw) => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

// Parses a DD/MM/YYYY string into a Date, or null if invalid/incomplete
const parseDisplayDate = (value) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value || '');
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) {
    return null;
  }
  return date;
};

// Converts a DD/MM/YYYY string into YYYY-MM-DD (empty string if invalid/incomplete)
export const displayToIso = (value) => {
  const date = parseDisplayDate(value);
  if (!date) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

// Converts a YYYY-MM-DD string into DD/MM/YYYY for display (empty string if invalid/empty)
export const isoToDisplay = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  if (!match) return '';
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
};

export const todayISO = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Drop-in replacement for <input type="date">. Displays/accepts DD/MM/YYYY,
 * but value/onChange still speak ISO (YYYY-MM-DD) so existing state and
 * submit logic don't need to change.
 */
export default function DateInput({
  value,
  onChange,
  min,
  max,
  name,
  id,
  required,
  disabled,
  className,
  style,
  placeholder = 'DD/MM/YYYY',
  onBlur,
  ...rest
}) {
  const [display, setDisplay] = useState(() => isoToDisplay(value));
  const [error, setError] = useState('');

  // Resync from external value changes (e.g. form reset, initial load) without
  // fighting the user mid-keystroke: only resync when the prop no longer
  // matches what's currently on screen.
  useEffect(() => {
    if (displayToIso(display) !== (value || '')) {
      setDisplay(isoToDisplay(value));
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (e) => {
    const masked = maskDateInput(e.target.value);
    setDisplay(masked);

    if (masked.length === 0) {
      setError('');
      onChange && onChange({ target: { name, value: '' } });
      return;
    }

    if (masked.length < 10) {
      setError('');
      return;
    }

    const iso = displayToIso(masked);
    if (!iso) {
      setError('Enter a valid date');
      return;
    }
    if (min && iso < min) {
      setError('Date cannot be in the past');
      return;
    }
    if (max && iso > max) {
      setError('Date must be on or before ' + isoToDisplay(max));
      return;
    }

    setError('');
    onChange && onChange({ target: { name, value: iso } });
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
        maxLength={10}
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
