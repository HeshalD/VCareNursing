import React from 'react';
import { Trash2, CalendarClock, Clock3 } from 'lucide-react';

const fmt = (n) =>
  Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const KIND_META = {
  RATE_DAILY: { label: 'Care Rate', qtyLabel: 'Days', Icon: CalendarClock, color: 'text-blue-600' },
  RATE_SHIFT: { label: 'Shift Rate', qtyLabel: 'Shifts', Icon: Clock3, color: 'text-indigo-600' },
};

// Dedicated, first-class rate row — item_subtype ('RATE_DAILY' | 'RATE_SHIFT')
// is what quoteController reads to populate quotations.daily_rate/qty_days or
// per_shift_rate/qty_shifts, instead of pattern-matching the free-text
// description (fragile — silently produced a null rate whenever the admin
// didn't happen to type "daily"/"shift" in the description). Mirrors
// RegistrationFeeRow's pattern. Shared by ModularQuoteBuilder and
// CreateQuotationDrawer.
const RateLineItemRow = ({ item, index, onUpdate, onDelete, labelOverride }) => {
  const meta = { ...(KIND_META[item.item_subtype] || KIND_META.RATE_DAILY), ...labelOverride };
  const { Icon } = meta;

  const set = (field, value) => {
    const next = { ...item, [field]: value };
    if (field === 'quantity' || field === 'unit_price') {
      const q = parseFloat(field === 'quantity' ? value : item.quantity) || 0;
      const r = parseFloat(field === 'unit_price' ? value : item.unit_price) || 0;
      next.amount = q * r;
    }
    onUpdate(next);
  };

  const amount = parseFloat(item.amount) || 0;

  return (
    <tr className="group border-b border-gray-100 hover:bg-gray-50/60 transition-colors">
      <td className="py-3 pl-4 w-8 text-[12px] text-gray-300 select-none">{index + 1}</td>

      <td className="py-2 pr-3">
        <input
          value={item.description || ''}
          onChange={(e) => set('description', e.target.value)}
          className="w-full text-sm text-gray-800 bg-transparent placeholder-gray-300 border-0 outline-none focus:ring-0 p-0"
        />
        <span className={`inline-flex items-center gap-1 text-[11px] font-medium mt-1 ${meta.color}`}>
          <Icon className="w-3 h-3" /> {meta.label}
        </span>
      </td>

      <td className="py-2 pr-3 w-24">
        <input
          type="number"
          min="0"
          value={item.quantity ?? 1}
          onChange={(e) => set('quantity', e.target.value)}
          className="w-full text-sm text-gray-800 bg-transparent border-0 outline-none focus:ring-0 text-right p-0 tabular-nums"
        />
        <span className="block text-[10px] text-gray-400 text-right">{meta.qtyLabel}</span>
      </td>

      <td className="py-2 pr-3 w-32">
        <input
          type="number"
          min="0"
          step="0.01"
          value={item.unit_price ?? 0}
          onChange={(e) => set('unit_price', e.target.value)}
          className="w-full text-sm text-gray-800 bg-transparent border-0 outline-none focus:ring-0 text-right p-0 tabular-nums"
        />
      </td>

      <td className="py-2 pr-2 w-32 text-right text-sm tabular-nums font-medium text-gray-900 select-none">
        {fmt(amount)}
      </td>

      <td className="py-2 pr-3 w-20">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onDelete} className="p-1 text-gray-400 hover:text-red-500">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
};

export default RateLineItemRow;
