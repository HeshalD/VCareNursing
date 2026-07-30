import React from 'react';
import ReactPhoneInput from 'react-phone-number-input';
import flags from 'react-phone-number-input/flags';
import { isValidPhoneNumber } from 'libphonenumber-js';
import 'react-phone-number-input/style.css';
import './PhoneInput.css';

export { isValidPhoneNumber };

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
        defaultCountry={defaultCountry}
        value={value || undefined}
        onChange={(val) => onChange && onChange({ target: { name, value: val || '' } })}
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
