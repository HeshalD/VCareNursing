import React, { useState, useEffect } from 'react';
import { Loader2, Package, ImageOff, AlertCircle, ShoppingBag, ShieldCheck, CalendarClock, Truck } from 'lucide-react';
import apiClient from '../../api/api';

const money = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
const formatMoney = (v) => money.format(Number(v || 0));
const formatDate = (v) => (v ? new Date(v).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
};

const badgeClass = (kind) => {
  const map = {
    ACTIVE: 'bg-blue-50 text-blue-700',
    COMPLETED: 'bg-slate-100 text-slate-600',
    CANCELLED: 'bg-red-50 text-red-700',
    HELD: 'bg-amber-50 text-amber-700',
    REFUNDED: 'bg-emerald-50 text-emerald-700',
    FORFEITED: 'bg-red-50 text-red-700',
    PAID: 'bg-emerald-50 text-emerald-700',
    PENDING: 'bg-amber-50 text-amber-700',
    SENT: 'bg-amber-50 text-amber-700',
    ACCEPTED: 'bg-emerald-50 text-emerald-700',
    DRAFT: 'bg-slate-100 text-slate-600',
  };
  return map[kind] || 'bg-slate-100 text-slate-600';
};

const RentalReturnStatus = ({ rental }) => {
  if (rental.status === 'COMPLETED') {
    return <p className="text-xs text-slate-500">Returned {formatDate(rental.returned_at)}</p>;
  }
  if (rental.status === 'CANCELLED') {
    return <p className="text-xs text-slate-500">Agreement cancelled</p>;
  }
  if (rental.billing_type === 'RECURRING') {
    const days = daysUntil(rental.next_invoice_date);
    return (
      <p className="text-xs text-slate-600 flex items-center gap-1">
        <CalendarClock className="h-3.5 w-3.5 text-blue-500" />
        {days === null ? 'Billed monthly' : days <= 0 ? 'Next invoice due today' : `Next invoice in ${days} day${days === 1 ? '' : 's'}`}
      </p>
    );
  }
  const days = daysUntil(rental.end_date);
  if (days === null) return null;
  return (
    <p className={`text-xs flex items-center gap-1 ${days <= 3 ? 'text-red-600 font-medium' : 'text-slate-600'}`}>
      <CalendarClock className="h-3.5 w-3.5" />
      {days < 0 ? `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}` : days === 0 ? 'Due for return today' : `${days} day${days === 1 ? '' : 's'} remaining until return`}
    </p>
  );
};

const RentalCard = ({ rental }) => (
  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col">
    <div className="h-32 bg-slate-100 flex items-center justify-center">
      {rental.image_url ? (
        <img src={rental.image_url} alt={rental.product_name} className="h-full w-full object-cover" />
      ) : (
        <ImageOff className="h-8 w-8 text-slate-300" />
      )}
    </div>
    <div className="p-4 flex flex-col gap-2 flex-1">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-800 flex-1">{rental.product_name}</h3>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${badgeClass(rental.status)}`}>{rental.status}</span>
      </div>
      <p className="text-[11px] text-slate-400">Unit {rental.unit_code} · {rental.billing_type === 'RECURRING' ? 'Monthly rental' : 'Fixed-term rental'}</p>

      <div className="text-xs text-slate-500 space-y-0.5">
        <p>Start: {formatDate(rental.start_date)}</p>
        {rental.billing_type === 'ONE_TIME' && <p>Return by: {formatDate(rental.end_date)}</p>}
        <p>Rate: {formatMoney(rental.rate)}{rental.billing_type === 'RECURRING' ? ' /month' : ''}</p>
      </div>

      <RentalReturnStatus rental={rental} />

      <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
          Deposit
        </div>
        {rental.deposit_id ? (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${badgeClass(rental.deposit_status)}`}>
            {formatMoney(rental.deposit_collected_amount)} · {rental.deposit_status}
          </span>
        ) : (
          <span className="text-[11px] text-slate-400">No deposit held</span>
        )}
      </div>
      {rental.deposit_status === 'REFUNDED' && rental.deposit_refunded_at && (
        <p className="text-[11px] text-emerald-600">Refunded {formatDate(rental.deposit_refunded_at)}</p>
      )}
      {rental.deposit_status === 'FORFEITED' && (
        <p className="text-[11px] text-red-600">Forfeited — non-refundable</p>
      )}
    </div>
  </div>
);

const PurchaseCard = ({ item }) => (
  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col">
    <div className="h-32 bg-slate-100 flex items-center justify-center">
      {item.image_url ? (
        <img src={item.image_url} alt={item.product_name} className="h-full w-full object-cover" />
      ) : (
        <ImageOff className="h-8 w-8 text-slate-300" />
      )}
    </div>
    <div className="p-4 flex flex-col gap-2 flex-1">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-800 flex-1">{item.product_name}</h3>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${badgeClass(item.quote_status)}`}>{item.quote_status}</span>
      </div>
      <p className="text-[11px] text-slate-400">Qty {item.quantity} · {formatMoney(item.unit_price)} each</p>
      <p className="text-sm font-semibold text-slate-900">{formatMoney(item.amount)}</p>

      <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <Truck className="h-3.5 w-3.5 text-slate-400" />
          Invoice
        </div>
        {item.invoice_id ? (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${badgeClass(item.invoice_status)}`}>
            {item.invoice_status}
          </span>
        ) : (
          <span className="text-[11px] text-slate-400">Not yet invoiced</span>
        )}
      </div>
      {item.paid_at && <p className="text-[11px] text-emerald-600">Paid {formatDate(item.paid_at)}</p>}
    </div>
  </div>
);

const ClientProducts = () => {
  const [purchases, setPurchases] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.getMyProductOrders();
        setPurchases(Array.isArray(res?.data?.purchases) ? res.data.purchases : []);
        setRentals(Array.isArray(res?.data?.rentals) ? res.data.rentals : []);
      } catch {
        setError('Failed to load your products.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isEmpty = purchases.length === 0 && rentals.length === 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
          <ShoppingBag className="h-5 w-5 text-blue-600" /> My Products & Rentals
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Items you've purchased or rented, along with the status of any refundable deposits.
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your products…
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400">
          <Package className="h-10 w-10" />
          <p className="text-sm font-medium">You haven't purchased or rented any items yet.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {rentals.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-700 mb-3">Rentals</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {rentals.map((r) => (
                  <RentalCard key={r.rental_agreement_id} rental={r} />
                ))}
              </div>
            </div>
          )}

          {purchases.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-700 mb-3">Purchased Items</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {purchases.map((p) => (
                  <PurchaseCard key={p.line_item_id} item={p} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ClientProducts;
