import React from 'react';
import { ChevronUp, ChevronDown, Trash2 } from 'lucide-react';

const fmt = (n) =>
  Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Zoho-style inline editable line-item row — shared by ModularQuoteBuilder
// and CreateQuotationDrawer so both quote-building surfaces render an
// identical table.
const LineItemRow = ({ item, index, isFirst, isLast, onUpdate, onDelete, onMoveUp, onMoveDown }) => {
  const isDiscount = item.item_type === 'DISCOUNT';
  const amount     = parseFloat(item.amount) || 0;

  const set = (field, value) => {
    const next = { ...item, [field]: value };
    if (field === 'quantity' || field === 'unit_price') {
      const q = parseFloat(field === 'quantity'  ? value : item.quantity)  || 0;
      const r = parseFloat(field === 'unit_price' ? value : item.unit_price) || 0;
      next.amount = isDiscount ? -(q * r) : q * r;
    }
    onUpdate(next);
  };

  return (
    <tr className="group border-b border-gray-100 hover:bg-gray-50/60 transition-colors">
      {/* # */}
      <td className="py-3 pl-4 w-8 text-[12px] text-gray-300 select-none">{index + 1}</td>

      {/* Item / Description */}
      <td className="py-2 pr-3">
        <input
          value={item.description || ''}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Type to enter item details"
          className="w-full text-sm text-gray-800 bg-transparent placeholder-gray-300 border-0 outline-none focus:ring-0 p-0"
        />
        {isDiscount && (
          <span className="text-[11px] text-gray-400 font-medium">Discount</span>
        )}
      </td>

      {/* Qty */}
      <td className="py-2 pr-3 w-24">
        <input
          type="number"
          min="0"
          value={item.quantity ?? 1}
          onChange={(e) => set('quantity', e.target.value)}
          onWheel={(e) => e.target.blur()}
          className="w-full text-sm text-gray-800 bg-transparent border-0 outline-none focus:ring-0 text-right p-0 tabular-nums"
        />
      </td>

      {/* Rate */}
      <td className="py-2 pr-3 w-32">
        <input
          type="number"
          min="0"
          value={item.unit_price ?? 0}
          onChange={(e) => set('unit_price', e.target.value)}
          onWheel={(e) => e.target.blur()}
          className="w-full text-sm text-gray-800 bg-transparent border-0 outline-none focus:ring-0 text-right p-0 tabular-nums"
        />
      </td>

      {/* Amount */}
      <td className={`py-2 pr-2 w-32 text-right text-sm tabular-nums font-medium select-none ${isDiscount ? 'text-gray-500' : 'text-gray-900'}`}>
        {isDiscount ? `(${fmt(Math.abs(amount))})` : fmt(amount)}
      </td>

      {/* Actions */}
      <td className="py-2 pr-3 w-20">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-gray-400 hover:text-red-500"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
};

export default LineItemRow;
