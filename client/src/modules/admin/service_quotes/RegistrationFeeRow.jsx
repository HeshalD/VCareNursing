import React from 'react';
import { Trash2, BadgeDollarSign } from 'lucide-react';

const fmt = (n) =>
  Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Registration Fee row — a dedicated, first-class item (is_registration_fee)
// so paymentTrackingController.recordPayment can detect it unambiguously and
// treat it as the first "bucket" any payment on the quote fills. Prints on
// the client's PDF like any other charge — only the assigned salesperson
// stays internal. Shared by ModularQuoteBuilder and CreateQuotationDrawer.
const RegistrationFeeRow = ({ item, index, salespersons, onUpdate, onDelete }) => {
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
        <div className="mt-1 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 font-medium">
            <BadgeDollarSign className="w-3 h-3" /> Registration Fee
          </span>
          <span className="text-gray-200">·</span>
          <select
            value={item.salesperson_id || ''}
            onChange={(e) => set('salesperson_id', e.target.value)}
            className="text-[11px] text-gray-400 bg-transparent border-0 outline-none focus:ring-0 p-0"
          >
            <option value="">Credit to salesperson…</option>
            {salespersons.map((sp) => (
              <option key={sp.id} value={sp.id}>{sp.full_name}</option>
            ))}
          </select>
        </div>
      </td>

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

      <td className="py-2 pr-3 w-32">
        <input
          type="number"
          min="0"
          step="0.01"
          value={item.unit_price ?? 0}
          onChange={(e) => set('unit_price', e.target.value)}
          onWheel={(e) => e.target.blur()}
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

export default RegistrationFeeRow;
