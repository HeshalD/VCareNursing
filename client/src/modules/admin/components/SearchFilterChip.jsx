import React from 'react';
import { Search, X } from 'lucide-react';

// Shown on list pages that were opened from global search with a `?search=` filter applied,
// so it's obvious why rows are hidden and easy to undo.
const SearchFilterChip = ({ value, onClear }) => {
  if (!value) return null;
  return (
    <div className="inline-flex items-center gap-2 self-start rounded-full bg-blue-50 text-blue-700 text-xs font-medium pl-3 pr-1.5 py-1">
      <Search className="w-3.5 h-3.5" />
      <span>Filtered by "{value}"</span>
      <button type="button" onClick={onClear} className="p-0.5 rounded-full hover:bg-blue-100" aria-label="Clear search filter">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export default SearchFilterChip;
