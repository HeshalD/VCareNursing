import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, X, Loader2, ShieldCheck, Smartphone, Copy, Search, RefreshCw, KeySquare, Check } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import DateInput from '../../../components/common/DateInput';
import PhoneInput, { isValidPhoneNumber } from '../../../components/common/PhoneInput';

// Must match the internal/office roles defined in user_role_enum (backend/migrate.js).
// Caregiving roles (NURSE, CARETAKER, NANNY, etc.) belong to field staff, not internal staff.
const ROLE_OPTIONS = [
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'COORDINATOR', label: 'Coordinator' },
  { value: 'ACCOUNTS', label: 'Accounts' },
  { value: 'SALES', label: 'Sales' },
  { value: 'STORE_MANAGER', label: 'Store Manager' },
  { value: 'RECRUITER', label: 'Recruiter' },
];
const LOGIN_ROLES = new Set(['COORDINATOR', 'ACCOUNTS', 'SALES', 'SUPER_ADMIN', 'CUSTOM_ROLE', 'RECRUITER']);
const STATUS_OPTIONS = ['Active', 'Inactive', 'On Leave'];
const STATUS_TABS = ['All', 'Active', 'Inactive', 'On Leave'];

// form.roles holds one entry per selected role box: { role, custom_role_id }.
// CUSTOM_ROLE can appear multiple times (once per distinct custom role picked);
// every other role can only appear once.
const empty = {
  full_name: '',
  roles: [],
  email: '',
  phone: '',
  base_salary: '',
  joined_date: '',
  status: 'Active',
  password: '',
};

