import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import {
  User,
  Phone,
  MapPin,
  FileText,
  Send,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
  Plus,
  Eye,
  Edit3,
  Tag,
  Download,
  RefreshCw,
  Trash2,
  ChevronUp,
  ChevronDown,
  Percent,
  Package,
  ShoppingBag,
  BadgeDollarSign,
} from 'lucide-react';
import PresetItemSelector from '../service_quotes/PresetItemSelector';
import PresetManager from '../service_quotes/PresetManager';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
const fmt = (n) =>
  Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const InfoRow = ({ label, value }) => (
  <div>
    <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
    <p className="mt-0.5 text-sm text-gray-800 font-medium">{value || '—'}</p>
  </div>
);

// ---------------------------------------------------------------------------
// Products & Rentals — a companion PRODUCT-type quotation built alongside the
// service quote (see ensureProductQuoteCreated below). Kept as its own
// item-type ('PRODUCT' | 'RENTAL' | 'DEPOSIT') and its own line-item array,
// separate from the service CHARGE/DISCOUNT items above, since it's sent to
// the client as a second quotation through the existing product-quote
// pipeline (rental agreements, deposits, product invoices) rather than being
// mixed into the booking's daily-invoice flow.
const emptyProductLine = () => ({
  description: '', quantity: 1, unit_price: '', product_id: '', unit_id: '',
  rental_billing_type: 'ONE_TIME', rental_start_date: new Date().toISOString().slice(0, 10),
  rental_end_date: '', deposit_amount: '',
});

const emptyDepositLine = () => ({
  description: 'Refundable Deposit', quantity: 1, unit_price: '', isStandaloneDeposit: true,
});

// Builds the single, unified line-item list the preview (and the actual
// merged PDF — see quoteController.mergeProductQuoteIntoData) shows: service
// charges/discounts followed by product/rental items, with each rental
// item's billing cadence + specific unit folded into its own description and
// its deposit (if any) appended as its own line, exactly like the backend's
// expandProductLineItemsForDisplay.
const buildPreviewItems = (validLineItems, validProductLineItems, rentalUnits, isRentalLine) => {
  const items = validLineItems.map((it) => ({ ...it }));

  for (const it of validProductLineItems) {
    if (it.isStandaloneDeposit) {
      const amount = parseFloat(it.unit_price) || 0;
      items.push({
        item_type: 'DEPOSIT',
        description: it.description,
        quantity: 1,
        unit_price: amount,
        amount,
        isProductItem: true,
      });
      continue;
    }

    const qty = parseFloat(it.quantity) || 1;
    const price = parseFloat(it.unit_price) || 0;
    const amount = qty * price;
    const rental = isRentalLine(it);

    if (rental) {
      const billingLabel = it.rental_billing_type === 'RECURRING' ? 'Billed monthly' : 'One-time, fixed period';
      const unit = rentalUnits.find((u) => u.unit_id === it.unit_id);
      const unitLabel = unit?.unit_code ? ` — Unit ${unit.unit_code}` : '';
      items.push({
        item_type: 'RENTAL',
        description: `${it.description}${unitLabel} (${billingLabel})`,
        quantity: qty,
        unit_price: price,
        amount,
        isProductItem: true,
      });

      const depositAmt = parseFloat(it.deposit_amount) || 0;
      if (depositAmt > 0) {
        items.push({
          item_type: 'DEPOSIT',
          description: `Refundable Deposit for ${it.description} (fully refundable on return)`,
          quantity: 1,
          unit_price: depositAmt,
          amount: depositAmt,
          isProductItem: true,
        });
      }
    } else {
      items.push({
        item_type: 'PRODUCT',
        description: it.description,
        quantity: qty,
        unit_price: price,
        amount,
        isProductItem: true,
      });
    }
  }

  return items;
};

// ---------------------------------------------------------------------------
// Inline editable line-item row (Zoho-style)
// ---------------------------------------------------------------------------
const LineItemRow = ({ item, index, isFirst, isLast, onUpdate, onDelete, onMoveUp, onMoveDown }) => {
  const isDiscount = item.item_type === 'DISCOUNT';
  const qty        = parseFloat(item.quantity)  || 0;
  const rate       = parseFloat(item.unit_price) || 0;
  const amount     = parseFloat(item.amount)     || 0;

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

// ---------------------------------------------------------------------------
// Registration Fee line item — a dedicated, first-class item (not the old
// free-text preset) so paymentTrackingController.recordPayment can detect it
// unambiguously via is_registration_fee and treat it as the first "bucket"
// any payment on the quote fills. Prints on the client's PDF like any other
// charge (see estimateTemplate) — only the assigned salesperson stays
// internal, never rendered there.
// ---------------------------------------------------------------------------
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

  return (
    <tr className="border-b border-gray-100 bg-amber-50/40">
      <td className="py-3 pl-4 w-8 text-[12px] text-gray-300 select-none align-top">{index + 1}</td>
      <td colSpan={5} className="py-2.5 pr-3">
        <div className="rounded-lg border border-amber-100 p-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 shrink-0 rounded bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700">
              <BadgeDollarSign className="w-3 h-3" /> Registration Fee
            </span>
            <input
              type="text"
              value={item.description}
              onChange={(e) => set('description', e.target.value)}
              className="flex-1 rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={item.unit_price}
              onChange={(e) => set('unit_price', e.target.value)}
              className="w-32 rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1.5 text-sm text-right outline-none focus:border-blue-500"
            />
            <button type="button" onClick={onDelete} className="text-gray-400 hover:text-red-500">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-medium text-gray-500 shrink-0">Credit to Salesperson</label>
            <select
              value={item.salesperson_id || ''}
              onChange={(e) => set('salesperson_id', e.target.value)}
              className="w-56 rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1 text-xs outline-none focus:border-blue-500"
            >
              <option value="">Not assigned</option>
              {salespersons.map((sp) => (
                <option key={sp.id} value={sp.id}>{sp.full_name}</option>
              ))}
            </select>
            <span className="text-[10px] text-gray-400">Internal only — never printed on the client's document</span>
          </div>
        </div>
      </td>
    </tr>
  );
};

