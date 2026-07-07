import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, UserCircle, ChevronRight, Loader2, Plus, X } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const REG_TABS = ['All', 'Pending', 'Invoiced', 'Receipt Submitted', 'Paid', 'Waived'];

const STATUS_CONFIG = {
  PENDING:          { dot: 'bg-amber-400',   text: 'text-amber-700',   bg: '',  label: 'Fee Pending' },
  INVOICED:         { dot: 'bg-blue-400',    text: 'text-blue-700',    bg: '',  label: 'Invoiced' },
  RECEIPT_UPLOADED: { dot: 'bg-violet-400',  text: 'text-violet-700',  bg: '',  label: 'Receipt Submitted' },
  PAID:             { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: '',  label: 'Paid' },
  WAIVED:           { dot: 'bg-slate-400',   text: 'text-slate-600',   bg: '',  label: 'Waived' },
};

const TAB_TO_STATUS = {
  Pending:            'PENDING',
  Invoiced:           'INVOICED',
  'Receipt Submitted':'RECEIPT_UPLOADED',
  Paid:               'PAID',
  Waived:             'WAIVED',
};

const HONORIFICS = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Rev.'];
const CLIENT_TYPES = ['INDIVIDUAL', 'CORPORATE_PROXY'];

const BLANK_FORM = {
  full_name: '', email: '', mobile_number: '',
  gender: '', primary_address: '', client_type: 'INDIVIDUAL',
  honorific: '', company_name: '',
};

const SectionHeader = ({ title }) => (
  <div className="px-5 pt-5 pb-2.5 border-b border-slate-100">
    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</p>
  </div>
);

