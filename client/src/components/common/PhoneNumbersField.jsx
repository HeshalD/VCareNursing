import React, { useState } from 'react';
import { X, Plus, Phone } from 'lucide-react';
import PhoneInput, { isValidPhoneNumber } from './PhoneInput';
import { formatMobileNumber } from '../../utils/phoneFormat';

/**
 * Reusable add/remove list of extra contact numbers. `value` is an array of
 * E.164 strings (e.g. ["+94771234567"]) — the same shape the backend stores in
 * *.secondary_phone_numbers — and `onChange` receives the new array.
 *
 * Pass `primaryNumber` so the staff member's login/primary number can't be
 * re-added here as a duplicate; the backend filters it out too.
 */
const PhoneNumbersField = ({ value = [], onChange, primaryNumber = '', disabled = false, className = '' }) => {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const numbers = Array.isArray(value) ? value : [];

  const addNumber = () => {
    const trimmed = (draft || '').trim();
    if (!trimmed) return;
    if (!isValidPhoneNumber(trimmed)) {
      setError('Enter a valid phone number.');
      return;
    }
    if (primaryNumber && trimmed === primaryNumber) {
      setError('This is already the primary number.');
      return;
    }
    if (numbers.includes(trimmed)) {
      setError('This number has already been added.');
      return;
    }
    onChange([...numbers, trimmed]);
    setDraft('');
    setError('');
  };

  const removeNumber = (num) => onChange(numbers.filter(n => n !== num));

  return (
    <div className={className}>
      {numbers.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-2.5">
          {numbers.map((num) => (
            <div key={num} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              <Phone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span className="flex-1 min-w-0 truncate font-medium text-slate-700">{formatMobileNumber(num)}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeNumber(num)}
                  title="Remove number"
                  className="flex-shrink-0 text-red-500 hover:text-red-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!disabled && (
        <>
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <PhoneInput
                value={draft}
                onChange={e => { setDraft(e.target.value); setError(''); }}
                placeholder="e.g. 0771234567"
                className={error ? 'vcare-phone-input--error' : ''}
              />
            </div>
            <button
              type="button"
              onClick={addNumber}
              className="inline-flex items-center gap-1 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200 transition-colors flex-shrink-0"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </>
      )}

      {disabled && numbers.length === 0 && (
        <p className="text-xs text-slate-400">No additional numbers.</p>
      )}
    </div>
  );
};

export default PhoneNumbersField;
