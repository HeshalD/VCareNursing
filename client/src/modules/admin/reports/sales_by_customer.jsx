import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Loader2, Search, Users, DollarSign, CalendarDays } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const money = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  maximumFractionDigits: 2,
});

const formatMoney = (value) => money.format(Number(value || 0));

const SalesByCustomer = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const loadClients = async () => {
      try {
        setLoading(true);
        setError('');

        const response = await apiClient.getAllClients();
        const clientList = Array.isArray(response.data) ? response.data : [];

        const enrichedClients = await Promise.all(
          clientList.map(async (client) => {
            try {
              const detailResponse = await apiClient.getAdminClientDetail(client.client_profile_id);
              const detail = detailResponse.data || {};
              const paymentSummary = detail.payment_summary || {};
              const bookingSummary = detail.booking_summary || {};

              return {
                ...client,
                sales_total: Number(paymentSummary.total_paid || 0),
                bookings_total: Number(bookingSummary.total_bookings || 0),
                overdue_total: Number(detail?.overdue_summary?.total_overdue_amount || 0),
              };
            } catch (detailError) {
              console.error('Error loading client detail for sales report:', detailError);
              return {
                ...client,
                sales_total: 0,
                bookings_total: 0,
                overdue_total: 0,
              };
            }
          })
        );

        enrichedClients.sort((a, b) => (b.sales_total || 0) - (a.sales_total || 0));
        setClients(enrichedClients);
      } catch (loadError) {
        console.error('Error loading clients for sales report:', loadError);
        setError(loadError.message || 'Failed to load sales by customer');
      } finally {
        setLoading(false);
      }
    };

    loadClients();
  }, []);

  const filteredClients = useMemo(() => {
    if (!searchTerm) return clients;

    const term = searchTerm.toLowerCase();
    return clients.filter((client) =>
      (client.full_name || '').toLowerCase().includes(term) ||
      (client.email || '').toLowerCase().includes(term) ||
      (client.mobile_number || '').toLowerCase().includes(term) ||
      (client.primary_address || '').toLowerCase().includes(term)
    );
  }, [clients, searchTerm]);

  const totals = useMemo(() => {
    const totalSales = filteredClients.reduce((sum, client) => sum + Number(client.sales_total || 0), 0);
    const totalCustomers = filteredClients.length;
    const totalBookings = filteredClients.reduce((sum, client) => sum + Number(client.bookings_total || 0), 0);

    return { totalSales, totalCustomers, totalBookings };
  }, [filteredClients]);

  const openClientDetail = (clientId) => {
    navigate(`/admin/users/${clientId}/detail`);
  };

  return (
    <AdminLayout
      title="Sales by Customer"
      subtitle="Review customer-level sales and jump into the full client profile when needed."
      actions={
        <button
          type="button"
          onClick={() => navigate('/admin/reports')}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Reports
        </button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard icon={DollarSign} label="Total Sales" value={formatMoney(totals.totalSales)} tone="emerald" />
        <SummaryCard icon={Users} label="Customers" value={totals.totalCustomers} tone="blue" />
        <SummaryCard icon={CalendarDays} label="Bookings" value={totals.totalBookings} tone="amber" />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Customer Sales List</h3>
            <p className="text-sm text-slate-500">Click any customer to open the existing client detail page.</p>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search customers"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm outline-none focus:border-blue-500 focus:bg-white"
            />
          </div>
        </div>

        {error ? (
          <div className="p-6 text-sm text-rose-600">{error}</div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3">Contact</th>
                <th className="px-6 py-3 text-right">Sales</th>
                <th className="px-6 py-3 text-right">Bookings</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-slate-500">
                    <div className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading customer sales...
                    </div>
                  </td>
                </tr>
              ) : filteredClients.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-slate-500">
                    No customers found
                  </td>
                </tr>
              ) : (
                filteredClients.map((client) => (
                  <tr
                    key={client.client_profile_id}
                    className="cursor-pointer hover:bg-blue-50/60 transition-colors"
                    onClick={() => openClientDetail(client.client_profile_id)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                          {(client.full_name || 'C').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{client.full_name || 'Unknown Client'}</p>
                          <p className="text-xs text-slate-500">ID: {client.client_profile_id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div className="space-y-1">
                        <p>{client.email || '-'}</p>
                        <p>{client.mobile_number || '-'}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-slate-900">{formatMoney(client.sales_total)}</td>
                    <td className="px-6 py-4 text-right font-semibold text-slate-900">{client.bookings_total || 0}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                        onClick={(event) => {
                          event.stopPropagation();
                          openClientDetail(client.client_profile_id);
                        }}
                      >
                        Open Details
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
};

const SummaryCard = ({ icon: Icon, label, value, tone }) => {
  const toneMap = {
    emerald: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${toneMap[tone] || toneMap.blue}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
};

export default SalesByCustomer;