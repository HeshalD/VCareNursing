import React, { useEffect, useState } from 'react';
import { isoToDisplay } from './DateInput';

// Formats raw digits into a DD/MM/YYYY HH:mm masked string
const maskDateTimeInput = (raw) => {
  const digits = raw.replace(/\D/g, '').slice(0, 12);
  let out = '';
  if (digits.length <= 2) return digits;
  out = `${digits.slice(0, 2)}/`;
  if (digits.length <= 4) return out + digits.slice(2);
  out += `${digits.slice(2, 4)}/`;
  if (digits.length <= 8) return out + digits.slice(4);
  out += `${digits.slice(4, 8)} `;
  if (digits.length <= 10) return out + digits.slice(8);
  return out + `${digits.slice(8, 10)}:${digits.slice(10)}`;
};

const parseDisplayDateTime = (value) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  if (
    date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day) ||
    date.getHours() !== Number(hour) || date.getMinutes() !== Number(minute)
  ) {
    return null;
  }
  return date;
};

const displayToIso = (value) => {
  const date = parseDisplayDateTime(value);
  if (!date) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const isoDateTimeToDisplay = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || '');
  if (!match) return '';
  const [, year, month, day, hour, minute] = match;
  return `${day}/${month}/${year} ${hour}:${minute}`;
};

/**
 * Drop-in replacement for <input type="datetime-local">. Displays/accepts
 * DD/MM/YYYY HH:mm, but value/onChange still speak the native datetime-local
 * ISO shape (YYYY-MM-DDTHH:mm).
 */
export default function DateTimeInput({
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
  placeholder = 'DD/MM/YYYY HH:mm',
  onBlur,
  ...rest
}) {
  const [display, setDisplay] = useState(() => isoDateTimeToDisplay(value));
  const [error, setError] = useState('');

  useEffect(() => {
    if (displayToIso(display) !== (value || '')) {
      setDisplay(isoDateTimeToDisplay(value));
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (e) => {
    const masked = maskDateTimeInput(e.target.value);
    setDisplay(masked);

    if (masked.length === 0) {
      setError('');
      onChange && onChange({ target: { name, value: '' } });
      return;
    }

    if (masked.length < 16) {
      setError('');
      return;
    }

    const iso = displayToIso(masked);
    if (!iso) {
      setError('Enter a valid date/time');
      return;
    }
    if (min && iso < min) {
      setError('Date/time cannot be in the past');
      return;
    }
    if (max && iso > max) {
      setError('Date/time must be on or before ' + isoToDisplay(max.slice(0, 10)));
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
        maxLength={16}
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