const Field = ({ label, required, error, children }) => (
  <div>
    <label className="block text-xs font-medium text-slate-600 mb-1">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
    {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
  </div>
);

const inputCls = (hasError) =>
  `w-full px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:border-blue-500 transition-colors ${
    hasError
      ? 'border-red-400 bg-red-50 focus:ring-red-100'
      : 'border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:ring-blue-100'
  }`;

const StatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

const ClientManagement = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('All');
  const [search, setSearch] = useState('');

  const [showDrawer, setShowDrawer] = useState(false);
  const [formData, setFormData] = useState(BLANK_FORM);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState(null);
  const [formSuccess, setFormSuccess] = useState(null);

  useEffect(() => { fetchClients(); }, []);

  const fetchClients = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.getAllClients();
      setClients(response.data || []);
    } catch (err) {
      setError('Failed to load clients');
    } finally {
      setLoading(false);
    }
  };

  const openAdd = () => {
    setFormData(BLANK_FORM);
    setFormError(null);
    setFormSuccess(null);
    setShowDrawer(true);
  };

  const closeDrawer = () => {
    setShowDrawer(false);
    setFormError(null);
    setFormSuccess(null);
  };

  const handleInput = (e) => {
    const { name, value } = e.target;
    setFormData(p => ({ ...p, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.full_name || !formData.email || !formData.mobile_number || !formData.gender) {
      setFormError('Please fill in all required fields.');
      return;
    }
    setFormLoading(true);
    setFormError(null);
    setFormSuccess(null);
    try {
      const payload = {
        full_name: formData.full_name,
        email: formData.email,
        mobile_number: formData.mobile_number,
        gender: formData.gender,
        primary_address: formData.primary_address || undefined,
        client_type: formData.client_type || 'INDIVIDUAL',
        honorific: formData.honorific || undefined,
        company_name: formData.company_name || undefined,
      };
      const res = await apiClient.createClientProfile(payload);
      setFormSuccess(`Client created. Temporary password: ${res.data?.tempPassword ?? '(check server)'}`);
      fetchClients();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to create client.');
    } finally {
      setFormLoading(false);
    }
  };

  const filtered = clients.filter(c => {
    const status = c.reg_fee_status || 'PENDING';
    const matchTab = activeTab === 'All' || status === TAB_TO_STATUS[activeTab];
    const q = search.toLowerCase();
    const matchSearch = !q || [c.full_name, c.email, c.mobile_number, c.client_code, c.primary_address]
      .some(v => v?.toLowerCase().includes(q));
    return matchTab && matchSearch;
  });

  const counts = {
    All: clients.length,
    ...Object.fromEntries(
      REG_TABS.filter(t => t !== 'All').map(tab => [
        tab,
        clients.filter(c => (c.reg_fee_status || 'PENDING') === TAB_TO_STATUS[tab]).length,
      ])
    ),
  };

  if (loading) {
    return (
      <AdminLayout title="Client Management" subtitle="Loading…">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Client Management">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Client Management"
      subtitle="View and manage all registered clients."
      actions={
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Client
        </button>
      }
    >
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-1 w-fit flex-wrap">
          {REG_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === tab
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab}
              <span className="ml-1.5 tabular-nums text-slate-400">{counts[tab]}</span>
            </button>
          ))}
        </div>

        <div className="relative sm:ml-auto">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, phone, email…"
            className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none w-64"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Location</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Reg. Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-16 text-slate-400 text-sm">
                    No clients match your filters.
                  </td>
                </tr>
              ) : filtered.map(client => (
                <tr
                  key={client.client_profile_id}
                  onClick={() => navigate(`/admin/users/${client.client_profile_id}/detail`)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  {/* Client */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5 min-w-[180px]">
                      {client.profile_picture_url ? (
                        <img src={client.profile_picture_url} alt={client.full_name}
                          className="w-8 h-8 rounded-full object-cover flex-shrink-0 ring-1 ring-slate-200" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 ring-1 ring-slate-200">
                          <UserCircle className="w-5 h-5 text-slate-400" />
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-slate-900 leading-tight">{client.full_name ?? '—'}</p>
                        {client.client_code && (
                          <p className="text-xs text-slate-400 font-mono">{client.client_code}</p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Contact */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="text-slate-700">{client.mobile_number ?? '—'}</p>
                    <p className="text-xs text-slate-400">{client.email ?? '—'}</p>
                  </td>

                  {/* Location */}
                  <td className="px-4 py-3">
                    <span className="text-slate-600 text-sm">{client.primary_address ?? '—'}</span>
                  </td>

                  {/* Reg Status */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={client.reg_fee_status || 'PENDING'} />
                  </td>

                  {/* Arrow */}
                  <td className="px-4 py-3 text-right">
                    <ChevronRight className="w-4 h-4 text-slate-300 ml-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
            Showing {filtered.length} of {clients.length} client{clients.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Add Client Drawer */}
      {showDrawer && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={!formSuccess ? closeDrawer : undefined} />

          <div className="w-full max-w-md bg-white flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
              <h2 className="text-sm font-semibold text-slate-900">Add New Client</h2>
              <button onClick={closeDrawer} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
              {formError && (
                <div className="mx-5 mt-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="mx-5 mt-4 px-4 py-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg">
                  <p className="font-semibold mb-0.5">Client created successfully.</p>
                  <p>{formSuccess.replace('Client created. ', '')}</p>
                  <p className="mt-1 text-emerald-600">Share this password with the client and ask them to change it on first login.</p>
                </div>
              )}

              {/* Personal */}
              <SectionHeader title="Personal Information" />
              <div className="px-5 pt-4 pb-2 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Honorific">
                    <select name="honorific" value={formData.honorific} onChange={handleInput} className={inputCls(false)}>
                      <option value="">—</option>
                      {HONORIFICS.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </Field>
                  <div className="col-span-2">
                    <Field label="Full Name" required>
                      <input type="text" name="full_name" value={formData.full_name} onChange={handleInput}
                        placeholder="e.g. Saman Perera" className={inputCls(false)} />
                    </Field>
                  </div>
                </div>
                <Field label="Gender" required>
                  <select name="gender" value={formData.gender} onChange={handleInput} className={inputCls(false)}>
                    <option value="">Select gender</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </Field>
                <Field label="Client Type">
                  <select name="client_type" value={formData.client_type} onChange={handleInput} className={inputCls(false)}>
                    {CLIENT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
                  </select>
                </Field>
                {formData.client_type === 'CORPORATE' && (
                  <Field label="Company Name">
                    <input type="text" name="company_name" value={formData.company_name} onChange={handleInput}
                      placeholder="e.g. ABC Holdings (Pvt) Ltd" className={inputCls(false)} />
                  </Field>
                )}
              </div>

              {/* Contact */}
              <SectionHeader title="Contact" />
              <div className="px-5 pt-4 pb-2 space-y-3">
                <Field label="Email" required>
                  <input type="email" name="email" value={formData.email} onChange={handleInput}
                    placeholder="e.g. saman@example.com" className={inputCls(false)} />
                </Field>
                <Field label="Mobile Number" required>
                  <input type="tel" name="mobile_number" value={formData.mobile_number} onChange={handleInput}
                    placeholder="e.g. 0771234567" className={inputCls(false)} />
                </Field>
              </div>

              {/* Address */}
              <SectionHeader title="Address" />
              <div className="px-5 pt-4 pb-6">
                <Field label="Primary Address">
                  <input type="text" name="primary_address" value={formData.primary_address} onChange={handleInput}
                    placeholder="e.g. 45/A, Galle Road, Dehiwala, Colombo" className={inputCls(false)} />
                </Field>
              </div>
            </form>

            {/* Footer */}
            <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
              <button type="button" onClick={closeDrawer}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors">
                {formSuccess ? 'Close' : 'Cancel'}
              </button>
              {!formSuccess && (
                <button
                  onClick={handleSubmit}
                  disabled={formLoading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {formLoading ? 'Creating…' : 'Create Client'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default ClientManagement;
