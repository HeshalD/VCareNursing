import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getCountryCallingCode } from 'react-phone-number-input';

/**
 * Custom `countrySelectComponent` for <PhoneInput> — replaces the native
 * scroll `<select>` with a searchable dropdown so users can type a country
 * name (or dial code) instead of scrolling through ~200 options.
 */
export default function SearchableCountrySelect({
  value,
  onChange,
  options,
  iconComponent: Icon,
  disabled,
  readOnly,
  name,
  className,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  const selectableOptions = useMemo(
    () => options.filter((option) => !option.divider),
    [options]
  );

  const selectedOption = useMemo(
    () => selectableOptions.find((option) => option.value === value),
    [selectableOptions, value]
  );

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return selectableOptions;
    return selectableOptions.filter((option) => {
      if (option.label.toLowerCase().includes(query)) return true;
      if (option.value) {
        try {
          const callingCode = getCountryCallingCode(option.value);
          if (callingCode && `+${callingCode}`.includes(query.replace(/\s/g, ''))) {
            return true;
          }
        } catch {
          // Some option values (e.g. "ZZ" International) have no calling code.
        }
      }
      return false;
    });
  }, [selectableOptions, search]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const selectOption = (optionValue) => {
    onChange(optionValue === 'ZZ' ? undefined : optionValue);
    setIsOpen(false);
    setSearch('');
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && filteredOptions.length > 0) {
      e.preventDefault();
      selectOption(filteredOptions[0].value || 'ZZ');
    }
  };

  const isDisabled = disabled || readOnly;

  return (
    <div className={`vcare-country-select ${className || ''}`} ref={containerRef}>
      <button
        type="button"
        className="vcare-country-select__trigger"
        disabled={isDisabled}
        onClick={() => !isDisabled && setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        name={name}
      >
        {Icon && (
          <Icon
            aria-hidden="true"
            country={value}
            label={selectedOption ? selectedOption.label : 'International'}
          />
        )}
        <span className="vcare-country-select__arrow" />
      </button>
      {isOpen && (
        <div className="vcare-country-select__dropdown">
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search country..."
            className="vcare-country-select__search"
          />
          <ul className="vcare-country-select__list" role="listbox">
            {filteredOptions.length === 0 && (
              <li className="vcare-country-select__empty">No countries found</li>
            )}
            {filteredOptions.map((option) => (
              <li
                key={option.value || 'ZZ'}
                role="option"
                aria-selected={option.value === value}
                className={`vcare-country-select__option ${
                  option.value === value ? 'vcare-country-select__option--selected' : ''
                }`}
                onClick={() => selectOption(option.value || 'ZZ')}
              >
                {Icon && <Icon aria-hidden="true" country={option.value} label={option.label} />}
                <span>{option.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
