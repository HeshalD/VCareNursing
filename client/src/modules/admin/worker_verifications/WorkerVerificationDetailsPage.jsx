import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Check, X, Edit2, Save, XCircle, Eye, FileText,
  AlertCircle, ShieldAlert, ShieldCheck, Loader2, User, Phone,
  Mail, MapPin, Calendar, CreditCard, Briefcase, ClipboardList,
  BadgeCheck, StickyNote, Building2, Plus, Trash2, Pencil, Camera, Send, FileSignature
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';

const STAFF_ROLES = ['NURSE', 'CARETAKER', 'NANNY', 'COORDINATOR'];
const GENDERS = ['MALE', 'FEMALE', 'OTHER'];

const parseRoles = (roles) => {
  if (!roles) return [];
  if (Array.isArray(roles)) return roles.map(r => r.replace(/\{|\}/g, '').trim()).filter(Boolean);
  if (typeof roles === 'string') {
    return roles.replace(/^\{|\}$/g, '').split(',').map(r => r.trim()).filter(Boolean);
  }
  return [];
};

const formatDate = (val) => {
  if (!val) return 'N/A';
  const d = new Date(val);
  return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

const StatusBadge = ({ status }) => {
  const styles = {
    PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
    ACCEPTED: 'bg-green-50 text-green-700 border-green-200',
    REJECTED: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${styles[status] || styles.PENDING}`}>
      {status || 'PENDING'}
    </span>
  );
};

const Field = ({ label, value, icon: Icon }) => (
  <div>
    <p className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
      {Icon && <Icon className="w-3.5 h-3.5" />} {label}
    </p>
    <p className="text-sm text-slate-800 font-medium">{value || 'N/A'}</p>
  </div>
);

const WorkerVerificationDetailsPage = () => {
  const { applicationId } = useParams();
  const navigate = useNavigate();
  const { adminToken } = useAdminAuth();

  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [profilePictureFile, setProfilePictureFile] = useState(null);
  const [profilePicturePreview, setProfilePicturePreview] = useState(null);

  const [approveModal, setApproveModal] = useState({ isOpen: false, staffId: '', adminRemarks: '', staffIdLoading: false });
  const [rejectModal, setRejectModal] = useState({ isOpen: false, reason: '' });
  const [processingAction, setProcessingAction] = useState(false);
  const [actionError, setActionError] = useState('');

  const [sendingAgreement, setSendingAgreement] = useState(false);

  const [bankAccounts, setBankAccounts] = useState([]);
  const [bankAccountsLoading, setBankAccountsLoading] = useState(false);
  const [bankModal, setBankModal] = useState({
    isOpen: false,
    mode: 'add', // 'add' | 'edit'
    editing: null,
    form: { account_holder_name: '', bank_name: '', branch_name: '', account_number: '', currency: 'LKR' },
    saving: false,
    error: '',
  });
  const [deletingBankId, setDeletingBankId] = useState(null);

  const withAdminToken = (fn) => async (...args) => {
    const original = apiClient.token;
    apiClient.setToken(adminToken);
    try {
      return await fn(...args);
    } finally {
      apiClient.setToken(original);
    }
  };

  const fetchBankAccounts = async (staffProfileId) => {
    setBankAccountsLoading(true);
    try {
      apiClient.setToken(adminToken);
      const res = await apiClient.getStaffBankAccounts(staffProfileId);
      setBankAccounts(res.data || []);
    } catch {
      setBankAccounts([]);
    } finally {
      setBankAccountsLoading(false);
    }
  };

  const openAddBankModal = () => setBankModal({
    isOpen: true, mode: 'add', editing: null,
    form: { account_holder_name: '', bank_name: '', branch_name: '', account_number: '', currency: 'LKR' },
    saving: false, error: '',
  });

  const openEditBankModal = (account) => setBankModal({
    isOpen: true, mode: 'edit', editing: account.staff_bank_account_id,
    form: {
      account_holder_name: account.account_holder_name || '',
      bank_name: account.bank_name || '',
      branch_name: account.branch_name || '',
      account_number: account.account_number || '',
      currency: account.currency || 'LKR',
    },
    saving: false, error: '',
  });

  const handleBankModalSave = async () => {
    const { form, mode, editing } = bankModal;
    if (!form.account_holder_name || !form.bank_name || !form.account_number) {
      setBankModal(p => ({ ...p, error: 'Account holder name, bank name and account number are required.' }));
      return;
    }
    setBankModal(p => ({ ...p, saving: true, error: '' }));
    try {
      apiClient.setToken(adminToken);
      const staffId = application.staff_profile_id;
      if (mode === 'add') {
        await apiClient.createStaffBankAccount(staffId, form);
      } else {
        await apiClient.updateStaffBankAccount(staffId, editing, form);
      }
      await fetchBankAccounts(staffId);
      setBankModal(p => ({ ...p, isOpen: false }));
    } catch (err) {
      setBankModal(p => ({ ...p, saving: false, error: err.message || 'Failed to save bank account.' }));
    }
  };

  const handleDeleteBankAccount = async (bankAccountId) => {
    setDeletingBankId(bankAccountId);
    try {
      apiClient.setToken(adminToken);
      await apiClient.deleteStaffBankAccount(application.staff_profile_id, bankAccountId);
      await fetchBankAccounts(application.staff_profile_id);
    } catch {
      // silently ignore; user can retry
    } finally {
      setDeletingBankId(null);
    }
  };

  const fetchApplication = async () => {
    try {
      setLoading(true);
      setError('');
      const original = apiClient.token;
      apiClient.setToken(adminToken);
      const data = await apiClient.getApplication(applicationId);
      apiClient.setToken(original);
      setApplication(data);
      if (data.status === 'ACCEPTED' && data.staff_profile_id) {
        fetchBankAccounts(data.staff_profile_id);
      }
      const roles = parseRoles(data.applied_roles);
      setEditData({
        full_name: data.full_name || '',
        email: data.email || '',
        mobile_number: data.mobile_number || '',
        applied_roles: roles,
        qualifications: data.qualifications || '',
        home_address: data.home_address || '',
        location: data.location || '',
        nic_number: data.nic_number || '',
        gender: data.gender || '',
        date_of_birth: data.date_of_birth ? data.date_of_birth.substring(0, 10) : '',
      });
    } catch (err) {
      setError(err.message || 'Error fetching application');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminToken) fetchApplication();
  }, [adminToken, applicationId]);

  const handleSaveEdit = async () => {
    setSavingEdit(true);
    setActionError('');
    try {
      const original = apiClient.token;
      apiClient.setToken(adminToken);
      const result = await apiClient.updateApplicationDetails(applicationId, {
        ...editData,
        applied_roles: editData.applied_roles,
      }, profilePictureFile);
      apiClient.setToken(original);
      setApplication(result.data);
      setIsEditing(false);
      if (profilePicturePreview) URL.revokeObjectURL(profilePicturePreview);
      setProfilePictureFile(null);
      setProfilePicturePreview(null);
    } catch (err) {
      setActionError(err.message || 'Error saving changes');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCancelEdit = () => {
    const roles = parseRoles(application.applied_roles);
    setEditData({
      full_name: application.full_name || '',
      email: application.email || '',
      mobile_number: application.mobile_number || '',
      applied_roles: roles,
      qualifications: application.qualifications || '',
      home_address: application.home_address || '',
      location: application.location || '',
      nic_number: application.nic_number || '',
      gender: application.gender || '',
      date_of_birth: application.date_of_birth ? application.date_of_birth.substring(0, 10) : '',
    });
    setIsEditing(false);
    setActionError('');
    if (profilePicturePreview) URL.revokeObjectURL(profilePicturePreview);
    setProfilePictureFile(null);
    setProfilePicturePreview(null);
  };

  const handleProfilePictureChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/jpg', 'image/png'].includes(file.type)) {
      setActionError('Profile picture must be a JPG or PNG image.');
      return;
    }
    if (profilePicturePreview) URL.revokeObjectURL(profilePicturePreview);
    setProfilePictureFile(file);
    setProfilePicturePreview(URL.createObjectURL(file));
    setActionError('');
  };

  const handleSendAgreement = async () => {
    setSendingAgreement(true);
    setActionError('');
    try {
      apiClient.setToken(adminToken);
      const res = await apiClient.sendApplicationAgreement(applicationId);
      setApplication(prev => ({
        ...prev,
        agreement_sent_at: res.agreement_sent_at || new Date().toISOString(),
      }));
    } catch (err) {
      setActionError(err.message || 'Failed to send the agreement via WhatsApp.');
    } finally {
      setSendingAgreement(false);
    }
  };

  const openApproveModal = async () => {
    setActionError('');
    setApproveModal({ isOpen: true, staffId: '', adminRemarks: '', staffIdLoading: true });
    try {
      apiClient.setToken(adminToken);
      const res = await apiClient.getNextStaffCode();
      // Only fill if the modal is still open and the admin hasn't typed anything yet
      setApproveModal(p => (p.isOpen && !p.staffId ? { ...p, staffId: res.staff_id, staffIdLoading: false } : { ...p, staffIdLoading: false }));
    } catch {
      setApproveModal(p => ({ ...p, staffIdLoading: false }));
    }
  };

  const handleApprove = async () => {
    if (!approveModal.staffId.trim()) {
      setActionError('Please enter a Staff ID before approving.');
      return;
    }
    setProcessingAction(true);
    setActionError('');
    try {
      const original = apiClient.token;
      apiClient.setToken(adminToken);
      await apiClient.acceptApplication(applicationId, {
        custom_staff_id: approveModal.staffId.trim(),
        admin_remarks: approveModal.adminRemarks.trim() || null,
      });
      apiClient.setToken(original);
      setApproveModal({ isOpen: false, staffId: '', adminRemarks: '' });
      await fetchApplication();
    } catch (err) {
      setActionError(err.message || 'Error approving application');
    } finally {
      setProcessingAction(false);
    }
  };

  const handleReject = async () => {
    if (!rejectModal.reason.trim()) {
      setActionError('Please enter a rejection reason.');
      return;
    }
    setProcessingAction(true);
    setActionError('');
    try {
      const original = apiClient.token;
      apiClient.setToken(adminToken);
      await apiClient.rejectApplication(applicationId, rejectModal.reason.trim());
      apiClient.setToken(original);
      setRejectModal({ isOpen: false, reason: '' });
      await fetchApplication();
    } catch (err) {
      setActionError(err.message || 'Error rejecting application');
    } finally {
      setProcessingAction(false);
    }
  };

  const toggleRole = (role) => {
    setEditData(prev => ({
      ...prev,
      applied_roles: prev.applied_roles.includes(role)
        ? prev.applied_roles.filter(r => r !== role)
        : [...prev.applied_roles, role],
    }));
  };

  if (loading) {
    return (
      <AdminLayout title="Application Review" subtitle="Loading...">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Application Review" subtitle="Error">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
      </AdminLayout>
    );
  }

  if (!application) return null;

  const roles = parseRoles(application.applied_roles);
  const isPending = application.status === 'PENDING';

  return (
    <AdminLayout
      title="Application Review"
      subtitle={`Reviewing application from ${application.full_name || 'Unknown'}`}
    >
      {/* Back button + Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/admin/workers')}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Back to Applications</span>
        </button>
        <div className="flex-1" />
        <StatusBadge status={application.status} />
      </div>

      {/* Action Error */}
      {actionError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* LEFT COLUMN */}
        <div className="xl:col-span-1 space-y-4">
          {/* Profile Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex flex-col items-center text-center">
              {(() => {
                const displayUrl = profilePicturePreview || application.profile_picture_url;
                const avatar = displayUrl ? (
                  <img
                    src={displayUrl}
                    alt={application.full_name}
                    className="w-24 h-24 rounded-2xl object-cover"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-2xl bg-slate-200 flex items-center justify-center">
                    <span className="text-slate-500 font-bold text-3xl">
                      {application.full_name?.charAt(0) || 'A'}
                    </span>
                  </div>
                );
                return isEditing ? (
                  <label className="relative group cursor-pointer mb-4" title="Change profile picture">
                    {avatar}
                    <div className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity">
                      <Camera className="w-6 h-6 text-white" />
                      <span className="text-[10px] font-semibold text-white mt-1">Change</span>
                    </div>
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png"
                      onChange={handleProfilePictureChange}
                      className="hidden"
                    />
                  </label>
                ) : (
                  <div className="mb-4">{avatar}</div>
                );
              })()}
              <h2 className="text-lg font-bold text-slate-900">{application.full_name}</h2>
              <p className="text-sm text-slate-500 mt-1">{roles.join(', ') || 'No roles'}</p>
              <p className="text-xs text-slate-400 mt-1">Applied {formatDate(application.applied_at)}</p>
            </div>
          </div>

          {/* Contact Info */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Phone className="w-4 h-4 text-blue-500" /> Contact Information
            </h3>
            {isEditing ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Full Name</label>
                  <input
                    value={editData.full_name}
                    onChange={e => setEditData(p => ({ ...p, full_name: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Mobile Number</label>
                  <input
                    value={editData.mobile_number}
                    onChange={e => setEditData(p => ({ ...p, mobile_number: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Email</label>
                  <input
                    type="email"
                    value={editData.email}
                    onChange={e => setEditData(p => ({ ...p, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <Field icon={User} label="Full Name" value={application.full_name} />
                <Field icon={Phone} label="Mobile" value={application.mobile_number} />
                <Field icon={Mail} label="Email" value={application.email} />
              </div>
            )}
          </div>

          {/* Personal Details */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <User className="w-4 h-4 text-purple-500" /> Personal Details
            </h3>
            {isEditing ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Gender</label>
                  <select
                    value={editData.gender}
                    onChange={e => setEditData(p => ({ ...p, gender: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-400 outline-none"
                  >
                    <option value="">Select gender</option>
                    {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Date of Birth</label>
                  <input
                    type="date"
                    value={editData.date_of_birth}
                    onChange={e => setEditData(p => ({ ...p, date_of_birth: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-400 outline-none"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <Field icon={User} label="Gender" value={application.gender} />
                <Field icon={Calendar} label="Date of Birth" value={formatDate(application.date_of_birth)} />
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="xl:col-span-2 space-y-4">
          {/* Applied Roles & Qualifications */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-green-500" /> Roles & Qualifications
            </h3>
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-2 block">Applied Roles</label>
                  <div className="flex flex-wrap gap-2">
                    {STAFF_ROLES.map(role => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => toggleRole(role)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          editData.applied_roles.includes(role)
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                        }`}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Qualifications</label>
                  <textarea
                    rows={3}
                    value={editData.qualifications}
                    onChange={e => setEditData(p => ({ ...p, qualifications: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none resize-none"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2">Applied Roles</p>
                  <div className="flex flex-wrap gap-2">
                    {roles.length > 0 ? roles.map(r => (
                      <span key={r} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold border border-blue-100">
                        {r}
                      </span>
                    )) : <span className="text-sm text-slate-400">None specified</span>}
                  </div>
                </div>
                <Field icon={ClipboardList} label="Qualifications" value={application.qualifications} />
              </div>
            )}
          </div>

          {/* Address */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-orange-500" /> Address
            </h3>
            {isEditing ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Home Address</label>
                  <textarea
                    rows={2}
                    value={editData.home_address}
                    onChange={e => setEditData(p => ({ ...p, home_address: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Location / City</label>
                  <input
                    value={editData.location}
                    onChange={e => setEditData(p => ({ ...p, location: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-400 outline-none"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <Field icon={MapPin} label="Home Address" value={application.home_address} />
                <Field icon={MapPin} label="Location / City" value={application.location} />
              </div>
            )}
          </div>

          {/* NIC Details */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-indigo-500" /> NIC / Identity
            </h3>
            {isEditing ? (
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">NIC Number</label>
                <input
                  value={editData.nic_number}
                  onChange={e => setEditData(p => ({ ...p, nic_number: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-400 outline-none"
                />
              </div>
            ) : (
              <Field icon={CreditCard} label="NIC Number" value={application.nic_number} />
            )}
            {(application.nic_front_url || application.nic_back_url) && (
              <div className="grid grid-cols-2 gap-3 mt-2">
                {application.nic_front_url && (
                  <button
                    onClick={() => window.open(application.nic_front_url, '_blank')}
                    className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl hover:bg-blue-50 hover:border-blue-200 transition-all group"
                  >
                    <Eye className="w-4 h-4 text-slate-400 group-hover:text-blue-500" />
                    <div className="text-left">
                      <p className="text-xs font-semibold text-slate-700 group-hover:text-blue-700">NIC Front</p>
                      <p className="text-xs text-slate-400">Click to view</p>
                    </div>
                  </button>
                )}
                {application.nic_back_url && (
                  <button
                    onClick={() => window.open(application.nic_back_url, '_blank')}
                    className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl hover:bg-blue-50 hover:border-blue-200 transition-all group"
                  >
                    <Eye className="w-4 h-4 text-slate-400 group-hover:text-blue-500" />
                    <div className="text-left">
                      <p className="text-xs font-semibold text-slate-700 group-hover:text-blue-700">NIC Back</p>
                      <p className="text-xs text-slate-400">Click to view</p>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Documents */}
          {application.document_urls && application.document_urls.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-500" /> Supporting Documents
              </h3>
              {application.document_urls.map((url, i) => (
                <button
                  key={i}
                  onClick={() => window.open(url, '_blank')}
                  className="w-full flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl hover:bg-blue-50 hover:border-blue-200 transition-all group"
                >
                  <FileText className="w-5 h-5 text-slate-400 group-hover:text-blue-500 flex-shrink-0" />
                  <div className="text-left flex-1">
                    <p className="text-sm font-medium text-slate-700 group-hover:text-blue-700">Document {i + 1}</p>
                    <p className="text-xs text-slate-400">Click to view</p>
                  </div>
                  <Eye className="w-4 h-4 text-slate-400 group-hover:text-blue-500" />
                </button>
              ))}
            </div>
          )}

          {/* Rejection Reason (if rejected) */}
          {application.status === 'REJECTED' && application.rejection_reason && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
              <p className="text-sm font-semibold text-red-700 mb-1 flex items-center gap-2">
                <XCircle className="w-4 h-4" /> Rejection Reason
              </p>
              <p className="text-sm text-red-600">{application.rejection_reason}</p>
            </div>
          )}

          {/* Approval info (if accepted) */}
          {application.status === 'ACCEPTED' && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-5 flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-green-600 flex-shrink-0" />
              <p className="text-sm font-semibold text-green-700">Application approved. Staff profile has been created.</p>
            </div>
          )}

          {/* Contractor Agreement (terms & conditions) — only shown after approval */}
          {application.status === 'ACCEPTED' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-start gap-4">
                <div className="p-2.5 bg-indigo-100 rounded-xl flex-shrink-0">
                  <FileSignature className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-slate-800">Contractor Agreement</h3>
                  {application.agreement_sent_at ? (
                    <p className="text-xs text-green-700 mt-0.5 flex items-center gap-1.5">
                      <BadgeCheck className="w-3.5 h-3.5 flex-shrink-0" />
                      Sent to <span className="font-medium">{application.full_name}</span> on {formatDate(application.agreement_sent_at)}.
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500 mt-0.5">
                      Send the Independent Contractor Agreement (terms &amp; conditions) PDF to{' '}
                      <span className="font-medium text-slate-700">{application.full_name}</span> on WhatsApp
                      {application.mobile_number ? ` (${application.mobile_number})` : ''}.
                    </p>
                  )}
                </div>
                {application.agreement_sent_at ? (
                  <span className="flex items-center gap-2 px-4 py-2.5 font-medium rounded-xl flex-shrink-0 bg-green-50 text-green-700 border border-green-200">
                    <Check className="w-4 h-4" /> Sent
                  </span>
                ) : (
                  <button
                    onClick={handleSendAgreement}
                    disabled={sendingAgreement || !application.mobile_number}
                    className="flex items-center gap-2 px-4 py-2.5 font-medium rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0 bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-600/20"
                  >
                    {sendingAgreement ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {sendingAgreement ? 'Sending...' : 'Send Agreement'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Bank Accounts — only shown after approval */}
          {application.status === 'ACCEPTED' && application.staff_profile_id && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-500" /> Bank Accounts
                </h3>
                <button
                  onClick={openAddBankModal}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-500 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Account
                </button>
              </div>

              {bankAccountsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                </div>
              ) : bankAccounts.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-sm">
                  No bank accounts added yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {bankAccounts.map(account => (
                    <div key={account.staff_bank_account_id} className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                      <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
                        <Building2 className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{account.account_holder_name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {account.bank_name}{account.branch_name ? ` · ${account.branch_name}` : ''}
                        </p>
                        <p className="text-xs font-mono text-slate-600 mt-1">{account.account_number} · {account.currency}</p>
                        {account.is_verified && (
                          <span className="inline-flex items-center gap-1 mt-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                            <Check className="w-3 h-3" /> Verified
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => openEditBankModal(account)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteBankAccount(account.staff_bank_account_id)}
                          disabled={deletingBankId === account.staff_bank_account_id}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50"
                          title="Remove"
                        >
                          {deletingBankId === account.staff_bank_account_id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />
                          }
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sticky Action Bar — only shown for PENDING */}
      {isPending && (
        <div className="mt-6 bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
          {isEditing ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-slate-500 flex-1">Editing application details...</p>
              <button
                onClick={handleCancelEdit}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-all"
              >
                <XCircle className="w-4 h-4" /> Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-500 transition-all disabled:opacity-60"
              >
                {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-sm text-slate-500 flex-1">
                <ShieldAlert className="w-4 h-4 inline mr-1 text-amber-500" />
                Pending review — approve, edit, or reject this application.
              </p>
              <button
                onClick={() => { setRejectModal({ isOpen: true, reason: '' }); setActionError(''); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all"
              >
                <X className="w-4 h-4" /> Reject
              </button>
              <button
                onClick={() => { setIsEditing(true); setActionError(''); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-200 text-blue-700 font-medium rounded-xl hover:bg-blue-100 transition-all"
              >
                <Edit2 className="w-4 h-4" /> Edit
              </button>
              <button
                onClick={openApproveModal}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white font-medium rounded-xl hover:bg-green-500 transition-all shadow-lg shadow-green-600/20"
              >
                <Check className="w-4 h-4" /> Approve
              </button>
            </div>
          )}
        </div>
      )}

      {/* Approve Modal */}
      {approveModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-start gap-3 mb-5">
              <div className="p-2 bg-green-100 rounded-lg">
                <BadgeCheck className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Approve Application</h3>
                <p className="text-sm text-slate-500">
                  Approving <span className="font-medium text-slate-700">{application.full_name}</span>'s application.
                </p>
              </div>
            </div>

            {actionError && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {actionError}
              </div>
            )}

            <div className="space-y-4 mb-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Staff ID <span className="text-red-500">*</span>
                  <span className="text-xs font-normal text-slate-400 ml-2">auto-generated — you can edit it</span>
                </label>
                <div className="relative">
                  <input
                    value={approveModal.staffId}
                    onChange={e => setApproveModal(p => ({ ...p, staffId: e.target.value }))}
                    placeholder={approveModal.staffIdLoading ? 'Generating Staff ID...' : 'e.g. EMP-5000'}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-green-300 focus:ring-2 focus:ring-green-100 outline-none"
                  />
                  {approveModal.staffIdLoading && (
                    <Loader2 className="w-4 h-4 animate-spin text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1">
                  <StickyNote className="w-4 h-4" /> Admin Remarks
                  <span className="text-xs font-normal text-slate-400 ml-1">(optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={approveModal.adminRemarks}
                  onChange={e => setApproveModal(p => ({ ...p, adminRemarks: e.target.value }))}
                  placeholder="Internal notes about this staff member..."
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-green-300 focus:ring-2 focus:ring-green-100 outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setApproveModal({ isOpen: false, staffId: '', adminRemarks: '' }); setActionError(''); }}
                className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={processingAction}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white font-medium rounded-xl hover:bg-green-500 transition-all shadow-lg shadow-green-600/20 disabled:opacity-60"
              >
                {processingAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Confirm Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bank Account Modal */}
      {bankModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-start gap-3 mb-5">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Building2 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {bankModal.mode === 'add' ? 'Add Bank Account' : 'Edit Bank Account'}
                </h3>
                <p className="text-sm text-slate-500">For {application.full_name}</p>
              </div>
            </div>

            {bankModal.error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {bankModal.error}
              </div>
            )}

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Account Holder Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={bankModal.form.account_holder_name}
                  onChange={e => setBankModal(p => ({ ...p, form: { ...p.form, account_holder_name: e.target.value } }))}
                  placeholder="e.g. John Perera"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-blue-300 focus:ring-1 focus:ring-blue-100 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Bank Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={bankModal.form.bank_name}
                  onChange={e => setBankModal(p => ({ ...p, form: { ...p.form, bank_name: e.target.value } }))}
                  placeholder="e.g. Commercial Bank"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-blue-300 focus:ring-1 focus:ring-blue-100 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Branch Name</label>
                <input
                  value={bankModal.form.branch_name}
                  onChange={e => setBankModal(p => ({ ...p, form: { ...p.form, branch_name: e.target.value } }))}
                  placeholder="e.g. Colombo 03"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-blue-300 focus:ring-1 focus:ring-blue-100 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Account Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={bankModal.form.account_number}
                    onChange={e => setBankModal(p => ({ ...p, form: { ...p.form, account_number: e.target.value } }))}
                    placeholder="1234567890"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-blue-300 focus:ring-1 focus:ring-blue-100 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Currency</label>
                  <select
                    value={bankModal.form.currency}
                    onChange={e => setBankModal(p => ({ ...p, form: { ...p.form, currency: e.target.value } }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-blue-300 outline-none"
                  >
                    <option value="LKR">LKR</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setBankModal(p => ({ ...p, isOpen: false }))}
                className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleBankModalSave}
                disabled={bankModal.saving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-60"
              >
                {bankModal.saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {bankModal.mode === 'add' ? 'Add Account' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-start gap-3 mb-5">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Reject Application</h3>
                <p className="text-sm text-slate-500">
                  Rejecting <span className="font-medium text-slate-700">{application.full_name}</span>'s application.
                </p>
              </div>
            </div>

            {actionError && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {actionError}
              </div>
            )}

            <div className="mb-5">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Rejection Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={4}
                value={rejectModal.reason}
                onChange={e => setRejectModal(p => ({ ...p, reason: e.target.value }))}
                placeholder="Enter the reason for rejecting this application..."
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:border-red-300 focus:ring-2 focus:ring-red-100 outline-none resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setRejectModal({ isOpen: false, reason: '' }); setActionError(''); }}
                className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={processingAction}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white font-medium rounded-xl hover:bg-red-500 transition-all shadow-lg shadow-red-600/20 disabled:opacity-60"
              >
                {processingAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default WorkerVerificationDetailsPage;
