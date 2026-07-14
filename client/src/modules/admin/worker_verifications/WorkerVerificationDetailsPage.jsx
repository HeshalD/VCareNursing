import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Check, X, Eye, FileText,
  AlertCircle, ShieldCheck, Loader2,
  BadgeCheck, StickyNote, Building2, Plus, Trash2, Pencil, Camera, Send, Upload, Save
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import ImageCropModal from '../../../components/common/ImageCropModal';
import DateInput from '../../../components/common/DateInput';

const STAFF_ROLES = ['CARETAKER', 'NURSING_ASSISTANT', 'NURSE', 'PHYSIOTHERAPIST', 'NANNY', 'COUNSELLOR'];
const GENDERS = ['MALE', 'FEMALE', 'OTHER'];
const EXPERIENCE_LEVELS = [
  { value: 'BEGINNER',          label: 'Beginner' },
  { value: '1_YEAR',            label: '1 Year' },
  { value: '2_YEARS',           label: '2 Years' },
  { value: '3_YEARS',           label: '3 Years' },
  { value: '4_YEARS',           label: '4 Years' },
  { value: '5_YEARS',           label: '5 Years' },
  { value: 'MORE_THAN_5_YEARS', label: 'More than 5 Years' },
];
const experienceLevelLabel = (val) => EXPERIENCE_LEVELS.find(e => e.value === val)?.label || val || 'N/A';

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

