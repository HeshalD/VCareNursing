import React from 'react';
import { Trash2 } from 'lucide-react';
import DateInput, { todayISO } from '../../../components/common/DateInput';

const fmt = (n) =>
  Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Product / Rental / Deposit line-item row (companion PRODUCT quotation).
// Shared by ModularQuoteBuilder and CreateQuotationDrawer so both quote-
// building surfaces render an identical table.
const ProductLineItemRow = ({ item, index, products, rentalUnits, canDelete, onUpdate, onDelete }) => {
  const rental = !!products.find((p) => p.product_id === item.product_id && p.product_type === 'RENTAL');

  const set = (patch) => onUpdate({ ...item, ...patch });

  const selectProduct = (productId) => {
    const product = products.find((p) => p.product_id === productId);
    set({
      product_id: productId,
      description: product ? product.name : '',
      unit_price: product ? product.price : '',
      unit_id: '',
    });
  };

  if (item.isStandaloneDeposit) {
    const amount = parseFloat(item.unit_price) || 0;
    return (
      <tr className="group border-b border-gray-100 hover:bg-gray-50/60 transition-colors">
        <td className="py-3 pl-4 w-8 text-[12px] text-gray-300 select-none">{index + 1}</td>
        <td className="py-2 pr-3">
          <input
            value={item.description || ''}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Refundable Deposit"
            className="w-full text-sm text-gray-800 bg-transparent placeholder-gray-300 border-0 outline-none focus:ring-0 p-0"
          />
          <span className="text-[11px] text-amber-600 font-medium">Refundable Deposit</span>
        </td>
        <td className="py-2 pr-3 w-24 text-right text-sm text-gray-300 select-none">—</td>
        <td className="py-2 pr-3 w-32">
          <input
            type="number"
            min="0"
            step="0.01"
            value={item.unit_price}
            onChange={(e) => set({ unit_price: e.target.value })}
            className="w-full text-sm text-gray-800 bg-transparent border-0 outline-none focus:ring-0 text-right p-0 tabular-nums"
          />
        </td>
        <td className="py-2 pr-2 w-32 text-right text-sm tabular-nums font-medium text-gray-900 select-none">
          {fmt(amount)}
        </td>
        <td className="py-2 pr-3 w-20">
          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {canDelete && (
              <button onClick={onDelete} className="p-1 text-gray-400 hover:text-red-500">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  }

  const qty    = parseFloat(item.quantity)  || 0;
  const rate   = parseFloat(item.unit_price) || 0;
  const amount = qty * rate;

  return (
    <>
      <tr className="group border-b border-gray-100 hover:bg-gray-50/60 transition-colors">
        <td className="py-3 pl-4 w-8 text-[12px] text-gray-300 select-none">{index + 1}</td>
        <td className="py-2 pr-3">
          <select
            value={item.product_id}
            onChange={(e) => selectProduct(e.target.value)}
            className="block mb-0.5 text-[11px] text-gray-400 bg-transparent border-0 outline-none focus:ring-0 p-0"
          >
            <option value="">Custom item…</option>
            {products.map((p) => (
              <option key={p.product_id} value={p.product_id}>{p.name}{p.product_type === 'RENTAL' ? ' (Rental)' : p.product_type === 'ONE_TIME_SERVICE' ? ' (Service)' : ''}</option>
            ))}
          </select>
          <input
            value={item.description || ''}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Type to enter item details"
            className="w-full text-sm text-gray-800 bg-transparent placeholder-gray-300 border-0 outline-none focus:ring-0 p-0"
          />
          {rental && <span className="text-[11px] text-purple-600 font-medium">Rental</span>}
        </td>
        <td className="py-2 pr-3 w-24">
          <input
            type="number"
            min="0"
            step="1"
            value={item.quantity}
            onChange={(e) => set({ quantity: e.target.value })}
            className="w-full text-sm text-gray-800 bg-transparent border-0 outline-none focus:ring-0 text-right p-0 tabular-nums"
          />
        </td>
        <td className="py-2 pr-3 w-32">
          <input
            type="number"
            min="0"
            step="0.01"
            value={item.unit_price}
            onChange={(e) => set({ unit_price: e.target.value })}
            className="w-full text-sm text-gray-800 bg-transparent border-0 outline-none focus:ring-0 text-right p-0 tabular-nums"
          />
        </td>
        <td className="py-2 pr-2 w-32 text-right text-sm tabular-nums font-medium text-gray-900 select-none">
          {fmt(amount)}
        </td>
        <td className="py-2 pr-3 w-20">
          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {canDelete && (
              <button onClick={onDelete} className="p-1 text-gray-400 hover:text-red-500">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </td>
      </tr>

      {rental && (
        <tr className="border-b border-gray-100 bg-gray-50/40">
          <td className="py-3 pl-4 w-8" />
          <td colSpan={5} className="py-3 pr-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-2">Rental Terms</p>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] font-medium text-gray-400 mb-0.5">Unit</label>
                <select
                  value={item.unit_id || ''}
                  onChange={(e) => set({ unit_id: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-white text-gray-800 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
                >
                  <option value="">Auto-assign</option>
                  {rentalUnits.filter((u) => u.product_id === item.product_id).map((u) => (
                    <option key={u.unit_id} value={u.unit_id}>{u.unit_code || u.unit_id.slice(0, 8)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-gray-400 mb-0.5">Billing</label>
                <select
                  value={item.rental_billing_type}
                  onChange={(e) => set({ rental_billing_type: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-white text-gray-800 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
                >
                  <option value="ONE_TIME">One-time</option>
                  <option value="RECURRING">Monthly</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-gray-400 mb-0.5">Start Date</label>
                <DateInput
                  value={item.rental_start_date}
                  onChange={(e) => set({ rental_start_date: e.target.value })}
                  min={todayISO()}
                  className="w-full rounded-lg border border-gray-200 bg-white text-gray-800 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
                />
              </div>
              {item.rental_billing_type === 'ONE_TIME' && (
                <div>
                  <label className="block text-[10px] font-medium text-gray-400 mb-0.5">End Date *</label>
                  <DateInput
                    value={item.rental_end_date}
                    onChange={(e) => set({ rental_end_date: e.target.value })}
                    min={item.rental_start_date || todayISO()}
                    className="w-full rounded-lg border border-gray-200 bg-white text-gray-800 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
                  />
                </div>
              )}
            </div>
            <div className="mt-2">
              <label className="block text-[10px] font-medium text-gray-400 mb-0.5">Refundable Deposit (optional)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={item.deposit_amount}
                onChange={(e) => set({ deposit_amount: e.target.value })}
                className="w-40 rounded-lg border border-gray-200 bg-white text-gray-800 placeholder-gray-300 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
              />
            </div>
            {item.product_id && rentalUnits.filter((u) => u.product_id === item.product_id).length === 0 && (
              <p className="mt-1 text-[10px] text-amber-600">No units currently available for this product.</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
};

export default ProductLineItemRow;
