import React, { useState } from 'react';
import { X, Plus, Phone } from 'lucide-react';
import PhoneInput, { isValidPhoneNumber } from './PhoneInput';
import { formatMobileNumber } from '../../utils/phoneFormat';

/**
 * Reusable add/remove list of extra contact numbers. `value` is an array of
 * { number, name } objects (e.g. [{ number: "+94771234567", name: "Son - Kasun" }])
 * — the same shape the backend stores in *.secondary_phone_numbers — and
 * `onChange` receives the new array. `name` is always optional: a number can
 * be added with no name if it belongs to the applicant/client/staff member
 * themselves. Legacy plain-string entries (pre-migration data) are read as
 * { number: str, name: '' } so old data never breaks the UI.
 *
 * Pass `primaryNumber` so the person's login/primary number can't be
 * re-added here as a duplicate; the backend filters it out too.
 */
const PhoneNumbersField = ({ value = [], onChange, primaryNumber = '', disabled = false, className = '' }) => {
  const [draftNumber, setDraftNumber] = useState('');
  const [draftName, setDraftName] = useState('');
  const [error, setError] = useState('');

  const numbers = (Array.isArray(value) ? value : [])
    .map(v => (typeof v === 'string' ? { number: v, name: '' } : { number: v?.number || '', name: v?.name || '' }))
    .filter(v => v.number);

  const addNumber = () => {
    const trimmed = (draftNumber || '').trim();
    if (!trimmed) return;
    if (!isValidPhoneNumber(trimmed)) {
      setError('Enter a valid phone number.');
      return;
    }
    if (primaryNumber && trimmed === primaryNumber) {
      setError('This is already the primary number.');
      return;
    }
    if (numbers.some(n => n.number === trimmed)) {
      setError('This number has already been added.');
      return;
    }
    onChange([...numbers, { number: trimmed, name: (draftName || '').trim() }]);
    setDraftNumber('');
    setDraftName('');
    setError('');
  };

  const removeNumber = (num) => onChange(numbers.filter(n => n.number !== num));

  return (
    <div className={className}>
      {numbers.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-2.5">
          {numbers.map(({ number, name }) => (
            <div key={number} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              <Phone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span className="flex-1 min-w-0 truncate font-medium text-slate-700">
                {formatMobileNumber(number)}
                {name && <span className="ml-1.5 font-normal text-slate-400">— {name}</span>}
              </span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeNumber(number)}
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
          <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-2">
            <div className="w-full sm:flex-1 sm:min-w-[9rem]">
              <PhoneInput
                value={draftNumber}
                onChange={e => { setDraftNumber(e.target.value); setError(''); }}
                placeholder="e.g. 0771234567"
                className={error ? 'vcare-phone-input--error' : ''}
              />
            </div>
            <div className="w-full sm:flex-1 sm:min-w-[9rem]">
              <input
                type="text"
                value={draftName}
                onChange={e => setDraftName(e.target.value)}
                placeholder="Whose number? (optional)"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-colors"
              />
            </div>
            <button
              type="button"
              onClick={addNumber}
              className="inline-flex items-center justify-center gap-1 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200 transition-colors flex-shrink-0 w-full sm:w-auto"
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
