import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, UserCircle, FileText, Plus, Edit2, Trash2, X, Upload, Shield, LogOut, ExternalLink, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import ImageCropModal from '../../../components/common/ImageCropModal';
import DateInput from '../../../components/common/DateInput';
import PhoneInput from '../../../components/common/PhoneInput';
import apiClient from '../../../api/api';
import useDebouncedValue from '../../../hooks/useDebouncedValue';

const PAGE_SIZE = 50;

const ROLE_LABELS = {
  CARETAKER: 'Caretaker',
  NURSING_ASSISTANT: 'Nursing Assistant',
  NURSE: 'Nurse',
  PHYSIOTHERAPIST: 'Physiotherapist',
  NANNY: 'Nanny',
  COUNSELLOR: 'Counsellor',
};

const EXP_LABELS = {
  BEGINNER: 'Beginner',
  '1_YEAR': '1 Year',
  '2_YEARS': '2 Years',
  '3_YEARS': '3 Years',
  '4_YEARS': '4 Years',
  '5_YEARS': '5 Years',
  MORE_THAN_5_YEARS: 'More than 5 Years',
};

function parseRoles(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return raw.replace(/^\{|\}$/g, '').split(',').map(r => r.trim()).filter(Boolean);
}

function formatRoles(raw) {
  return parseRoles(raw).map(r => ROLE_LABELS[r] || r.replace(/_/g, ' ')).join(', ') || '—';
}

