import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, Users2, Loader2, ShieldCheck } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const ROLE_OPTIONS = ['Sales', 'Accounts', 'Coordinator', 'HR Manager', 'Operations', 'Admin'];
const LOGIN_ROLES = new Set(['COORDINATOR', 'ACCOUNTS']);
const STATUS_OPTIONS = ['Active', 'Inactive', 'On Leave'];

const empty = {
  full_name: '',
  role: '',
  email: '',
  phone: '',
  base_salary: '',
  joined_date: '',
  status: 'Active',
  password: '',
};

const statusColor = (s) => {
  if (s === 'Active') return 'bg-green-100 text-green-700';
  if (s === 'Inactive') return 'bg-red-100 text-red-700';
  return 'bg-amber-100 text-amber-700';
};

const isSalesRole = (role) => (role || '').toLowerCase().includes('sales');

const money = (value) =>
  `LKR ${parseFloat(value || 0).toLocaleString('en-LK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const needsLoginAccount = (role) => LOGIN_ROLES.has(role?.trim().toUpperCase());

const InternalStaffPage = () => {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => { loadStaff(); }, []);

  const loadStaff = async () => {
    try {
      const res = await apiClient.listInternalStaff();
      setStaff(res.staff || []);
    } catch (err) {
      console.error('loadStaff error:', err);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const openAdd = () => {
    setForm(empty);
    setFormError('');
    setEditing(null);
    setModal('add');
  };

  const openEdit = (member) => {
    setForm({
      full_name: member.full_name || '',
      role: member.role || '',
      email: member.email || '',
      phone: member.phone || '',
      base_salary: member.base_salary != null ? String(member.base_salary) : '',
      joined_date: member.joined_date ? member.joined_date.split('T')[0] : '',
      status: member.status || 'Active',
      password: '',
    });
    setFormError('');
    setEditing(member);
    setModal('edit');
  };

  const closeModal = () => {
    setModal(null);
    setEditing(null);
    setFormError('');
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const isLoginRole = needsLoginAccount(form.role);

  const handleSave = async () => {
    if (!form.full_name.trim() || !form.role.trim() || !form.email.trim()) {
      setFormError('Full name, role, and email are required.');
      return;
    }
    if (modal === 'add' && isLoginRole) {
      if (!form.phone.trim()) {
        setFormError('Phone is required for COORDINATOR and ACCOUNTS roles (used as login mobile number).');
        return;
      }
      if (!form.password.trim()) {
        setFormError('Password is required for COORDINATOR and ACCOUNTS roles.');
        return;
      }
    }

    setSaving(true);
    setFormError('');
    try {
      const payload = {
        full_name: form.full_name.trim(),
        role: form.role.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        base_salary: form.base_salary !== '' ? parseFloat(form.base_salary) : 0,
        joined_date: form.joined_date || null,
        status: form.status,
      };
      if (modal === 'add' && isLoginRole) {
        payload.password = form.password.trim();
      }

      if (modal === 'add') {
        const res = await apiClient.createInternalStaff(payload);
        setStaff((prev) =>
          [...prev, res.staff].sort((a, b) => a.full_name.localeCompare(b.full_name))
        );
        showToast(`${res.staff.full_name} added.`);
      } else {
        const res = await apiClient.updateInternalStaff(editing.id, payload);
        setStaff((prev) => prev.map((s) => (s.id === editing.id ? res.staff : s)));
        showToast(`${res.staff.full_name} updated.`);
      }
      closeModal();
    } catch (err) {
      setFormError(err.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const res = await apiClient.deleteInternalStaff(deleteConfirm);
      setStaff((prev) => prev.filter((s) => s.id !== deleteConfirm));
      showToast(res.message || 'Staff member removed.');
    } catch (err) {
      showToast(err.message || 'Failed to remove.', 'error');
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  };

  return (
    <AdminLayout title="Internal Staff" subtitle="Manage your internal team members">
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-fade-in ${
            toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-2 text-slate-600">
            <Users2 className="w-4 h-4" />
            <span className="font-medium text-sm">
              {loading ? 'Loading…' : `${staff.length} team member${staff.length !== 1 ? 's' : ''}`}
            </span>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Staff
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 h-48 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading staff…
            </div>
          ) : staff.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Users2 className="w-10 h-10 mx-auto mb-3 opacity-25" />
              <p className="font-medium text-slate-500">No internal staff yet</p>
              <p className="text-sm mt-1">Click "Add Staff" to create your first team member.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-slate-500 text-xs uppercase tracking-wide font-semibold">
                  <th className="text-left px-5 py-3">Name</th>
                  <th className="text-left px-5 py-3">Role</th>
                  <th className="text-left px-5 py-3">Email</th>
                  <th className="text-left px-5 py-3">Phone</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-left px-5 py-3">Sales</th>
                  <th className="text-left px-5 py-3">Joined</th>
                  <th className="text-right px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => (
                  <tr
                    key={member.id}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{member.full_name}</span>
                        {member.user_id && (
                          <span title="Has login account" className="text-blue-500">
                            <ShieldCheck className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{member.role}</td>
                    <td className="px-5 py-4 text-slate-500">{member.email}</td>
                    <td className="px-5 py-4 text-slate-500">{member.phone || '—'}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor(member.status)}`}
                      >
                        {member.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {isSalesRole(member.role) ? (
                        <div className="leading-tight">
                          <div className="font-semibold text-slate-900">
                            {member.bookings_brought_count || 0} booking{(member.bookings_brought_count || 0) !== 1 ? 's' : ''}
                          </div>
                          <div className="text-xs text-slate-500">{money(member.total_sales_amount)}</div>
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-500">
                      {member.joined_date
                        ? new Date(member.joined_date).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {deleteConfirm === member.id ? (
                          <>
                            <span className="text-xs text-slate-500 mr-1">Remove?</span>
                            <button
                              onClick={handleDelete}
                              disabled={deleting}
                              className="px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-50"
                            >
                              {deleting ? 'Removing…' : 'Yes'}
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => openEdit(member)}
                              title="Edit"
                              className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(member.id)}
                              title="Remove"
                              className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add / Edit modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">
                {modal === 'add' ? 'Add Internal Staff' : 'Edit Staff Member'}
              </h2>
              <button
                onClick={closeModal}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-6 space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-2.5 rounded-lg">
                  {formError}
                </div>
              )}

              {modal === 'add' && isLoginRole && (
                <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 text-blue-700 text-xs px-3 py-2.5 rounded-lg">
                  <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>A login account will be created for this staff member. Their phone number will be used as the login mobile number.</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-colors"
                    placeholder="e.g. Jane Perera"
                    value={form.full_name}
                    onChange={set('full_name')}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Role <span className="text-red-500">*</span>
                  </label>
                  <input
                    list="is-role-options"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-colors"
                    placeholder="e.g. Sales"
                    value={form.role}
                    onChange={set('role')}
                  />
                  <datalist id="is-role-options">
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Status</label>
                  <select
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-colors"
                    value={form.status}
                    onChange={set('status')}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-colors"
                    placeholder="name@vcare.lk"
                    value={form.email}
                    onChange={set('email')}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Phone {modal === 'add' && isLoginRole && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-colors"
                    placeholder="07X XXX XXXX"
                    value={form.phone}
                    onChange={set('phone')}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Joined Date</label>
                  <input
                    type="date"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-colors"
                    value={form.joined_date}
                    onChange={set('joined_date')}
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Base Salary (LKR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-colors"
                    placeholder="0.00"
                    value={form.base_salary}
                    onChange={set('base_salary')}
                  />
                </div>

                {modal === 'add' && isLoginRole && (
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                      Login Password <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-colors"
                      placeholder="Set a password for admin dashboard access"
                      value={form.password}
                      onChange={set('password')}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-3 px-6 pb-6">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'Saving…' : modal === 'add' ? 'Add Staff' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default InternalStaffPage;
