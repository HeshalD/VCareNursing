import { useState } from 'react';
import { SRI_LANKAN_BANKS, OTHER_BANK } from '../../constants/sriLankanBanks';

// Dropdown of Sri Lankan banks with an "Other" escape hatch (free text) so existing
// records with names outside the list still display and can be edited.
// `value` / `onChange(string)` work with the plain bank-name string, like a text input.
const BankSelect = ({ value, onChange, className = '', required = false, disabled = false }) => {
  const isCustom = !!value && !SRI_LANKAN_BANKS.includes(value);
  const [otherMode, setOtherMode] = useState(false);
  const showOther = otherMode || isCustom;

  const handleSelect = (e) => {
    const v = e.target.value;
    if (v === OTHER_BANK) {
      setOtherMode(true);
      if (!isCustom) onChange('');
    } else {
      setOtherMode(false);
      onChange(v);
    }
  };

  return (
    <div className="space-y-2">
      <select
        value={showOther ? OTHER_BANK : value || ''}
        onChange={handleSelect}
        required={required}
        disabled={disabled}
        className={className}
      >
        <option value="">Select bank</option>
        {SRI_LANKAN_BANKS.map((b) => (
          <option key={b} value={b}>{b}</option>
        ))}
        <option value={OTHER_BANK}>Other (type name)</option>
      </select>
      {showOther && (
        <input
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter bank name"
          required={required}
          disabled={disabled}
          className={className}
        />
      )}
    </div>
  );
};

export default BankSelect;