const StatusDot = ({ status }) => {
  const cfg = {
    AVAILABLE:   { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Available' },
    UNAVAILABLE: { dot: 'bg-slate-400',   text: 'text-slate-500',   label: 'Unavailable' },
    ASSIGNED:    { dot: 'bg-blue-500',    text: 'text-blue-700',    label: 'On Assignment' },
  }[status?.toUpperCase()] ?? { dot: 'bg-slate-300', text: 'text-slate-500', label: status ?? '—' };

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
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
  `w-full px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:border-blue-400 transition-colors ${
    hasError
      ? 'border-red-400 bg-red-50 focus:ring-red-100'
      : 'border-slate-200 focus:ring-blue-100'
  }`;

const FileDropZone = ({ id, label, hint, onChange }) => (
  <div>
    <input type="file" id={id} className="hidden" accept="image/*" onChange={e => { const f = e.target.files[0]; if (f) onChange(f); }} />
    <label htmlFor={id}
      className="flex flex-col items-center justify-center w-full h-24 border border-dashed border-slate-300 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors group">
      <Upload className="w-5 h-5 text-slate-400 group-hover:text-blue-500 mb-1 transition-colors" />
      <p className="text-xs font-medium text-slate-500">{label}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </label>
  </div>
);

const ImagePreview = ({ src, onDelete, onChangeId, onChangeHandler, changeLabel = 'Change' }) => (
  <div className="relative w-fit">
    <img src={src} alt="preview" className="h-24 w-auto object-cover rounded-lg border border-slate-200" />
    <button type="button" onClick={onDelete}
      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow">
      <X className="w-3 h-3" />
    </button>
    {onChangeId && (
      <div className="mt-1.5">
        <input type="file" id={onChangeId} className="hidden" accept="image/*"
          onChange={e => { const f = e.target.files[0]; if (f) onChangeHandler(f); }} />
        <label htmlFor={onChangeId}
          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-600 rounded text-xs font-medium hover:bg-slate-200 cursor-pointer transition-colors">
          <Upload className="w-3 h-3" /> {changeLabel}
        </label>
      </div>
    )}
  </div>
);

const ComplianceDocField = ({ label, existingUrl, newFile, onSelect, onClear, inputId }) => (
  <div className="border border-slate-200 rounded-lg p-3">
    <div className="flex items-center justify-between gap-2 mb-2">
      <p className="text-xs font-semibold text-slate-700">{label}</p>
      {(existingUrl || newFile) ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="w-3.5 h-3.5" /> Submitted
        </span>
      ) : (
        <span className="text-xs text-slate-400">Not submitted</span>
      )}
    </div>
    <div className="flex items-center gap-2 flex-wrap">
      {existingUrl && !newFile && (
        <a href={existingUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-600 rounded text-xs font-medium hover:bg-slate-200 transition-colors">
          <ExternalLink className="w-3 h-3" /> View
        </a>
      )}
      {newFile && (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded text-xs font-medium">
          <FileText className="w-3 h-3" /> {newFile.name}
        </span>
      )}
      <input type="file" id={inputId} className="hidden" accept="image/*,.pdf"
        onChange={e => { const f = e.target.files[0]; if (f) onSelect(f); }} />
      <label htmlFor={inputId}
        className="inline-flex items-center gap-1 px-2.5 py-1 border border-dashed border-slate-300 rounded text-xs font-medium text-slate-500 hover:bg-slate-50 cursor-pointer transition-colors">
        <Upload className="w-3 h-3" /> {existingUrl || newFile ? 'Replace' : 'Upload'}
      </label>
      {newFile && (
        <button type="button" onClick={onClear} className="p-1 text-slate-400 hover:text-red-500 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  </div>
);

const ProxyUserManagement = () => {
  const navigate = useNavigate();
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [profilePictureToCrop, setProfilePictureToCrop] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 400);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  const [formData, setFormData] = useState({
    user_id: '', full_name: '', email: '', mobile_number: '',
    designation: '', qualifications: '', documents: [],
    home_address: '', location: '', profile_picture: null,
    gender: '', role: [], experience_level: '',
    willing_to_live_in: false, date_of_birth: '',
    nic_number: '', nic_front: null, nic_back: null,
    staff_code: '', admin_remarks: '', recruiter_id: ''
  });
  const [recruiters, setRecruiters] = useState([]);

  useEffect(() => {
    apiClient.getRecruiters().then(res => setRecruiters(res.data || [])).catch(() => {});
  }, []);

  const [profilePicturePreview, setProfilePicturePreview] = useState('');
  const [nicFrontPreview, setNicFrontPreview] = useState('');
  const [nicBackPreview, setNicBackPreview] = useState('');
  const [gramaNiladhariUrl, setGramaNiladhariUrl] = useState('');
  const [policeReportUrl, setPoliceReportUrl] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [fieldConflicts, setFieldConflicts] = useState({ mobile_number: '', staff_code: '' });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletePasswordError, setDeletePasswordError] = useState('');
  const [deleteConfirmWorker, setDeleteConfirmWorker] = useState(null);

  // Reset back to page 1 whenever the search term changes underneath the current page.
  useEffect(() => { setPage(1); }, [debouncedSearchTerm]);

  useEffect(() => { fetchWorkers(); }, [debouncedSearchTerm, page]);

  const fetchWorkers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.getAllStaff({
        page,
        limit: PAGE_SIZE,
        ...(debouncedSearchTerm ? { search: debouncedSearchTerm } : {}),
      });
      setWorkers(response.data || []);
      setPagination(response.pagination || null);
    } catch (err) {
      setError('Failed to load workers');
    } finally {
      setLoading(false);
    }
  };

  const blankForm = () => ({
    user_id: '', full_name: '', email: '', mobile_number: '',
    designation: '', qualifications: '', documents: [],
    home_address: '', location: '', profile_picture: null,
    gender: '', role: [], experience_level: '',
    willing_to_live_in: false, date_of_birth: '',
    nic_number: '', nic_front: null, nic_back: null,
    staff_code: '', admin_remarks: '', recruiter_id: ''
  });

  const openAdd = () => {
    setFormData(blankForm());
    setProfilePicturePreview('');
    setNicFrontPreview('');
    setNicBackPreview('');
    setGramaNiladhariUrl('');
    setPoliceReportUrl('');
    setFieldConflicts({ mobile_number: '', staff_code: '' });
    setFormError(null);
    setIsEditMode(false);
    setSelectedWorker(null);
    setShowDrawer(true);
  };

  const openEdit = (worker) => {
    setFormData({
      user_id: worker.user_id || '',
      full_name: worker.name || '',
      email: worker.email || '',
      mobile_number: worker.phone || '',
      designation: worker.designation || '',
      qualifications: worker.qualifications || '',
      documents: [],
      home_address: worker.location || '',
      location: worker.location_city || '',
      profile_picture: null,
      gender: worker.gender || '',
      role: parseRoles(worker.role),
      experience_level: worker.experience_level || '',
      willing_to_live_in: worker.willing_to_live_in || false,
      date_of_birth: worker.date_of_birth ? String(worker.date_of_birth).slice(0, 10) : '',
      nic_number: worker.nic_number || '',
      nic_front: null,
      nic_back: null,
      staff_code: worker.staff_code || '',
      admin_remarks: worker.admin_remarks || '',
      grama_niladhari: null,
      police_report: null
    });
    setProfilePicturePreview(worker.profile_picture_url || '');
    setNicFrontPreview(worker.nic_front_url || '');
    setNicBackPreview(worker.nic_back_url || '');
    setGramaNiladhariUrl(worker.grama_niladhari_url || '');
    setPoliceReportUrl(worker.police_report_url || '');
    setFieldConflicts({ mobile_number: '', staff_code: '' });
    setFormError(null);
    setSelectedWorker(worker);
    setIsEditMode(true);
    setShowDrawer(true);
  };

  const closeDrawer = () => {
    setShowDrawer(false);
    setIsEditMode(false);
    setFormError(null);
  };

  const handleProfilePictureChange = (file) => {
    if (!file) return;
    setFormData(p => ({ ...p, profile_picture: file }));
    const reader = new FileReader();
    reader.onloadend = () => setProfilePicturePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleProfilePictureSelect = (file) => { if (file) setProfilePictureToCrop(file); };
  const handleProfilePictureCropComplete = (f) => { setProfilePictureToCrop(null); handleProfilePictureChange(f); };

  const handleNicFrontChange = (file) => {
    if (!file) return;
    setFormData(p => ({ ...p, nic_front: file }));
    const r = new FileReader(); r.onloadend = () => setNicFrontPreview(r.result); r.readAsDataURL(file);
  };
  const handleNicBackChange = (file) => {
    if (!file) return;
    setFormData(p => ({ ...p, nic_back: file }));
    const r = new FileReader(); r.onloadend = () => setNicBackPreview(r.result); r.readAsDataURL(file);
  };

  const handleGramaNiladhariChange = (file) => setFormData(p => ({ ...p, grama_niladhari: file }));
  const handleGramaNiladhariClear = () => setFormData(p => ({ ...p, grama_niladhari: null }));
  const handlePoliceReportChange = (file) => setFormData(p => ({ ...p, police_report: file }));
  const handlePoliceReportClear = () => setFormData(p => ({ ...p, police_report: null }));

  const handleDocumentsChange = (files) => {
    const newDocs = Array.from(files);
    setFormData(p => ({ ...p, documents: [...p.documents, ...newDocs] }));
  };
  const handleDocumentDelete = (name) => {
    setFormData(p => ({ ...p, documents: p.documents.filter(d => d.name !== name) }));
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === 'mobile_number' || name === 'staff_code') setFieldConflicts(p => ({ ...p, [name]: '' }));
    setFormData(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
  };

  const toggleRole = (roleOption) => {
    setFormData(p => {
      const has = (p.role || []).includes(roleOption);
      return { ...p, role: has ? p.role.filter(r => r !== roleOption) : [...(p.role || []), roleOption] };
    });
  };

  const handleMobileBlur = async (value) => {
    if (!value?.trim()) return;
    if (isEditMode && selectedWorker && value.trim() === (selectedWorker.phone || '').trim()) return;
    try {
      const res = await apiClient.checkStaffMobile(value.trim());
      if (!res.available) setFieldConflicts(p => ({ ...p, mobile_number: 'This mobile number is already used by another staff member.' }));
    } catch { }
  };

  const handleStaffCodeBlur = async (value) => {
    if (!value?.trim()) return;
    if (isEditMode && selectedWorker && value.trim().toLowerCase() === (selectedWorker.staff_code || '').trim().toLowerCase()) return;
    try {
      const res = await apiClient.checkStaffCode(value.trim());
      if (!res.available) setFieldConflicts(p => ({ ...p, staff_code: 'This staff code is already assigned to another staff member.' }));
    } catch { }
  };

  const handleDeleteStaff = (workerId) => {
    setDeleteConfirmWorker(workerId);
    setDeletePassword('');
    setDeletePasswordError('');
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (deletePassword !== 'admin@vcare') { setDeletePasswordError('Incorrect admin password'); return; }
    try {
      await apiClient.deleteStaffProfile(deleteConfirmWorker);
      setShowDeleteConfirm(false);
      setDeletePassword('');
      setDeleteConfirmWorker(null);
      fetchWorkers();
    } catch { setError('Failed to delete staff member'); setShowDeleteConfirm(false); }
  };

  const buildFormData = () => {
    const fd = new FormData();
    if (isEditMode && formData.user_id?.trim()) fd.append('user_id', formData.user_id);
    fd.append('full_name', formData.full_name);
    fd.append('email', formData.email);
    fd.append('mobile_number', formData.mobile_number);
    fd.append('designation', formData.designation);
    fd.append('role', formData.role.length > 0 ? formData.role[0] : 'NURSE');
    fd.append('qualifications', formData.qualifications);
    fd.append('home_address', formData.home_address);
    fd.append('location', formData.location);
    fd.append('gender', formData.gender);
    if (formData.experience_level) fd.append('experience_level', formData.experience_level);
    fd.append('willing_to_live_in', formData.willing_to_live_in);
    fd.append('date_of_birth', formData.date_of_birth);
    fd.append('nic_number', formData.nic_number);
    if (formData.staff_code) fd.append('staff_code', formData.staff_code);
    if (formData.admin_remarks) fd.append('admin_remarks', formData.admin_remarks);
    if (!isEditMode && formData.recruiter_id) fd.append('recruiter_id', formData.recruiter_id);
    if (formData.profile_picture) fd.append('profile_picture', formData.profile_picture);
    if (formData.nic_front) fd.append('nic_front', formData.nic_front);
    if (formData.nic_back) fd.append('nic_back', formData.nic_back);
    if (formData.grama_niladhari) fd.append('grama_niladhari', formData.grama_niladhari);
    if (formData.police_report) fd.append('police_report', formData.police_report);
    formData.documents.forEach(doc => fd.append('documents', doc));
    return fd;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);
    try {
      if (!isEditMode) {
        if (!formData.full_name || !formData.mobile_number || !formData.gender || !formData.staff_code || !formData.admin_remarks) {
          setFormError('Please fill in all required fields including Mobile Number, Staff Code, and Admin Remarks.');
          setFormLoading(false);
          return;
        }
      } else {
        if (!formData.full_name || !formData.gender) {
          setFormError('Please fill in all required fields.');
          setFormLoading(false);
          return;
        }
      }
      const fd = buildFormData();
      if (isEditMode && selectedWorker?.id) {
        await apiClient.updateStaffProfile(selectedWorker.id, fd);
      } else {
        await apiClient.createStaffProfile(fd);
      }
      setShowDrawer(false);
      setIsEditMode(false);
      fetchWorkers();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to save staff member.');
    } finally {
      setFormLoading(false);
    }
  };

  const formatStaffData = (staff) => ({
    id: staff.staff_profile_id,
    name: staff.full_name || 'Unknown',
    email: staff.email || '',
    phone: staff.mobile_number || '',
    location: staff.home_address || '',
    status: staff.current_status || '',
    role: staff.role,
    designation: staff.designation || '',
    qualifications: staff.qualifications || '',
    document_urls: staff.document_urls || [],
    profile_picture_url: staff.profile_picture_url || null,
    nic_front_url: staff.nic_front_url || null,
    nic_back_url: staff.nic_back_url || null,
    grama_niladhari_url: staff.grama_niladhari_url || null,
    police_report_url: staff.police_report_url || null,
    gender: staff.gender || '',
    willing_to_live_in: staff.willing_to_live_in || false,
    experience_level: staff.experience_level || '',
    date_of_birth: staff.date_of_birth || null,
    location_city: staff.location || '',
    nic_number: staff.nic_number || '',
    staff_code: staff.staff_code || '',
    admin_remarks: staff.admin_remarks || '',
    user_id: staff.user_id
  });

  const displayData = workers.map(formatStaffData);
  const totalCount = pagination?.total_count ?? displayData.length;
  const totalPages = pagination?.total_pages ?? 1;
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = totalCount === 0 ? 0 : Math.min(page * PAGE_SIZE, totalCount);

  return (
    <AdminLayout
      title="Add Staff"
      subtitle="Manually create and manage staff profiles."
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
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-lg">
          <Shield className="w-3.5 h-3.5 text-emerald-600" />
          <span className="text-xs font-medium text-emerald-700">Proxy Mode</span>
        </div>
        <button
          onClick={() => navigate('/admin/staff-management')}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Exit Proxy
        </button>

        <div className="relative sm:ml-auto">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search by name, phone, code…"
            className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none w-64"
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Staff</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Roles</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="text-center py-16 text-slate-400 text-sm">Loading…</td></tr>
              ) : displayData.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-16 text-slate-400 text-sm">No staff found.</td></tr>
              ) : displayData.map(worker => (
                <tr key={worker.id} className="hover:bg-slate-50 transition-colors">
                  {/* Staff */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5 min-w-[180px]">
                      {worker.profile_picture_url ? (
                        <img src={worker.profile_picture_url} alt={worker.name}
                          className="w-8 h-8 rounded-full object-cover flex-shrink-0 ring-1 ring-slate-200" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 ring-1 ring-slate-200">
                          <UserCircle className="w-5 h-5 text-slate-400" />
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-slate-900 leading-tight">{worker.name}</p>
                        {worker.staff_code && (
                          <p className="text-xs text-slate-400 font-mono">{worker.staff_code}</p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Contact */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="text-slate-700">{worker.phone || '—'}</p>
                    <p className="text-xs text-slate-400">{worker.email || '—'}</p>
                  </td>

                  {/* Roles */}
                  <td className="px-4 py-3">
                    <span className="text-slate-700">{formatRoles(worker.role || worker.designation)}</span>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusDot status={worker.status} />
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        onClick={() => openEdit(worker)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteStaff(worker.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {displayData.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
            <span>
              Showing {rangeStart}-{rangeEnd} of {totalCount} staff member{totalCount !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={!pagination?.has_prev}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              <span className="px-2 tabular-nums">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={!pagination?.has_next}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right Drawer */}
      {showDrawer && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="flex-1 bg-black/30" onClick={closeDrawer} />

          {/* Panel */}
          <div className="w-full max-w-lg bg-white flex flex-col shadow-2xl overflow-hidden">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
              <h2 className="text-sm font-semibold text-slate-900">
                {isEditMode ? 'Edit Staff Member' : 'Add New Staff Member'}
              </h2>
              <button onClick={closeDrawer} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Form */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">

              {formError && (
                <div className="mx-5 mt-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                  {formError}
                </div>
              )}

              {/* Personal Information */}
              <SectionHeader title="Personal Information" />
              <div className="px-5 pt-4 pb-2 grid grid-cols-2 gap-3">
                {isEditMode && (
                  <div className="col-span-2">
                    <Field label="User ID">
                      <input type="text" value={formData.user_id} disabled
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-400" />
                    </Field>
                  </div>
                )}
                <div className="col-span-2">
                  <Field label="Full Name" required>
                    <input type="text" name="full_name" value={formData.full_name} onChange={handleInputChange} required
                      className={inputCls(false)} />
                  </Field>
                </div>
                <Field label="Email (optional)">
                  <input type="email" name="email" value={formData.email} onChange={handleInputChange}
                    className={inputCls(false)} />
                </Field>
                <Field label="Mobile Number" required={!isEditMode} error={fieldConflicts.mobile_number}>
                  <PhoneInput name="mobile_number" value={formData.mobile_number}
                    onChange={handleInputChange} onBlur={() => handleMobileBlur(formData.mobile_number)}
                    required={!isEditMode} className={fieldConflicts.mobile_number ? 'vcare-phone-input--error' : ''} />
                </Field>
                <Field label="Gender" required>
                  <select name="gender" value={formData.gender} onChange={handleInputChange} required className={inputCls(false)}>
                    <option value="">Select</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </Field>
                <Field label="Date of Birth">
                  <DateInput name="date_of_birth"
                    value={formData.date_of_birth}
                    onChange={e => setFormData(p => ({ ...p, date_of_birth: e.target.value }))}
                    max={new Date().toISOString().slice(0, 10)}
                    className={inputCls(false)} />
                </Field>
              </div>

              {/* Role & Experience */}
              <SectionHeader title="Role & Experience" />
              <div className="px-5 pt-4 pb-2 space-y-3">
                <Field label="Designation">
                  <input type="text" name="designation" value={formData.designation} onChange={handleInputChange}
                    className={inputCls(false)} />
                </Field>
                <div>
                  <p className="text-xs font-medium text-slate-600 mb-2">Roles <span className="text-red-500">*</span></p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(ROLE_LABELS).map(([key, label]) => (
                      <button key={key} type="button" onClick={() => toggleRole(key)}
                        className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all text-left ${
                          (formData.role || []).includes(key)
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300 bg-white'
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {formData.role?.length > 0 && (
                    <p className="text-xs text-slate-400 mt-2">Selected: {formData.role.map(r => ROLE_LABELS[r] || r).join(', ')}</p>
                  )}
                </div>
                <Field label="Experience Level">
                  <select name="experience_level" value={formData.experience_level} onChange={handleInputChange} className={inputCls(false)}>
                    <option value="">Not specified</option>
                    {Object.entries(EXP_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Qualifications">
                  <textarea name="qualifications" value={formData.qualifications} onChange={handleInputChange}
                    rows={2} className={`${inputCls(false)} resize-none`} />
                </Field>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="willing_to_live_in" checked={formData.willing_to_live_in}
                    onChange={handleInputChange} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-xs text-slate-700">Willing to live in with clients</span>
                </label>
              </div>

              {/* Location */}
              <SectionHeader title="Location" />
              <div className="px-5 pt-4 pb-2 grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Field label="Home Address">
                    <input type="text" name="home_address" value={formData.home_address} onChange={handleInputChange}
                      className={inputCls(false)} />
                  </Field>
                </div>
                <div className="col-span-2">
                  <Field label="Location / City">
                    <input type="text" name="location" value={formData.location} onChange={handleInputChange}
                      className={inputCls(false)} />
                  </Field>
                </div>
              </div>

              {/* Identity */}
              <SectionHeader title="Identity" />
              <div className="px-5 pt-4 pb-2 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Staff Code" required={!isEditMode} error={fieldConflicts.staff_code}>
                    <input type="text" name="staff_code" value={formData.staff_code}
                      onChange={handleInputChange} onBlur={e => handleStaffCodeBlur(e.target.value)}
                      required={!isEditMode} placeholder="e.g. VC-0042"
                      className={inputCls(!!fieldConflicts.staff_code)} />
                  </Field>
                  <Field label="NIC Number">
                    <input type="text" name="nic_number" value={formData.nic_number} onChange={handleInputChange}
                      placeholder="e.g. 123456789V" className={inputCls(false)} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="NIC Front Photo">
                    {nicFrontPreview
                      ? <ImagePreview src={nicFrontPreview} onDelete={() => { setNicFrontPreview(''); setFormData(p => ({ ...p, nic_front: null })); }}
                          onChangeId="nic-front-change" onChangeHandler={handleNicFrontChange} changeLabel="Change" />
                      : <FileDropZone id="nic-front-upload" label="NIC Front" hint="JPG, PNG" onChange={handleNicFrontChange} />}
                  </Field>
                  <Field label="NIC Back Photo">
                    {nicBackPreview
                      ? <ImagePreview src={nicBackPreview} onDelete={() => { setNicBackPreview(''); setFormData(p => ({ ...p, nic_back: null })); }}
                          onChangeId="nic-back-change" onChangeHandler={handleNicBackChange} changeLabel="Change" />
                      : <FileDropZone id="nic-back-upload" label="NIC Back" hint="JPG, PNG" onChange={handleNicBackChange} />}
                  </Field>
                </div>
              </div>

              {/* Compliance Documents */}
              <SectionHeader title="Compliance Documents" />
              <div className="px-5 pt-4 pb-2 grid grid-cols-2 gap-3">
                <ComplianceDocField
                  label="Grama Niladhari Report"
                  existingUrl={gramaNiladhariUrl}
                  newFile={formData.grama_niladhari}
                  onSelect={handleGramaNiladhariChange}
                  onClear={handleGramaNiladhariClear}
                  inputId="grama-niladhari-upload"
                />
                <ComplianceDocField
                  label="Police Report"
                  existingUrl={policeReportUrl}
                  newFile={formData.police_report}
                  onSelect={handlePoliceReportChange}
                  onClear={handlePoliceReportClear}
                  inputId="police-report-upload"
                />
              </div>

              {/* Media */}
              <SectionHeader title="Profile Picture & Documents" />
              <div className="px-5 pt-4 pb-2 space-y-3">
                <Field label="Profile Picture">
                  {profilePicturePreview
                    ? <ImagePreview src={profilePicturePreview}
                        onDelete={() => { setProfilePicturePreview(''); setFormData(p => ({ ...p, profile_picture: null })); }}
                        onChangeId="profile-change" onChangeHandler={handleProfilePictureSelect} changeLabel="Change" />
                    : <FileDropZone id="profile-upload" label="Click to upload" hint="JPG, PNG (max 2MB)" onChange={handleProfilePictureSelect} />}
                </Field>
                <Field label="Documents">
                  <div>
                    <input type="file" id="docs-upload" className="hidden" multiple
                      onChange={e => { if (e.target.files) handleDocumentsChange(e.target.files); }} />
                    <label htmlFor="docs-upload"
                      className="flex items-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 hover:bg-slate-50 cursor-pointer transition-colors">
                      <Upload className="w-4 h-4 text-slate-400" /> Upload PDF, JPG, PNG
                    </label>
                    {formData.documents.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {formData.documents.map((doc, i) => (
                          <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                              <span className="text-xs text-slate-700 truncate">{doc.name}</span>
                            </div>
                            <button type="button" onClick={() => handleDocumentDelete(doc.name)}
                              className="ml-2 p-0.5 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Field>
              </div>

              {/* Notes */}
              <SectionHeader title="Admin Notes" />
              <div className="px-5 pt-4 pb-6 space-y-3">
                <Field label="Admin Remarks" required={!isEditMode}>
                  <textarea name="admin_remarks" value={formData.admin_remarks} onChange={handleInputChange}
                    required={!isEditMode} rows={3} placeholder="Internal notes about this staff member…"
                    className={`${inputCls(false)} resize-none`} />
                </Field>
                {!isEditMode && (
                  <Field label="Recruiter">
                    <select name="recruiter_id" value={formData.recruiter_id} onChange={handleInputChange}
                      className={inputCls(false)}>
                      <option value="">— None —</option>
                      {recruiters.map(r => (
                        <option key={r.id} value={r.id}>{r.full_name}</option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>
            </form>

            {/* Drawer Footer */}
            <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
              <button type="button" onClick={closeDrawer}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={formLoading || !!fieldConflicts.mobile_number || !!fieldConflicts.staff_code}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {formLoading
                  ? (isEditMode ? 'Updating…' : 'Adding…')
                  : (isEditMode ? 'Update Staff' : 'Add Staff')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl border border-slate-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Delete Staff Profile</h2>
                <p className="text-xs text-slate-500 mt-0.5">This action cannot be undone</p>
              </div>
              <button onClick={() => setShowDeleteConfirm(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-slate-600 mb-3">Enter admin password to confirm deletion:</p>
              <input
                type="password"
                value={deletePassword}
                onChange={e => { setDeletePassword(e.target.value); setDeletePasswordError(''); }}
                onKeyDown={e => { if (e.key === 'Enter') handleConfirmDelete(); }}
                placeholder="Admin password"
                autoFocus
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-red-100 focus:border-red-400"
              />
              {deletePasswordError && <p className="text-xs text-red-600 mt-1.5">{deletePasswordError}</p>}
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleConfirmDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-500 transition-colors">
                Delete
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

export default ProxyUserManagement;