const StatusDot = ({ status }) => {
  const cfg = {
    PENDING:  { dot: 'bg-amber-400',   text: 'text-amber-700',   label: 'Pending' },
    ACCEPTED: { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Accepted' },
    REJECTED: { dot: 'bg-red-400',     text: 'text-red-700',     label: 'Rejected' },
  }[status] ?? { dot: 'bg-slate-300', text: 'text-slate-500', label: status };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

const InfoRow = ({ label, value }) => (
  <div className="grid grid-cols-[140px_1fr] py-2.5 gap-4 items-start">
    <span className="text-xs text-slate-500">{label}</span>
    <span className="text-sm text-slate-800">{value || <span className="text-slate-400">—</span>}</span>
  </div>
);

const SectionHeader = ({ title, children }) => (
  <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</p>
    {children}
  </div>
);

const EditField = ({ label, value, onChange, type = 'text' }) => (
  <div>
    <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
    <input type={type} value={value} onChange={e => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none" />
  </div>
);

const DocButton = ({ label, onClick }) => (
  <button onClick={onClick}
    className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-blue-200 transition-all text-left group">
    <FileText className="w-4 h-4 text-slate-400 group-hover:text-blue-500 flex-shrink-0" />
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold text-slate-700 group-hover:text-blue-700">{label}</p>
      <p className="text-xs text-slate-400">Click to view</p>
    </div>
    <Eye className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-400" />
  </button>
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
  const [profilePictureToCrop, setProfilePictureToCrop] = useState(null);

  const [approveModal, setApproveModal] = useState({ isOpen: false, staffId: '', adminRemarks: '', staffIdLoading: false, staffIdConflict: '', checkingStaffId: false });
  const [rejectModal, setRejectModal] = useState({ isOpen: false, reason: '' });
  const [processingAction, setProcessingAction] = useState(false);
  const [actionError, setActionError] = useState('');

  const [sendingAgreement, setSendingAgreement] = useState(false);

  const [sendingDocRequest, setSendingDocRequest] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState({ gn: false, police: false });
  const gnInputRef = useRef(null);
  const policeInputRef = useRef(null);
  const [docRequestSentAt, setDocRequestSentAt] = useState(null);

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
      if (data.doc_request_sent_at) setDocRequestSentAt(data.doc_request_sent_at);
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
        experience_level: data.experience_level || '',
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
      experience_level: application.experience_level || '',
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
    setActionError('');
    setProfilePictureToCrop(file);
  };

  const handleProfilePictureCropComplete = (croppedFile) => {
    setProfilePictureToCrop(null);
    if (profilePicturePreview) URL.revokeObjectURL(profilePicturePreview);
    setProfilePictureFile(croppedFile);
    setProfilePicturePreview(URL.createObjectURL(croppedFile));
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

  const handleSendDocRequest = async () => {
    setSendingDocRequest(true);
    setActionError('');
    try {
      apiClient.setToken(adminToken);
      const res = await apiClient.sendDocumentRequest(applicationId);
      setDocRequestSentAt(res.doc_request_sent_at || new Date().toISOString());
    } catch (err) {
      setActionError(err.message || 'Failed to send the document request via WhatsApp.');
    } finally {
      setSendingDocRequest(false);
    }
  };

  const handleAdminDocUpload = async (field, file) => {
    if (!file) return;
    const key = field === 'grama_niladhari' ? 'gn' : 'police';
    setUploadingDoc(p => ({ ...p, [key]: true }));
    setActionError('');
    try {
      apiClient.setToken(adminToken);
      const res = await apiClient.adminUploadComplianceDocs(applicationId, field, file);
      setApplication(prev => ({ ...prev, ...res.data }));
    } catch (err) {
      setActionError(err.message || 'Failed to upload document.');
    } finally {
      setUploadingDoc(p => ({ ...p, [key]: false }));
    }
  };

  const openApproveModal = async () => {
    setActionError('');
    setApproveModal({ isOpen: true, staffId: '', adminRemarks: '', staffIdLoading: true, staffIdConflict: '', checkingStaffId: false });
    try {
      apiClient.setToken(adminToken);
      const res = await apiClient.getNextStaffCode();
      setApproveModal(p => (p.isOpen && !p.staffId ? { ...p, staffId: res.staff_id, staffIdLoading: false } : { ...p, staffIdLoading: false }));
    } catch {
      setApproveModal(p => ({ ...p, staffIdLoading: false }));
    }
  };

  const handleStaffIdBlur = async (value) => {
    if (!value || !value.trim()) return;
    setApproveModal(p => ({ ...p, checkingStaffId: true, staffIdConflict: '' }));
    try {
      apiClient.setToken(adminToken);
      const res = await apiClient.checkStaffCode(value.trim());
      setApproveModal(p => ({
        ...p,
        checkingStaffId: false,
        staffIdConflict: res.available ? '' : `"${value.trim()}" is already assigned to another staff member.`,
      }));
    } catch {
      setApproveModal(p => ({ ...p, checkingStaffId: false }));
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
      {/* Page header row */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <button onClick={() => navigate('/admin/workers')}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="w-px h-4 bg-slate-200" />

        <div className="flex items-center gap-2.5 flex-1 min-w-0 flex-wrap">
          <span className="text-base font-semibold text-slate-900 truncate">{application.full_name}</span>
          {application.application_code && (
            <span className="text-xs font-mono text-slate-400">{application.application_code}</span>
          )}
          <StatusDot status={application.status} />
        </div>

        {/* Actions in header */}
        {isPending && !isEditing && (
          <div className="flex items-center gap-2">
            <button onClick={() => { setRejectModal({ isOpen: true, reason: '' }); setActionError(''); }}
              className="px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
              Reject
            </button>
            <button onClick={() => { setIsEditing(true); setActionError(''); }}
              className="px-3 py-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
              Edit
            </button>
            <button onClick={openApproveModal}
              className="px-4 py-1.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-500 transition-colors">
              Approve
            </button>
          </div>
        )}
        {isPending && isEditing && (
          <div className="flex items-center gap-2">
            <button onClick={handleCancelEdit}
              className="px-3 py-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button onClick={handleSaveEdit} disabled={savingEdit}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-60">
              {savingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save Changes
            </button>
          </div>
        )}
      </div>

      {/* Action Error */}
      {actionError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {actionError}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* ── LEFT COLUMN ── */}
        <div className="xl:col-span-1 space-y-4">

          {/* Profile card */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="p-5 flex flex-col items-center text-center border-b border-slate-100">
              {(() => {
                const displayUrl = profilePicturePreview || application.profile_picture_url;
                const avatar = displayUrl ? (
                  <img src={displayUrl} alt={application.full_name}
                    className="w-20 h-20 rounded-full object-cover ring-2 ring-slate-100" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center ring-2 ring-slate-100">
                    <span className="text-slate-500 font-bold text-2xl">{application.full_name?.charAt(0) || 'A'}</span>
                  </div>
                );
                return isEditing ? (
                  <label className="relative group cursor-pointer mb-3" title="Change profile picture">
                    {avatar}
                    <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Camera className="w-5 h-5 text-white" />
                    </div>
                    <input type="file" accept="image/jpeg,image/jpg,image/png"
                      onChange={handleProfilePictureChange} className="hidden" />
                  </label>
                ) : <div className="mb-3">{avatar}</div>;
              })()}
              <p className="font-semibold text-slate-900">{application.full_name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{roles.map(r => r.replace(/_/g, ' ')).join(', ') || 'No roles'}</p>
              <p className="text-xs text-slate-400 mt-1">Applied {formatDate(application.applied_at)}</p>
            </div>
            <div className="divide-y divide-slate-50 px-4">
              <InfoRow label="Mobile" value={application.mobile_number} />
              <InfoRow label="Email" value={application.email} />
              <InfoRow label="Location" value={application.location} />
            </div>
          </div>

          {/* Status overview */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Status Overview</p>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Application</span>
                <StatusDot status={application.status} />
              </div>
              {application.status === 'ACCEPTED' && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Contract</span>
                    {application.agreement_sent_at
                      ? <span className="text-xs font-medium text-blue-700 flex items-center gap-1"><Check className="w-3 h-3" /> Sent</span>
                      : <span className="text-xs text-slate-400">Not Sent</span>}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Compliance Docs</span>
                    {application.grama_niladhari_url && application.police_report_url
                      ? <span className="text-xs font-medium text-emerald-700 flex items-center gap-1"><Check className="w-3 h-3" /> Complete</span>
                      : (application.grama_niladhari_url || application.police_report_url)
                        ? <span className="text-xs font-medium text-amber-700">Partial</span>
                        : <span className="text-xs text-slate-400">Pending</span>}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Rejection reason */}
          {application.status === 'REJECTED' && application.rejection_reason && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1.5">Rejection Reason</p>
              <p className="text-sm text-red-600">{application.rejection_reason}</p>
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="xl:col-span-2 space-y-4">

          {/* Contact & Personal */}
          <div className="bg-white border border-slate-200 rounded-lg">
            <SectionHeader title="Contact & Personal Details" />
            <div className="p-5">
              {isEditing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <EditField label="Full Name" value={editData.full_name}
                    onChange={v => setEditData(p => ({ ...p, full_name: v }))} />
                  <EditField label="Mobile Number" value={editData.mobile_number}
                    onChange={v => setEditData(p => ({ ...p, mobile_number: v }))} />
                  <EditField label="Email" type="email" value={editData.email}
                    onChange={v => setEditData(p => ({ ...p, email: v }))} />
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Gender</label>
                    <select value={editData.gender}
                      onChange={e => setEditData(p => ({ ...p, gender: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-400 outline-none">
                      <option value="">Select gender</option>
                      {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Date of Birth</label>
                    <DateInput value={editData.date_of_birth}
                      onChange={e => setEditData(p => ({ ...p, date_of_birth: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-400 outline-none" />
                  </div>
                  <EditField label="NIC Number" value={editData.nic_number}
                    onChange={v => setEditData(p => ({ ...p, nic_number: v }))} />
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  <InfoRow label="Full Name" value={application.full_name} />
                  <InfoRow label="Mobile" value={application.mobile_number} />
                  <InfoRow label="Email" value={application.email} />
                  <InfoRow label="Gender" value={application.gender} />
                  <InfoRow label="Date of Birth" value={formatDate(application.date_of_birth)} />
                  <InfoRow label="NIC Number" value={application.nic_number} />
                </div>
              )}
            </div>
          </div>

          {/* Address */}
          <div className="bg-white border border-slate-200 rounded-lg">
            <SectionHeader title="Address" />
            <div className="p-5">
              {isEditing ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Home Address</label>
                    <textarea rows={2} value={editData.home_address}
                      onChange={e => setEditData(p => ({ ...p, home_address: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-400 outline-none resize-none" />
                  </div>
                  <EditField label="City / Location" value={editData.location}
                    onChange={v => setEditData(p => ({ ...p, location: v }))} />
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  <InfoRow label="Home Address" value={application.home_address} />
                  <InfoRow label="City / Location" value={application.location} />
                </div>
              )}
            </div>
          </div>

          {/* Roles & Qualifications */}
          <div className="bg-white border border-slate-200 rounded-lg">
            <SectionHeader title="Roles & Qualifications" />
            <div className="p-5">
              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-2">Applied Roles</label>
                    <div className="flex flex-wrap gap-2">
                      {STAFF_ROLES.map(role => (
                        <button key={role} type="button" onClick={() => toggleRole(role)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                            editData.applied_roles.includes(role)
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                          }`}>
                          {role.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Qualifications</label>
                    <textarea rows={3} value={editData.qualifications}
                      onChange={e => setEditData(p => ({ ...p, qualifications: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-400 outline-none resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Experience Level</label>
                    <select value={editData.experience_level}
                      onChange={e => setEditData(p => ({ ...p, experience_level: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-400 outline-none">
                      <option value="">Not specified</option>
                      {EXPERIENCE_LEVELS.map(({ value, label }) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  <div className="grid grid-cols-[140px_1fr] py-2.5 gap-4 items-start">
                    <span className="text-xs text-slate-500">Applied Roles</span>
                    <div className="flex flex-wrap gap-1.5">
                      {roles.length > 0
                        ? roles.map(r => (
                            <span key={r} className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 text-xs font-medium rounded">
                              {r.replace(/_/g, ' ')}
                            </span>
                          ))
                        : <span className="text-sm text-slate-400">None</span>}
                    </div>
                  </div>
                  <InfoRow label="Qualifications" value={application.qualifications} />
                  <InfoRow label="Experience Level" value={experienceLevelLabel(application.experience_level)} />
                </div>
              )}
            </div>
          </div>

          {/* Identity Documents */}
          {(application.nic_front_url || application.nic_back_url) && (
            <div className="bg-white border border-slate-200 rounded-lg">
              <SectionHeader title="Identity Documents" />
              <div className="p-5">
                <div className="divide-y divide-slate-50 mb-4">
                  <InfoRow label="NIC Number" value={application.nic_number} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {application.nic_front_url && (
                    <DocButton label="NIC Front" onClick={() => window.open(application.nic_front_url, '_blank')} />
                  )}
                  {application.nic_back_url && (
                    <DocButton label="NIC Back" onClick={() => window.open(application.nic_back_url, '_blank')} />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Supporting Documents */}
          {application.document_urls?.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg">
              <SectionHeader title="Supporting Documents" />
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {application.document_urls.map((url, i) => (
                  <DocButton key={i} label={`Document ${i + 1}`} onClick={() => window.open(url, '_blank')} />
                ))}
              </div>
            </div>
          )}

          {/* Contractor Agreement */}
          {application.status === 'ACCEPTED' && (
            <div className="bg-white border border-slate-200 rounded-lg">
              <SectionHeader title="Contractor Agreement">
                {application.agreement_sent_at ? (
                  <span className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Sent {formatDate(application.agreement_sent_at)}
                  </span>
                ) : (
                  <button onClick={handleSendAgreement} disabled={sendingAgreement || !application.mobile_number}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-500 transition-all disabled:opacity-60">
                    {sendingAgreement ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    Send Agreement
                  </button>
                )}
              </SectionHeader>
              <div className="px-5 py-4">
                <p className="text-xs text-slate-500">
                  {application.agreement_sent_at
                    ? `Independent Contractor Agreement sent to ${application.full_name} via WhatsApp.`
                    : `Send the Independent Contractor Agreement PDF to ${application.full_name}${application.mobile_number ? ` (${application.mobile_number})` : ''} via WhatsApp.`}
                </p>
              </div>
            </div>
          )}

          {/* Compliance Documents */}
          {application.status === 'ACCEPTED' && (
            <div className="bg-white border border-slate-200 rounded-lg">
              <SectionHeader title="Compliance Documents">
                <div className="flex items-center gap-2">
                  {docRequestSentAt && (
                    <span className="text-xs text-slate-400">Requested {formatDate(docRequestSentAt)}</span>
                  )}
                  <button onClick={handleSendDocRequest} disabled={sendingDocRequest || !application.mobile_number}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-500 transition-all disabled:opacity-60">
                    {sendingDocRequest ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    {docRequestSentAt ? 'Resend Request' : 'Send Request'}
                  </button>
                </div>
              </SectionHeader>

              <input ref={gnInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                onChange={e => { if (e.target.files?.[0]) { handleAdminDocUpload('grama_niladhari', e.target.files[0]); e.target.value = ''; } }} />
              <input ref={policeInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                onChange={e => { if (e.target.files?.[0]) { handleAdminDocUpload('police_report', e.target.files[0]); e.target.value = ''; } }} />

              <div className="px-5 pb-5 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { key: 'gn', field: 'grama_niladhari', label: 'Grama Niladhari Report', url: application.grama_niladhari_url, ref: gnInputRef },
                  { key: 'police', field: 'police_report', label: 'Police Report', url: application.police_report_url, ref: policeInputRef },
                ].map(({ key, label, url, ref }) => (
                  <div key={key} className="border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-slate-700">{label}</p>
                      {url
                        ? <span className="text-xs font-medium text-emerald-700 flex items-center gap-1"><Check className="w-3 h-3" /> Uploaded</span>
                        : <span className="text-xs text-amber-600">Pending</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {url && (
                        <button onClick={() => window.open(url, '_blank')}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                          <Eye className="w-3 h-3" /> View
                        </button>
                      )}
                      <button onClick={() => ref.current?.click()} disabled={uploadingDoc[key]}
                        className="ml-auto flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-60">
                        {uploadingDoc[key] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                        {url ? 'Replace' : 'Upload'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bank Accounts */}
          {application.status === 'ACCEPTED' && application.staff_profile_id && (
            <div className="bg-white border border-slate-200 rounded-lg">
              <SectionHeader title="Bank Accounts">
                <button onClick={openAddBankModal}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-500 transition-all">
                  <Plus className="w-3.5 h-3.5" /> Add Account
                </button>
              </SectionHeader>
              <div className="p-5">
                {bankAccountsLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                  </div>
                ) : bankAccounts.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">No bank accounts added yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {bankAccounts.map(account => (
                      <div key={account.staff_bank_account_id} className="py-3 flex items-start gap-3 first:pt-0 last:pb-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800">{account.account_holder_name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {account.bank_name}{account.branch_name ? ` · ${account.branch_name}` : ''}
                          </p>
                          <p className="text-xs font-mono text-slate-600 mt-0.5">{account.account_number} · {account.currency}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEditBankModal(account)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 rounded transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDeleteBankAccount(account.staff_bank_account_id)}
                            disabled={deletingBankId === account.staff_bank_account_id}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded transition-colors disabled:opacity-50">
                            {deletingBankId === account.staff_bank_account_id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

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
                    onChange={e => setApproveModal(p => ({ ...p, staffId: e.target.value, staffIdConflict: '' }))}
                    onBlur={e => handleStaffIdBlur(e.target.value)}
                    placeholder={approveModal.staffIdLoading ? 'Generating Staff ID...' : 'e.g. EMP-5000'}
                    className={`w-full px-4 py-2.5 border rounded-xl text-sm outline-none pr-10 ${
                      approveModal.staffIdConflict
                        ? 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-2 focus:ring-red-100'
                        : 'border-slate-200 focus:border-green-300 focus:ring-2 focus:ring-green-100'
                    }`}
                  />
                  {(approveModal.staffIdLoading || approveModal.checkingStaffId) && (
                    <Loader2 className="w-4 h-4 animate-spin text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  )}
                  {!approveModal.staffIdLoading && !approveModal.checkingStaffId && approveModal.staffId && !approveModal.staffIdConflict && (
                    <Check className="w-4 h-4 text-green-500 absolute right-3 top-1/2 -translate-y-1/2" />
                  )}
                </div>
                {approveModal.staffIdConflict && (
                  <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {approveModal.staffIdConflict}
                  </p>
                )}
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
                disabled={processingAction || !!approveModal.staffIdConflict || approveModal.checkingStaffId}
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
      <ImageCropModal
        imageFile={profilePictureToCrop}
        aspect={1}
        onCancel={() => setProfilePictureToCrop(null)}
        onCropComplete={handleProfilePictureCropComplete}
      />
    </AdminLayout>
  );
};

export default WorkerVerificationDetailsPage;