// ---------------------------------------------------------------------------
// Product / Rental line-item row (companion PRODUCT quotation)
// ---------------------------------------------------------------------------
const ProductLineItemRow = ({ item, products, rentalUnits, canDelete, onUpdate, onDelete }) => {
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
    return (
      <div className="rounded-lg border border-amber-100 bg-amber-50/40 p-2.5">
        <div className="flex items-center gap-2">
          <span className="w-36 shrink-0 text-[11px] font-semibold text-amber-700">Refundable Deposit</span>
          <input
            type="text"
            placeholder="Description"
            value={item.description}
            onChange={(e) => set({ description: e.target.value })}
            className="flex-1 rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Amount"
            value={item.unit_price}
            onChange={(e) => set({ unit_price: e.target.value })}
            className="w-28 rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1.5 text-sm outline-none focus:border-blue-500"
          />
          {canDelete && (
            <button type="button" onClick={onDelete} className="text-gray-400 hover:text-red-500">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <p className="mt-1 pl-[9.5rem] text-[10px] text-amber-600">
          Held by the company regardless of any rental item; refunded or forfeited later from the Products page.
        </p>
      </div>
    );
  }

  return (
    <div className={rental ? 'rounded-lg border border-purple-100 bg-purple-50/40 p-2.5 space-y-2' : 'rounded-lg border border-gray-100 p-2.5'}>
      <div className="flex items-center gap-2">
        <select
          value={item.product_id}
          onChange={(e) => selectProduct(e.target.value)}
          className="w-40 rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
        >
          <option value="">Custom item…</option>
          {products.map((p) => (
            <option key={p.product_id} value={p.product_id}>{p.name}{p.product_type === 'RENTAL' ? ' (Rental)' : ''}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Description"
          value={item.description}
          onChange={(e) => set({ description: e.target.value })}
          className="flex-1 rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
        />
        <input
          type="number"
          min="0"
          step="1"
          placeholder="Qty"
          value={item.quantity}
          onChange={(e) => set({ quantity: e.target.value })}
          className="w-16 rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1.5 text-sm outline-none focus:border-blue-500"
        />
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Unit price"
          value={item.unit_price}
          onChange={(e) => set({ unit_price: e.target.value })}
          className="w-28 rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1.5 text-sm outline-none focus:border-blue-500"
        />
        {canDelete && (
          <button type="button" onClick={onDelete} className="text-gray-400 hover:text-red-500">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {rental && (
        <div className="pl-1 space-y-2">
          <p className="text-[11px] font-semibold text-purple-700">Rental Terms for this item</p>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Specific Unit</label>
            <select
              value={item.unit_id || ''}
              onChange={(e) => set({ unit_id: e.target.value })}
              className="w-56 rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1 text-xs outline-none focus:border-blue-500"
            >
              <option value="">Auto-assign any available unit</option>
              {rentalUnits.filter((u) => u.product_id === item.product_id).map((u) => (
                <option key={u.unit_id} value={u.unit_id}>{u.unit_code || u.unit_id.slice(0, 8)}</option>
              ))}
            </select>
            {item.product_id && rentalUnits.filter((u) => u.product_id === item.product_id).length === 0 && (
              <p className="mt-0.5 text-[10px] text-amber-600">No units currently available for this product.</p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Billing</label>
              <select
                value={item.rental_billing_type}
                onChange={(e) => set({ rental_billing_type: e.target.value })}
                className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1 text-xs outline-none focus:border-blue-500"
              >
                <option value="ONE_TIME">One-time</option>
                <option value="RECURRING">Monthly</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Start Date</label>
              <input
                type="date"
                value={item.rental_start_date}
                onChange={(e) => set({ rental_start_date: e.target.value })}
                className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1 text-xs outline-none focus:border-blue-500"
              />
            </div>
            {item.rental_billing_type === 'ONE_TIME' && (
              <div>
                <label className="block text-[10px] font-medium text-gray-500 mb-0.5">End Date *</label>
                <input
                  type="date"
                  value={item.rental_end_date}
                  onChange={(e) => set({ rental_end_date: e.target.value })}
                  className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1 text-xs outline-none focus:border-blue-500"
                />
              </div>
            )}
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Refundable Deposit (optional)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={item.deposit_amount}
              onChange={(e) => set({ deposit_amount: e.target.value })}
              className="w-40 rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-2 py-1 text-xs outline-none focus:border-blue-500"
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Quote Preview Panel
// ---------------------------------------------------------------------------
const QuotePreviewPanel = ({
  serviceRequest,
  previewItems,
  termsConditions,
  onBack,
  onGenerateDownload,
  onGenerateSend,
  onSend,
  onResend,
  loadingAction,
  deliveryState,
  error,
}) => {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // One flat list — service charges/discounts and product/rental/deposit
  // items together, in the same order and shape as the actual merged PDF
  // (see quoteController.mergeProductQuoteIntoData) — so this preview never
  // drifts from what's really sent, and there's a single running total.
  const discountItems  = previewItems.filter(i => i.item_type === 'DISCOUNT');
  const chargeItems    = previewItems.filter(i => i.item_type !== 'DISCOUNT');
  const subtotal        = chargeItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const totalDiscounts = discountItems.reduce((s, i) => s + Math.abs(parseFloat(i.amount) || 0), 0);
  const grandTotal     = subtotal - totalDiscounts;
  const busy           = !!loadingAction;

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        disabled={busy}
        className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-40"
      >
        <Edit3 className="w-3.5 h-3.5" />
        Back to edit
      </button>

      {/* Document */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

        {/* Header bar */}
        <div className="px-8 py-6 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">VCare Nursing</h1>
            <p className="text-[12px] text-gray-400 mt-0.5">Professional Home Care Services</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Quotation — Draft</p>
            <p className="text-[12px] text-gray-500 mt-1">{today}</p>
          </div>
        </div>

        {/* Bill-to grid */}
        <div className="px-8 py-5 border-b border-gray-100 grid grid-cols-2 gap-6">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1.5">Billed To</p>
            <p className="text-sm font-semibold text-gray-900">{serviceRequest.payer_name}</p>
            <p className="text-[12px] text-gray-500 mt-0.5">{serviceRequest.payer_mobile}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1.5">Care Recipient</p>
            <p className="text-sm font-semibold text-gray-900">{serviceRequest.patient_name}</p>
            {serviceRequest.patient_age && (
              <p className="text-[12px] text-gray-500 mt-0.5">Age {serviceRequest.patient_age}</p>
            )}
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1.5">Service</p>
            <p className="text-[12px] text-gray-700">{serviceRequest.service_type?.replace(/_/g, ' ')}</p>
            {serviceRequest.service_model && (
              <p className="text-[12px] text-gray-500">{serviceRequest.service_model.replace(/_/g, ' ')}</p>
            )}
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1.5">Location</p>
            <p className="text-[12px] text-gray-700">{serviceRequest.location_address || '—'}</p>
          </div>
        </div>

        {/* Items table */}
        <div className="px-8 py-5">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400 w-8">#</th>
                <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400">Item &amp; Description</th>
                <th className="pb-2 text-right text-[11px] font-medium uppercase tracking-wider text-gray-400 w-20">Qty</th>
                <th className="pb-2 text-right text-[11px] font-medium uppercase tracking-wider text-gray-400 w-28">Rate</th>
                <th className="pb-2 text-right text-[11px] font-medium uppercase tracking-wider text-gray-400 w-28">Amount</th>
              </tr>
            </thead>
            <tbody>
              {previewItems.map((item, idx) => {
                const isDiscount = item.item_type === 'DISCOUNT';
                const amount     = Math.abs(parseFloat(item.amount) || 0);
                const unitPrice  = parseFloat(item.unit_price) || 0;
                const qty        = parseFloat(item.quantity) || 1;
                return (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="py-3 text-[12px] text-gray-300">{idx + 1}</td>
                    <td className="py-3">
                      <p className={`text-sm font-medium ${item.isProductItem ? 'text-purple-700' : 'text-gray-800'}`}>{item.description}</p>
                      {isDiscount && <p className="text-[11px] text-gray-400 mt-0.5">Discount</p>}
                    </td>
                    <td className="py-3 text-right text-sm text-gray-600 tabular-nums">{qty}</td>
                    <td className="py-3 text-right text-sm text-gray-600 tabular-nums">{fmt(unitPrice)}</td>
                    <td className={`py-3 text-right text-sm tabular-nums font-medium ${isDiscount ? 'text-gray-500' : item.isProductItem ? 'text-purple-800' : 'text-gray-900'}`}>
                      {isDiscount ? `(${fmt(amount)})` : fmt(amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Totals */}
          <div className="mt-4 pt-3 border-t border-gray-100 flex flex-col items-end gap-1.5">
            <div className="flex justify-between w-52 text-[13px] text-gray-600">
              <span>Subtotal</span>
              <span className="tabular-nums">{fmt(subtotal)}</span>
            </div>
            {totalDiscounts > 0 && (
              <div className="flex justify-between w-52 text-[13px] text-gray-500">
                <span>Discounts</span>
                <span className="tabular-nums">({fmt(totalDiscounts)})</span>
              </div>
            )}
            <div className="flex justify-between w-52 text-[14px] font-semibold text-gray-900 border-t border-gray-200 pt-2 mt-1">
              <span>Total</span>
              <span className="tabular-nums">LKR {fmt(grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* Terms */}
        {termsConditions && (
          <div className="px-8 pb-6">
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1.5">Terms &amp; Conditions</p>
            <p className="text-[12px] text-gray-600 leading-relaxed">{termsConditions}</p>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className="text-[13px] text-red-700">{error}</span>
        </div>
      )}

      {/* Action buttons */}
      {!deliveryState && (
        <div className="flex gap-3">
          <button
            onClick={onGenerateDownload}
            disabled={busy}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loadingAction === 'downloading' ? (
              <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500" />Generating…</>
            ) : (
              <><Download className="w-4 h-4" />Generate &amp; Download</>
            )}
          </button>
          <button
            onClick={onGenerateSend}
            disabled={busy}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-[13px] font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loadingAction === 'sending' ? (
              <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Sending…</>
            ) : (
              <><Send className="w-4 h-4" />Generate &amp; Send</>
            )}
          </button>
        </div>
      )}

      {deliveryState === 'downloaded' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[13px] text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5">
            <CheckCircle className="w-4 h-4 text-gray-500 flex-shrink-0" />
            PDF downloaded successfully.
          </div>
          <button
            onClick={onSend}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-[13px] font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loadingAction === 'sending' ? (
              <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Sending…</>
            ) : (
              <><Send className="w-4 h-4" />Send via WhatsApp</>
            )}
          </button>
        </div>
      )}

      {deliveryState === 'sent' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[13px] text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5">
            <CheckCircle className="w-4 h-4 text-gray-500 flex-shrink-0" />
            Quote sent to client via WhatsApp.
          </div>
          <button
            onClick={onResend}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loadingAction === 'resending' ? (
              <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400" />Resending…</>
            ) : (
              <><RefreshCw className="w-4 h-4" />Resend via WhatsApp</>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const ModularQuoteBuilder = () => {
  const { requestId } = useParams();
  const navigate = useNavigate();

  const [serviceRequest, setServiceRequest] = useState(null);
  const [clientProfile, setClientProfile]   = useState(null);
  const [presets, setPresets]               = useState([]);
  const [lineItems, setLineItems]           = useState([]);
  const [termsConditions, setTermsConditions] = useState(
    'The initial estimated amount is non-refundable.'
  );
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [showPresetManager, setShowPresetManager] = useState(false);

  // Products & Rentals — companion PRODUCT quotation (see emptyProductLine)
  const [products, setProducts]                 = useState([]);
  const [rentalUnits, setRentalUnits]           = useState([]);
  const [productLineItems, setProductLineItems] = useState([]);
  const [createdProductQuote, setCreatedProductQuote] = useState(null);

  // Registration Fee — see RegistrationFeeRow. Salesperson list load is
  // non-fatal (requires SUPER_ADMIN/COORDINATOR); the picker just stays empty
  // if the current admin can't see it.
  const [salespersons, setSalespersons] = useState([]);

  // Preview / delivery
  const [showPreview, setShowPreview]     = useState(false);
  const [createdQuote, setCreatedQuote]   = useState(null);
  const [loadingAction, setLoadingAction] = useState(null);
  const [deliveryState, setDeliveryState] = useState(null);

  useEffect(() => {
    if (requestId) {
      fetchServiceRequest();
      fetchPresets();
    } else {
      fetchNewLeads();
    }
    apiClient.getProducts().then((res) => setProducts(Array.isArray(res?.data) ? res.data : [])).catch(() => setProducts([]));
    apiClient.getRentalUnits({ status: 'AVAILABLE' }).then((res) => setRentalUnits(Array.isArray(res?.data) ? res.data : [])).catch(() => setRentalUnits([]));
    apiClient.getSalespersons().then((res) => setSalespersons(Array.isArray(res?.data) ? res.data : [])).catch(() => setSalespersons([]));
  }, [requestId]);

  const fetchServiceRequest = async () => {
    try {
      setLoading(true);
      const res = await apiClient.getServiceRequestById(requestId);
      setServiceRequest(res.data);
      if (res.data.client_id) {
        try {
          const cr = await apiClient.getClientProfile(res.data.client_id);
          setClientProfile(cr.data);
        } catch { /* non-critical */ }
      }
    } catch (err) {
      setError(err.message?.includes('404') ? 'Service request not found' : 'Failed to fetch service request');
    } finally {
      setLoading(false);
    }
  };

  const fetchNewLeads = async () => {
    try {
      setLoading(true);
      const res   = await apiClient.getNewLeads();
      const leads = res.data || [];
      if (leads.length === 0) { setError('No new leads found'); return; }
      setServiceRequest(leads[0]);
      navigate(`/admin/modular-quote-builder/${leads[0].request_id}`, { replace: true });
    } catch { setError('Failed to fetch new leads'); }
    finally { setLoading(false); }
  };

  const fetchPresets = async () => {
    try {
      const res  = await fetch('/api/quotes/presets', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      setPresets(data.data || []);
    } catch { /* non-critical */ }
  };

  // ── Line item helpers ──────────────────────────────────────────────────────
  const addPresetItem = (p) =>
    setLineItems(prev => [...prev, { ...p, sort_order: prev.length }]);

  const addItem = (type) =>
    setLineItems(prev => [
      ...prev,
      { item_type: type, description: '', quantity: 1, unit_price: 0, amount: 0, sort_order: prev.length },
    ]);

  const hasRegistrationFeeItem = lineItems.some(i => i.is_registration_fee);
  const registrationFeeAlreadySettled = ['PAID', 'WAIVED'].includes(clientProfile?.reg_fee_status);
  const canAddRegistrationFee = !!serviceRequest?.client_id && !hasRegistrationFeeItem && !registrationFeeAlreadySettled;

  const addRegistrationFeeItem = () => {
    const amount = parseFloat(clientProfile?.reg_fee_amount) || 10000;
    setLineItems(prev => [
      ...prev,
      {
        item_type: 'CHARGE',
        description: 'Registration Fee',
        quantity: 1,
        unit_price: amount,
        amount,
        is_registration_fee: true,
        salesperson_id: '',
        sort_order: prev.length,
      },
    ]);
  };

  const updateLineItem = (index, updated) => {
    const next = [...lineItems];
    next[index] = updated;
    setLineItems(next);
  };

  const deleteLineItem = (index) =>
    setLineItems(lineItems.filter((_, i) => i !== index).map((it, i) => ({ ...it, sort_order: i })));

  const moveLineItem = (index, dir) => {
    const next   = [...lineItems];
    const target = dir === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= lineItems.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setLineItems(next.map((it, i) => ({ ...it, sort_order: i })));
  };

  // ── Product / Rental line item helpers ─────────────────────────────────────
  const addProductLine = () => setProductLineItems((prev) => [...prev, emptyProductLine()]);
  const addDepositLine = () => setProductLineItems((prev) => [...prev, emptyDepositLine()]);

  const updateProductLine = (index, updated) => {
    const next = [...productLineItems];
    next[index] = updated;
    setProductLineItems(next);
  };

  const deleteProductLine = (index) =>
    setProductLineItems(productLineItems.filter((_, i) => i !== index));

  const isRentalLine = (it) => !!products.find((p) => p.product_id === it.product_id && p.product_type === 'RENTAL');

  // ── Derived ────────────────────────────────────────────────────────────────
  const isItemValid = (item) =>
    item.description?.trim() && Math.abs(parseFloat(item.amount) || 0) > 0;

  const validLineItems = lineItems.filter(isItemValid);
  const skippedCount   = lineItems.length - validLineItems.length;

  const charges        = validLineItems.filter(i => i.item_type === 'CHARGE');
  const discounts      = validLineItems.filter(i => i.item_type === 'DISCOUNT');
  const totalCharges   = charges.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const totalDiscounts = discounts.reduce((s, i) => s + Math.abs(parseFloat(i.amount) || 0), 0);
  const grandTotal     = totalCharges - totalDiscounts;

  const validProductLineItems = productLineItems.filter((it) => it.description?.trim() && it.unit_price !== '');
  // Mirrors quoteController.expandProductLineItemsForDisplay: a rental
  // item's own deposit_amount rides along as its own line/total on the
  // merged PDF, same as a standalone deposit line's full amount.
  const productTotal = validProductLineItems.reduce((s, it) => {
    const base = (parseFloat(it.quantity) || 1) * (parseFloat(it.unit_price) || 0);
    const depositExtra = (!it.isStandaloneDeposit && isRentalLine(it)) ? (parseFloat(it.deposit_amount) || 0) : 0;
    return s + base + depositExtra;
  }, 0);
  const combinedTotal = grandTotal + productTotal;

  // ── Preview trigger ────────────────────────────────────────────────────────
  const handlePreviewClick = () => {
    if (validLineItems.length === 0) return;
    if (combinedTotal <= 0) { setError('Quote total must be greater than zero'); return; }
    for (const it of validProductLineItems) {
      if (isRentalLine(it) && it.rental_billing_type === 'ONE_TIME' && !it.rental_end_date) {
        setError(`End date is required for the one-time rental item "${it.description}"`);
        return;
      }
    }
    setError(null);
    setShowPreview(true);
  };

  // ── Create quote (once) ────────────────────────────────────────────────────
  const ensureQuoteCreated = async () => {
    if (createdQuote) return createdQuote;
    const res = await fetch('/api/quotes/create-modular', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({
        request_id: serviceRequest.request_id,
        line_items: validLineItems,
        terms_conditions: termsConditions,
      }),
    });
    if (!res.ok) throw new Error('Failed to create quote');
    const data = await res.json();
    setCreatedQuote(data.data);
    return data.data;
  };

  // Companion PRODUCT-type quotation, created via the existing product-quote
  // pipeline (see quoteController.createModularQuotation) rather than mixing
  // rental/product items into the service quote's own line items — this
  // keeps rental-unit locking, deposits and invoicing on the tested path.
  // Returns null when there's nothing to quote (no product/rental items).
  const ensureProductQuoteCreated = async (serviceQuoteId) => {
    if (validProductLineItems.length === 0) return null;
    if (createdProductQuote) return createdProductQuote;
    const res = await apiClient.createProductQuotation({
      client_id: serviceRequest.client_id,
      linked_quote_id: serviceQuoteId,
      line_items: validProductLineItems.map((it) => {
        if (it.isStandaloneDeposit) {
          return { item_type: 'DEPOSIT', description: it.description, quantity: 1, unit_price: parseFloat(it.unit_price) || 0 };
        }
        const rental = isRentalLine(it);
        return {
          item_type: rental ? 'RENTAL' : 'PRODUCT',
          description: it.description,
          quantity: parseFloat(it.quantity) || 1,
          unit_price: parseFloat(it.unit_price) || 0,
          product_id: it.product_id || undefined,
          ...(rental ? {
            unit_id: it.unit_id || undefined,
            rental_billing_type: it.rental_billing_type,
            rental_start_date: it.rental_start_date,
            rental_end_date: it.rental_billing_type === 'ONE_TIME' ? it.rental_end_date : undefined,
            deposit_amount: it.deposit_amount ? parseFloat(it.deposit_amount) : 0,
          } : {}),
        };
      }),
    });
    setCreatedProductQuote(res.data);
    return res.data;
  };

  // ── Action handlers ────────────────────────────────────────────────────────
  // The companion PRODUCT quote (if any) is still created as its own row —
  // acceptProductQuote needs it to create real rental agreements/deposits/
  // invoices later — but its line items are folded into the SERVICE quote's
  // own PDF server-side (see quoteController.mergeProductQuoteIntoData), so
  // the client only ever gets ONE combined document and ONE WhatsApp message.
  const handleGenerateDownload = async () => {
    try {
      setLoadingAction('downloading');
      setError(null);
      const quote = await ensureQuoteCreated();
      const productQuote = await ensureProductQuoteCreated(quote.quote_id);
      const res = await apiClient.generateQuotePdf(quote.quote_id, productQuote?.quote_id);
      const url = res?.pdf_url || res?.data?.pdf_url;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      setDeliveryState('downloaded');
    } catch { setError('Failed to generate PDF'); }
    finally { setLoadingAction(null); }
  };

  const handleGenerateSend = async () => {
    try {
      setLoadingAction('sending');
      setError(null);
      const quote = await ensureQuoteCreated();
      const productQuote = await ensureProductQuoteCreated(quote.quote_id);
      await apiClient.sendQuotePDF(quote.quote_id, productQuote?.quote_id);
      setDeliveryState('sent');
    } catch { setError('Failed to send quote'); }
    finally { setLoadingAction(null); }
  };

  const handleSend = async () => {
    if (!createdQuote) return;
    try {
      setLoadingAction('sending');
      setError(null);
      await apiClient.sendQuotePDF(createdQuote.quote_id, createdProductQuote?.quote_id);
      setDeliveryState('sent');
    } catch { setError('Failed to send quote'); }
    finally { setLoadingAction(null); }
  };

  const handleResend = async () => {
    if (!createdQuote) return;
    try {
      setLoadingAction('resending');
      setError(null);
      await apiClient.sendQuotePDF(createdQuote.quote_id, createdProductQuote?.quote_id);
    } catch { setError('Failed to resend quote'); }
    finally { setLoadingAction(null); }
  };

  // ── Loading / error screens ────────────────────────────────────────────────
  if (loading) {
    return (
      <AdminLayout title="Quote Builder" subtitle="Loading…">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  if (error && !serviceRequest) {
    return (
      <AdminLayout title="Quote Builder" subtitle="Error">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span className="text-sm text-red-700">{error}</span>
        </div>
        <button
          onClick={() => navigate('/admin/service-requests')}
          className="mt-4 flex items-center gap-2 text-[13px] text-blue-600 hover:text-blue-800"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Service Requests
        </button>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Quote Builder"
      subtitle={serviceRequest ? `For ${serviceRequest.patient_name}` : 'Create Quote'}
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── LEFT: Service Request Details ── */}
        <div className="xl:col-span-1">
          <div className="rounded-lg border border-gray-200 bg-white sticky top-4 divide-y divide-gray-100">

            {/* Header */}
            <div className="px-5 py-4 flex items-center gap-2.5">
              <FileText className="w-4 h-4 text-gray-400" />
              <h2 className="text-[13px] font-semibold text-gray-900">Service Request</h2>
              {serviceRequest?.service_request_code && (
                <span className="ml-auto text-[11px] font-mono text-gray-400">
                  {serviceRequest.service_request_code}
                </span>
              )}
            </div>

            {/* Payer */}
            <div className="px-5 py-4 space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Payer</p>
              <div className="grid grid-cols-1 gap-3">
                <InfoRow label="Name"   value={serviceRequest?.payer_name} />
                <InfoRow label="Mobile" value={serviceRequest?.payer_mobile} />
              </div>
            </div>

            {/* Care recipient */}
            <div className="px-5 py-4 space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Care Recipient</p>
              <div className="grid grid-cols-2 gap-3">
                <InfoRow label="Name"      value={serviceRequest?.patient_name} />
                <InfoRow label="Age"       value={serviceRequest?.patient_age ? `${serviceRequest.patient_age} yrs` : null} />
                <InfoRow label="Condition" value={serviceRequest?.patient_condition} />
                <InfoRow label="Gender"    value={serviceRequest?.preferred_gender || 'Any'} />
              </div>
            </div>

            {/* Service */}
            <div className="px-5 py-4 space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Service</p>
              <div className="grid grid-cols-2 gap-3">
                <InfoRow label="Type"  value={serviceRequest?.service_type?.replace(/_/g, ' ')} />
                <InfoRow label="Model" value={serviceRequest?.service_model?.replace(/_/g, ' ')} />
              </div>
            </div>

            {/* Location */}
            <div className="px-5 py-4">
              <InfoRow label="Location" value={serviceRequest?.location_address} />
            </div>

            {/* Registration status */}
            {clientProfile && (
              <div className="px-5 py-4">
                {clientProfile.is_registration_fee_paid ? (
                  <div className="flex items-center gap-2 text-[12px] text-gray-600">
                    <CheckCircle className="w-3.5 h-3.5 text-gray-400" />
                    Registration fee paid
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-[12px] text-gray-500">
                    <AlertCircle className="w-3.5 h-3.5 text-gray-400" />
                    Registration fee pending
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Builder or Preview ── */}
        <div className="xl:col-span-2 space-y-4">

          {showPreview ? (
            <QuotePreviewPanel
              serviceRequest={serviceRequest}
              previewItems={buildPreviewItems(validLineItems, validProductLineItems, rentalUnits, isRentalLine)}
              termsConditions={termsConditions}
              onBack={() => {
                setShowPreview(false);
                setError(null);
                setCreatedQuote(null);
                setCreatedProductQuote(null);
                setDeliveryState(null);
              }}
              onGenerateDownload={handleGenerateDownload}
              onGenerateSend={handleGenerateSend}
              onSend={handleSend}
              onResend={handleResend}
              loadingAction={loadingAction}
              deliveryState={deliveryState}
              error={error}
            />
          ) : (
            <>
              {/* Preset selector */}
              <div className="rounded-lg border border-gray-200 bg-white px-5 py-4">
                <PresetItemSelector
                  presets={presets}
                  onSelectPreset={addPresetItem}
                  onManagePresets={() => setShowPresetManager(true)}
                />
              </div>

              {/* Line items table (Zoho-style) */}
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">

                {/* Table header row */}
                <div className="border-b border-gray-100">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="py-3 pl-4 w-8" />
                        <th className="py-3 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400 pr-3">
                          Item Details
                        </th>
                        <th className="py-3 text-right text-[11px] font-medium uppercase tracking-wider text-gray-400 pr-3 w-24">
                          Quantity
                        </th>
                        <th className="py-3 text-right text-[11px] font-medium uppercase tracking-wider text-gray-400 pr-3 w-32">
                          Rate
                        </th>
                        <th className="py-3 text-right text-[11px] font-medium uppercase tracking-wider text-gray-400 pr-2 w-32">
                          Amount
                        </th>
                        <th className="py-3 pr-3 w-20" />
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.length === 0 && productLineItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-[13px] text-gray-400">
                            No items added. Select a preset above or add a custom item below.
                          </td>
                        </tr>
                      ) : (
                        <>
                          {lineItems.map((item, index) => (
                            item.is_registration_fee ? (
                              <RegistrationFeeRow
                                key={`svc-${index}`}
                                item={item}
                                index={index}
                                salespersons={salespersons}
                                onUpdate={(updated) => updateLineItem(index, updated)}
                                onDelete={() => deleteLineItem(index)}
                              />
                            ) : (
                              <LineItemRow
                                key={`svc-${index}`}
                                item={item}
                                index={index}
                                isFirst={index === 0}
                                isLast={index === lineItems.length - 1}
                                onUpdate={(updated) => updateLineItem(index, updated)}
                                onDelete={() => deleteLineItem(index)}
                                onMoveUp={() => moveLineItem(index, 'up')}
                                onMoveDown={() => moveLineItem(index, 'down')}
                              />
                            )
                          ))}
                          {/* Products & Rentals — a companion PRODUCT quotation under the
                              hood (see ensureProductQuoteCreated), but shown here as part of
                              the same table since its items get folded into one combined PDF
                              and one WhatsApp message (see quoteController.mergeProductQuoteIntoData). */}
                          {productLineItems.map((item, idx) => (
                            <tr key={`prod-${idx}`} className="border-b border-gray-100">
                              <td className="py-3 pl-4 w-8 text-[12px] text-gray-300 select-none align-top">
                                {lineItems.length + idx + 1}
                              </td>
                              <td colSpan={5} className="py-2 pr-3">
                                <ProductLineItemRow
                                  item={item}
                                  products={products}
                                  rentalUnits={rentalUnits}
                                  canDelete
                                  onUpdate={(updated) => updateProductLine(idx, updated)}
                                  onDelete={() => deleteProductLine(idx)}
                                />
                              </td>
                            </tr>
                          ))}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Add-item row */}
                <div className="px-4 py-3 flex flex-wrap items-center gap-4 border-b border-gray-100">
                  {canAddRegistrationFee ? (
                    <>
                      <button
                        onClick={addRegistrationFeeItem}
                        className="inline-flex items-center gap-1.5 text-[13px] text-amber-700 hover:text-amber-800 font-medium transition-colors"
                      >
                        <BadgeDollarSign className="w-3.5 h-3.5" />
                        Add Registration Fee
                      </button>
                      <span className="text-gray-200 select-none">|</span>
                    </>
                  ) : registrationFeeAlreadySettled && (
                    <span className="text-[11px] text-gray-400">Registration fee already settled for this client</span>
                  )}
                  <button
                    onClick={() => addItem('CHARGE')}
                    className="inline-flex items-center gap-1.5 text-[13px] text-blue-600 hover:text-blue-800 font-medium transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Charge
                  </button>
                  <span className="text-gray-200 select-none">|</span>
                  <button
                    onClick={() => addItem('DISCOUNT')}
                    className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-700 font-medium transition-colors"
                  >
                    <Percent className="w-3.5 h-3.5" />
                    Add Discount
                  </button>
                  {serviceRequest?.client_id ? (
                    <>
                      <span className="text-gray-200 select-none">|</span>
                      <button
                        onClick={addProductLine}
                        className="inline-flex items-center gap-1.5 text-[13px] text-purple-600 hover:text-purple-800 font-medium transition-colors"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        Add Item
                      </button>
                      <span className="text-gray-200 select-none">|</span>
                      <button
                        onClick={addDepositLine}
                        className="inline-flex items-center gap-1.5 text-[13px] text-amber-600 hover:text-amber-700 font-medium transition-colors"
                      >
                        <Package className="w-3.5 h-3.5" />
                        Add Refundable Deposit
                      </button>
                    </>
                  ) : (
                    <span className="text-[11px] text-gray-400">Link this lead to a client account to add products or rentals</span>
                  )}
                  {skippedCount > 0 && (
                    <span className="ml-auto text-[11px] text-gray-400">
                      {skippedCount} item{skippedCount > 1 ? 's' : ''} with Rs. 0 will be excluded
                    </span>
                  )}
                </div>

                {/* Totals + Terms */}
                <div className="px-5 py-5 grid grid-cols-2 gap-6">

                  {/* Terms */}
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1.5">
                      Terms &amp; Conditions
                    </p>
                    <textarea
                      value={termsConditions}
                      onChange={(e) => setTermsConditions(e.target.value)}
                      rows={4}
                      className="w-full text-[13px] text-gray-700 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-300"
                      placeholder="Enter terms and conditions…"
                    />
                  </div>

                  {/* Totals */}
                  <div className="flex flex-col justify-end gap-2">
                    <div className="flex justify-between text-[13px] text-gray-600">
                      <span>Subtotal</span>
                      <span className="tabular-nums">{fmt(totalCharges)}</span>
                    </div>
                    {totalDiscounts > 0 && (
                      <div className="flex justify-between text-[13px] text-gray-500">
                        <span>Discounts</span>
                        <span className="tabular-nums">({fmt(totalDiscounts)})</span>
                      </div>
                    )}
                    {productTotal > 0 && (
                      <div className="flex justify-between text-[13px] text-purple-600">
                        <span>Products &amp; Rentals</span>
                        <span className="tabular-nums">{fmt(productTotal)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-[14px] font-semibold text-gray-900 border-t border-gray-200 pt-2 mt-1">
                      <span>Total</span>
                      <span className="tabular-nums">LKR {fmt(combinedTotal)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-3">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span className="text-[13px] text-red-700">{error}</span>
                </div>
              )}

              {/* Preview button */}
              <button
                onClick={handlePreviewClick}
                disabled={validLineItems.length === 0 || combinedTotal <= 0}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 text-[13px] font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Eye className="w-4 h-4" />
                Preview Quote
              </button>
            </>
          )}
        </div>
      </div>

      {/* Back link */}
      <div className="mt-6">
        <button
          onClick={() => navigate('/admin/service-requests')}
          className="flex items-center gap-2 text-[13px] text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Service Requests
        </button>
      </div>

      <PresetManager
        isOpen={showPresetManager}
        onClose={() => setShowPresetManager(false)}
        onSave={() => { setShowPresetManager(false); fetchPresets(); }}
      />
    </AdminLayout>
  );
};

export default ModularQuoteBuilder;
