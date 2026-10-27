import React from 'react';
import ReactPhoneInput from 'react-phone-number-input';
import flags from 'react-phone-number-input/flags';
import { isValidPhoneNumber, getCountries, getCountryCallingCode } from 'libphonenumber-js';
import SearchableCountrySelect from './SearchableCountrySelect';
import 'react-phone-number-input/style.css';
import './PhoneInput.css';

export { isValidPhoneNumber };

// Calling codes are prefix-free, so the code at the start of a "+..." value is unambiguous.
const CALLING_CODES = new Set(getCountries().map(c => getCountryCallingCode(c)));

// Local-format entry like 076 XXX XXXX arrives as "+94 076 ..." — drop the national trunk
// "0" so it becomes +9476.... Italy (+39) is skipped: its numbers genuinely start with 0.
const stripTrunkZero = (val) => {
  if (!val || val[0] !== '+') return val;
  for (let len = 1; len <= 3; len++) {
    const code = val.slice(1, 1 + len);
    if (CALLING_CODES.has(code)) {
      if (code !== '39' && val[1 + len] === '0') return `+${code}${val.slice(2 + len)}`;
      return val;
    }
  }
  return val;
};

/**
 * Drop-in phone number input with a country-code dropdown (defaults to +94 / LK).
 * Value/onChange speak E.164 (e.g. "+94771234567") and onChange mimics a native
 * input event ({ target: { name, value } }) so it plugs into existing
 * setFormData(prev => ({ ...prev, [e.target.name]: e.target.value })) handlers.
 */
export default function PhoneInput({
  value,
  onChange,
  name,
  id,
  placeholder = 'Mobile number',
  required,
  disabled,
  className = '',
  style,
  error,
  defaultCountry = 'LK',
  ...rest
}) {
  return (
    <div>
      <ReactPhoneInput
        international
        withCountryCallingCode
        flags={flags}
        countrySelectComponent={SearchableCountrySelect}
        defaultCountry={defaultCountry}
        value={value || undefined}
        onChange={(val) => onChange && onChange({ target: { name, value: stripTrunkZero(val) || '' } })}
        name={name}
        id={id}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className={`vcare-phone-input ${error ? 'vcare-phone-input--error' : ''} ${className}`}
        style={style}
        {...rest}
      />
      {error && (
        <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#BC4338' }}>{error}</p>
      )}
    </div>
  );
}