const STATUS_CONFIG = {
  Active:      { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Active' },
  Inactive:    { dot: 'bg-red-400',     text: 'text-red-700',     label: 'Inactive' },
  'On Leave':  { dot: 'bg-amber-400',   text: 'text-amber-700',   label: 'On Leave' },
};

const isSalesRole = (roles) => (roles || []).some((r) => (r.role || '').toLowerCase().includes('sales'));

const roleLabel = (role) => ROLE_OPTIONS.find((r) => r.value === role)?.label || role;

const deviceStatusColor = (s) => {
  if (s === 'ACTIVE') return 'bg-emerald-100 text-emerald-700';
  if (s === 'REVOKED') return 'bg-red-100 text-red-700';
  return 'bg-amber-100 text-amber-700'; // PENDING
};

const money = (value) =>
  `LKR ${parseFloat(value || 0).toLocaleString('en-LK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const needsLoginAccount = (roles) => (roles || []).some((r) => LOGIN_ROLES.has(r.role));

const genPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
};

const SectionHeader = ({ title }) => (
  <div className="px-5 pt-5 pb-2.5 border-b border-slate-100">
    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</p>
  </div>
);

const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-xs font-medium text-slate-600 mb-1">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

const inputCls =
  'w-full px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:border-blue-500 transition-colors border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:ring-blue-100';

const StatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.Active;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

const InternalStaffPage = () => {
  const navigate = useNavigate();
  const [staff, setStaff] = useState([]);
  const [customRoles, setCustomRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('All');
  const [search, setSearch] = useState('');

  const [showDrawer, setShowDrawer] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState(null);
  const [devicesFor, setDevicesFor] = useState(null); // staff member whose devices modal is open
  const [devices, setDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [newDeviceLabel, setNewDeviceLabel] = useState('');
  const [assigningDevice, setAssigningDevice] = useState(false);
  const [revokingDeviceId, setRevokingDeviceId] = useState(null);

  useEffect(() => {
    loadStaff();
    apiClient.listCustomRoles()
      .then((res) => setCustomRoles(res.roles || []))
      .catch((err) => console.error('listCustomRoles error:', err));
  }, []);

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
    setShowDrawer(true);
  };

  const openEdit = (member) => {
    setForm({
      full_name: member.full_name || '',
      roles: (member.roles && member.roles.length > 0)
        ? member.roles.map((r) => ({ role: r.role, custom_role_id: r.custom_role_id || '' }))
        : (member.role ? [{ role: member.role, custom_role_id: member.custom_role_id || '' }] : []),
      email: member.email || '',
      phone: member.phone || '',
      base_salary: member.base_salary != null ? String(member.base_salary) : '',
      joined_date: member.joined_date ? member.joined_date.split('T')[0] : '',
      status: member.status || 'Active',
      password: '',
    });
    setFormError('');
    setEditing(member);
    setShowDrawer(true);
  };

  const closeDrawer = () => {
    setShowDrawer(false);
    setEditing(null);
    setFormError('');
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const isRoleSelected = (roleValue) => form.roles.some((r) => r.role === roleValue);

  // Toggle a fixed (non-custom) role box on/off.
  const toggleRole = (roleValue) => {
    setForm((f) => {
      const selected = f.roles.some((r) => r.role === roleValue);
      const roles = selected
        ? f.roles.filter((r) => r.role !== roleValue)
        : [...f.roles, { role: roleValue, custom_role_id: '' }];
      const next = { ...f, roles };
      if (!editing && needsLoginAccount(roles) && !f.password) {
        next.password = genPassword();
      }
      return next;
    });
  };

  const isCustomRoleSelected = (customRoleId) =>
    form.roles.some((r) => r.role === 'CUSTOM_ROLE' && r.custom_role_id === customRoleId);

  // Toggle a custom role box on/off. Multiple custom roles can be selected together.
  const toggleCustomRole = (customRoleId) => {
    setForm((f) => {
      const selected = f.roles.some((r) => r.role === 'CUSTOM_ROLE' && r.custom_role_id === customRoleId);
      const roles = selected
        ? f.roles.filter((r) => !(r.role === 'CUSTOM_ROLE' && r.custom_role_id === customRoleId))
        : [...f.roles, { role: 'CUSTOM_ROLE', custom_role_id: customRoleId }];
      const next = { ...f, roles };
      if (!editing && needsLoginAccount(roles) && !f.password) {
        next.password = genPassword();
      }
      return next;
    });
  };

  const regeneratePassword = () => setForm((f) => ({ ...f, password: genPassword() }));

  const copyPassword = () => {
    if (!form.password) return;
    navigator.clipboard.writeText(form.password);
    showToast('Password copied.');
  };

  const isLoginRole = needsLoginAccount(form.roles);
  const isAdd = !editing;

  const customRoleName = (id) => customRoles.find((r) => r.id === id)?.name;

  const displayRoleLabel = (member) => {
    const roles = (member.roles && member.roles.length > 0)
      ? member.roles
      : (member.role ? [{ role: member.role, custom_role_id: member.custom_role_id, custom_role_name: null }] : []);
    if (roles.length === 0) return '—';
    return roles
      .map((r) => (r.role === 'CUSTOM_ROLE' ? (r.custom_role_name || customRoleName(r.custom_role_id) || 'Custom Role') : roleLabel(r.role)))
      .join(', ');
  };

  const handleSave = async () => {
    if (!form.full_name.trim() || form.roles.length === 0 || !form.email.trim()) {
      setFormError('Full name, at least one role, and email are required.');
      return;
    }
    if (form.roles.some((r) => r.role === 'CUSTOM_ROLE' && !r.custom_role_id)) {
      setFormError('Select a custom role.');
      return;
    }
    if (isAdd && isLoginRole) {
      if (!form.phone.trim()) {
        setFormError('Phone is required for this role (used as login mobile number).');
        return;
      }
      if (!isValidPhoneNumber(form.phone)) {
        setFormError('Enter a valid phone number.');
        return;
      }
      if (!form.password.trim()) {
        setFormError('Password is required for this role.');
        return;
      }
    }

    setSaving(true);
    setFormError('');
    try {
      const payload = {
        full_name: form.full_name.trim(),
        roles: form.roles.map((r) => ({ role: r.role, custom_role_id: r.role === 'CUSTOM_ROLE' ? r.custom_role_id : null })),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        base_salary: form.base_salary !== '' ? parseFloat(form.base_salary) : 0,
        joined_date: form.joined_date || null,
        status: form.status,
      };
      if (isAdd && isLoginRole) {
        payload.password = form.password.trim();
      }

      if (isAdd) {
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
      closeDrawer();
    } catch (err) {
      setFormError(err.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const openDevices = async (member) => {
    setDevicesFor(member);
    setNewDeviceLabel('');
    setLoadingDevices(true);
    try {
      const res = await apiClient.listDevicesForUser(member.user_id);
      setDevices(res.devices || []);
    } catch (err) {
      showToast(err.message || 'Failed to load devices.', 'error');
    } finally {
      setLoadingDevices(false);
    }
  };

  const closeDevices = () => {
    setDevicesFor(null);
    setDevices([]);
  };

  const handleAssignDevice = async () => {
    if (!newDeviceLabel.trim()) return;
    setAssigningDevice(true);
    try {
      const res = await apiClient.assignDevice(devicesFor.user_id, newDeviceLabel.trim());
      setDevices((prev) => [res.device, ...prev]);
      setNewDeviceLabel('');
      showToast(`Device assigned. Activation code: ${res.device.activation_code}`);
    } catch (err) {
      showToast(err.message || 'Failed to assign device.', 'error');
    } finally {
      setAssigningDevice(false);
    }
  };

  const handleRevokeDevice = async (deviceId) => {
    setRevokingDeviceId(deviceId);
    try {
      await apiClient.revokeDevice(deviceId);
      setDevices((prev) =>
        prev.map((d) => (d.id === deviceId ? { ...d, status: 'REVOKED', activation_code: null } : d))
      );
      showToast('Device revoked.');
    } catch (err) {
      showToast(err.message || 'Failed to revoke device.', 'error');
    } finally {
      setRevokingDeviceId(null);
    }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    showToast('Activation code copied.');
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

  const filtered = staff.filter((s) => {
    const matchTab = activeTab === 'All' || (s.status || 'Active') === activeTab;
    const q = search.toLowerCase();
    const matchSearch = !q || [s.full_name, s.email, s.phone, displayRoleLabel(s)]
      .some((v) => v?.toLowerCase().includes(q));
    return matchTab && matchSearch;
  });

  const counts = {
    All: staff.length,
    ...Object.fromEntries(
      STATUS_TABS.filter((t) => t !== 'All').map((tab) => [
        tab,
        staff.filter((s) => (s.status || 'Active') === tab).length,
      ])
    ),
  };

  if (loading) {
    return (
      <AdminLayout title="Internal Staff" subtitle="Loading…">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Internal Staff"
      subtitle="Manage your internal team members."
      actions={
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Staff
        </button>
      }
    >
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-fade-in ${
            toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-1 w-fit flex-wrap">
          {STATUS_TABS.map((tab) => (
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
            onChange={(e) => setSearch(e.target.value)}
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
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Sales</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Joined</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-slate-400 text-sm">
                    {staff.length === 0
                      ? 'No internal staff yet. Click "Add Staff" to create your first team member.'
                      : 'No staff match your filters.'}
                  </td>
                </tr>
              ) : filtered.map((member) => (
                <tr
                  key={member.id}
                  onClick={() => navigate(`/admin/internal-staff/${member.id}`)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 min-w-[160px]">
                      <span className="font-semibold text-slate-900">{member.full_name}</span>
                      {member.user_id && (
                        <span title="Has login account" className="text-blue-500">
                          <ShieldCheck className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <div className="flex flex-wrap items-center gap-1 max-w-[220px]">
                      {(member.roles && member.roles.length > 0 ? member.roles : (member.role ? [{ role: member.role, custom_role_id: member.custom_role_id }] : [])).map((r, i) => (
                        <span
                          key={`${r.role}-${r.custom_role_id || ''}-${i}`}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-xs text-slate-600"
                        >
                          {r.role === 'CUSTOM_ROLE' && <KeySquare className="w-3 h-3 text-indigo-500" />}
                          {r.role === 'CUSTOM_ROLE' ? (r.custom_role_name || customRoleName(r.custom_role_id) || 'Custom Role') : roleLabel(r.role)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="text-slate-700">{member.phone || '—'}</p>
                    <p className="text-xs text-slate-400">{member.email}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={member.status} />
                  </td>
                  <td className="px-4 py-3">
                    {isSalesRole(member.roles) ? (
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
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {member.joined_date
                      ? new Date(member.joined_date).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })
                      : '—'}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
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
                          {member.user_id && (
                            <button
                              onClick={() => openDevices(member)}
                              title="Manage Devices"
                              className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            >
                              <Smartphone className="w-4 h-4" />
                            </button>
                          )}
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
        </div>

        {filtered.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
            Showing {filtered.length} of {staff.length} team member{staff.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Add / Edit Staff Drawer */}
      {showDrawer && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={closeDrawer} />

          <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 shrink-0">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  {isAdd ? 'Add Internal Staff' : 'Edit Staff Member'}
                </h2>
                {!isAdd && <p className="text-xs text-gray-500 mt-0.5">{editing?.full_name}</p>}
              </div>
              <button type="button" onClick={closeDrawer} className="rounded p-1.5 text-gray-400 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {isAdd && isLoginRole && (
                <div className="mx-5 mt-4 flex items-start gap-2 bg-blue-50 border border-blue-100 text-blue-700 text-xs px-3 py-2.5 rounded-lg">
                  <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>A login account will be created for this staff member. Their phone number will be used as the login mobile number.</span>
                </div>
              )}

              <SectionHeader title="Basic Information" />
              <div className="px-5 pt-4 pb-2 space-y-3">
                <Field label="Full Name" required>
                  <input
                    className={inputCls}
                    placeholder="e.g. Jane Perera"
                    value={form.full_name}
                    onChange={set('full_name')}
                  />
                </Field>

                <Field label="Roles" required>
                  <div className="grid grid-cols-2 gap-2">
                    {ROLE_OPTIONS.map((r) => {
                      const selected = isRoleSelected(r.value);
                      return (
                        <button
                          key={r.value}
                          type="button"
                          onClick={() => toggleRole(r.value)}
                          className={`flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg border transition-colors text-left ${
                            selected
                              ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          {r.label}
                          {selected && <Check className="w-4 h-4 flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>

                  {customRoles.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-slate-500 mb-1.5">Custom Roles</p>
                      <div className="grid grid-cols-2 gap-2">
                        {customRoles.map((r) => {
                          const selected = isCustomRoleSelected(r.id);
                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => toggleCustomRole(r.id)}
                              className={`flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg border transition-colors text-left ${
                                selected
                                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-medium'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                              }`}
                            >
                              <span className="inline-flex items-center gap-1"><KeySquare className="w-3.5 h-3.5 flex-shrink-0" />{r.name}</span>
                              {selected && <Check className="w-4 h-4 flex-shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs text-slate-400 mt-1.5">
                        Custom roles grant every permission assigned to them. Manage roles from Permissions → Roles.
                      </p>
                    </div>
                  )}
                </Field>

                <Field label="Status">
                  <select className={inputCls} value={form.status} onChange={set('status')}>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <SectionHeader title="Contact" />
              <div className="px-5 pt-4 pb-2 space-y-3">
                <Field label="Email" required>
                  <input
                    type="email"
                    className={inputCls}
                    placeholder="name@vcare.lk"
                    value={form.email}
                    onChange={set('email')}
                  />
                </Field>
                <Field label="Phone" required={isAdd && isLoginRole}>
                  <PhoneInput
                    placeholder="07X XXX XXXX"
                    value={form.phone}
                    onChange={set('phone')}
                  />
                </Field>
              </div>

              <SectionHeader title="Employment" />
              <div className="px-5 pt-4 pb-2 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Joined Date">
                    <DateInput
                      className={inputCls}
                      value={form.joined_date}
                      onChange={set('joined_date')}
                    />
                  </Field>
                  <Field label="Base Salary (LKR)">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={inputCls}
                      placeholder="0.00"
                      value={form.base_salary}
                      onChange={set('base_salary')}
                      onWheel={(e) => e.target.blur()}
                    />
                  </Field>
                </div>
              </div>

              {isAdd && isLoginRole && (
                <>
                  <SectionHeader title="Login Access" />
                  <div className="px-5 pt-4 pb-6">
                    <Field label="Login Password" required>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          className={`${inputCls} font-mono`}
                          placeholder="Auto-generated password"
                          value={form.password}
                          onChange={set('password')}
                        />
                        <button
                          type="button"
                          onClick={regeneratePassword}
                          title="Generate new password"
                          className="p-2 rounded-lg border border-slate-300 text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors flex-shrink-0"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={copyPassword}
                          title="Copy password"
                          className="p-2 rounded-lg border border-slate-300 text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors flex-shrink-0"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Auto-generated — share this with the staff member, or edit it before saving.
                      </p>
                    </Field>
                  </div>
                </>
              )}
              {!(isAdd && isLoginRole) && <div className="pb-6" />}

              {formError && (
                <div className="mx-5 mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                  {formError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 border-t border-gray-200 px-6 py-4 shrink-0">
              <button
                type="button"
                onClick={closeDrawer}
                className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'Saving…' : isAdd ? 'Add Staff' : 'Save Changes'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Devices modal */}
      {devicesFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">
                Devices — {devicesFor.full_name}
              </h2>
              <button
                onClick={closeDevices}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Assign New Device
                  </label>
                  <input
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-colors"
                    placeholder="e.g. Dell Laptop #14"
                    value={newDeviceLabel}
                    onChange={(e) => setNewDeviceLabel(e.target.value)}
                  />
                </div>
                <button
                  onClick={handleAssignDevice}
                  disabled={assigningDevice || !newDeviceLabel.trim()}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {assigningDevice && <Loader2 className="w-4 h-4 animate-spin" />}
                  Assign
                </button>
              </div>

              {loadingDevices ? (
                <div className="flex items-center justify-center gap-2 h-24 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Loading devices…
                </div>
              ) : devices.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-8">
                  No devices assigned yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {devices.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between border border-slate-100 rounded-lg px-4 py-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900 text-sm">{d.label}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${deviceStatusColor(d.status)}`}>
                            {d.status}
                          </span>
                        </div>
                        {d.status === 'PENDING' && d.activation_code && (
                          <button
                            onClick={() => copyCode(d.activation_code)}
                            className="flex items-center gap-1 mt-1 text-xs text-blue-600 hover:text-blue-700 font-mono"
                          >
                            <Copy className="w-3 h-3" /> {d.activation_code}
                          </button>
                        )}
                      </div>
                      {d.status !== 'REVOKED' && (
                        <button
                          onClick={() => handleRevokeDevice(d.id)}
                          disabled={revokingDeviceId === d.id}
                          className="px-3 py-1.5 text-xs font-semibold bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {revokingDeviceId === d.id ? 'Revoking…' : 'Revoke'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default InternalStaffPage;
