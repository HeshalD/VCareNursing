import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, Phone, MapPin, Calendar, FileText, Plus, Save, X,
  AlertCircle, CheckCircle, Search, Eye, Shield, Users,
  Heart, Loader2, Check,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

// ─── constants ────────────────────────────────────────────────────────────────

const STATUS_TABS = ['All', 'New Lead', 'Pending', 'Contacted', 'Confirmed', 'Cancelled'];

const TAB_TO_STATUS = {
  'New Lead':  'NEW_LEAD',
  'Pending':   'PENDING',
  'Contacted': 'CONTACTED',
  'Confirmed': 'CONFIRMED',
  'Cancelled': 'CANCELLED',
};

const STATUS_CONFIG = {
  NEW_LEAD:  { dot: 'bg-purple-400', text: 'text-purple-700', label: 'New Lead' },
  PENDING:   { dot: 'bg-amber-400',  text: 'text-amber-700',  label: 'Pending' },
  CONTACTED: { dot: 'bg-blue-400',   text: 'text-blue-700',   label: 'Contacted' },
  CONFIRMED: { dot: 'bg-emerald-500',text: 'text-emerald-700',label: 'Confirmed' },
  CANCELLED: { dot: 'bg-red-400',    text: 'text-red-700',    label: 'Cancelled' },
};

const RELATIONSHIP_OPTIONS = [
  'Parent', 'Child', 'Sibling', 'Spouse / Partner',
  'Guardian', 'Caregiver', 'Friend', 'Neighbor', 'Other',
];

const SERVICE_TYPE_OPTIONS = [
  { value: 'CARETAKER',         label: 'Caretaker' },
  { value: 'NURSING_ASSISTANT', label: 'Nursing Assistant' },
  { value: 'NURSE',             label: 'Professional Nurse' },
  { value: 'PHYSIOTHERAPIST',   label: 'Physiotherapist' },
  { value: 'NANNY',             label: 'Nanny' },
  { value: 'COUNSELLOR',        label: 'Counsellor' },
];

const SERVICE_MODEL_OPTIONS = ['LIVE_IN', 'SHIFT_BASED', 'VISITING'];
const GENDER_OPTIONS        = ['MALE', 'FEMALE', 'ANY'];
const STATUS_OPTIONS        = ['NEW_LEAD', 'PENDING', 'CONTACTED', 'CONFIRMED', 'CANCELLED'];

const BLANK_FORM = {
  payer_name: '', payer_mobile: '', patient_name: '', patient_age: '',
  relationship_to_client: '', patient_condition: '', service_type: '',
  service_model: 'SHIFT_BASED', location_address: '', start_date: '',
  remarks: '', preferred_gender: 'ANY', status: 'NEW_LEAD',
};

// ─── helpers ──────────────────────────────────────────────────────────────────

const StatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || { dot: 'bg-slate-400', text: 'text-slate-600', label: status?.replace(/_/g, ' ') || '—' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

const formatDate = (v) =>
  v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const formatDateTime = (v) =>
  v ? new Date(v).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

const modelLabel = (v) => v?.replace(/_/g, ' ') ?? '—';

const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400 bg-white';
const labelCls = 'block text-xs font-medium text-slate-600 mb-1.5';

// ─── Add Request Drawer ───────────────────────────────────────────────────────

// `presetClient` — when the caller already knows which client this request is
// for (e.g. from that client's own detail page), pass { client_profile_id,
// full_name, mobile_number } to skip the client-search step entirely and go
// straight to care profile / service details.
export function AddRequestDrawer({ open, onClose, onSuccess, presetClient = null }) {
  const [formData, setFormData]                       = useState(BLANK_FORM);
  const [formLoading, setFormLoading]                 = useState(false);
  const [error, setError]                             = useState(null);
  const [success, setSuccess]                         = useState(null);

  const [clients, setClients]                         = useState([]);
  const [clientsLoading, setClientsLoading]           = useState(false);
  const [clientSearch, setClientSearch]               = useState('');
  const [selectedClient, setSelectedClient]           = useState(null);
  const [careProfiles, setCareProfiles]               = useState([]);
  const [careProfilesLoading, setCareProfilesLoading] = useState(false);
  const [selectedCareProfile, setSelectedCareProfile] = useState(null);

  useEffect(() => {
    if (open) {
      if (presetClient) {
        handleSelectClient(presetClient);
      } else {
        fetchClients();
      }
    } else {
      // reset on close
      setFormData(BLANK_FORM);
      setSelectedClient(null);
      setSelectedCareProfile(null);
      setCareProfiles([]);
      setClientSearch('');
      setError(null);
      setSuccess(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fetchClients = async () => {
    try {
      setClientsLoading(true);
      const res = await apiClient.getAllClients();
      setClients(res.data || []);
    } catch { /* non-fatal */ } finally {
      setClientsLoading(false);
    }
  };

  const fetchCareProfiles = async (clientId) => {
    try {
      setCareProfilesLoading(true);
      const res = await apiClient.getPatientsByClient(clientId);
      setCareProfiles(res.data || []);
    } catch { setCareProfiles([]); } finally {
      setCareProfilesLoading(false);
    }
  };

  const handleSelectClient = (client) => {
    setSelectedClient(client);
    setSelectedCareProfile(null);
    setCareProfiles([]);
    setFormData(prev => ({
      ...prev,
      payer_name: client.full_name || '',
      payer_mobile: client.mobile_number || '',
      patient_name: '', patient_age: '', relationship_to_client: '',
      patient_condition: '', location_address: '',
    }));
    fetchCareProfiles(client.client_profile_id);
  };

  const handleDeselectClient = () => {
    setSelectedClient(null);
    setSelectedCareProfile(null);
    setCareProfiles([]);
    setFormData(prev => ({
      ...prev,
      payer_name: '', payer_mobile: '', patient_name: '', patient_age: '',
      relationship_to_client: '', patient_condition: '', location_address: '',
    }));
  };

  const handleSelectCareProfile = (profile) => {
    setSelectedCareProfile(profile);
    setFormData(prev => ({
      ...prev,
      patient_name: profile.full_name || '',
      patient_age: profile.age?.toString() || '',
      relationship_to_client: profile.relationship_to_client || '',
      patient_condition: profile.medical_condition || '',
      location_address: profile.residential_address || '',
    }));
  };

  const handleDeselectCareProfile = () => {
    setSelectedCareProfile(null);
    setFormData(prev => ({
      ...prev,
      patient_name: '', patient_age: '', relationship_to_client: '',
      patient_condition: '', location_address: '',
    }));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (error) setError(null);
    if (success) setSuccess(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setError(null);
    setSuccess(null);
    try {
      if (!selectedClient) { setError('Please select a client before submitting.'); setFormLoading(false); return; }
      const missing = ['payer_name', 'payer_mobile', 'patient_name', 'patient_age', 'service_type'].filter(f => !formData[f]);
      if (missing.length) { setError(`Please fill in: ${missing.join(', ')}`); setFormLoading(false); return; }
      if (isNaN(formData.patient_age) || formData.patient_age <= 0) { setError('Age must be a positive number.'); setFormLoading(false); return; }
      if (!/^[0-9]{10}$/.test(formData.payer_mobile.replace(/\s/g, ''))) { setError('Enter a valid 10-digit mobile number.'); setFormLoading(false); return; }

      await apiClient.createProxyServiceRequest({
        ...formData,
        patient_age: parseInt(formData.patient_age),
        client_id: selectedClient.client_profile_id,
        patient_id: selectedCareProfile?.patient_id || null,
      });
      setSuccess('Service request created successfully!');
      setTimeout(() => { onClose(); onSuccess(); }, 1500);
    } catch (err) {
      setError(err.message || 'Failed to create service request.');
    } finally {
      setFormLoading(false);
    }
  };

  const filteredClients = clients.filter(c =>
    c.full_name?.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.mobile_number?.includes(clientSearch)
  );
  const visibleClients = clientSearch.trim() ? filteredClients : filteredClients.slice(0, 4);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-white shadow-2xl">

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="text-[15px] font-semibold text-slate-900">
              {presetClient ? 'New Service Request' : 'New Proxy Service Request'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {presetClient ? `For ${presetClient.full_name}` : 'Create a request on behalf of a registered client'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <form id="proxy-request-form" onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

            {error && (
              <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}
            {success && (
              <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                {success}
              </div>
            )}

            {/* ── Step 1 — Select Client (skipped when the client is already known) ── */}
            {!presetClient && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${selectedClient ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white'}`}>
                  {selectedClient ? <Check className="w-3.5 h-3.5" /> : '1'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm">Select Client (Payer)</p>
                  <p className="text-xs text-slate-500">Choose the registered client paying for this service</p>
                </div>
                {selectedClient && (
                  <div className="flex items-center gap-2 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <span className="text-xs font-medium text-emerald-700 truncate max-w-[160px]">{selectedClient.full_name}</span>
                    <button type="button" onClick={handleDeselectClient} className="text-emerald-500 hover:text-emerald-700">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {!selectedClient && (
                <div className="p-4">
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search clients by name or phone…"
                      value={clientSearch}
                      onChange={e => setClientSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {clientsLoading ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                    </div>
                  ) : filteredClients.length === 0 ? (
                    <div className="text-center py-6 text-slate-400">
                      <Users className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                      <p className="text-sm">No clients found</p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        {visibleClients.map(client => (
                          <button
                            key={client.client_profile_id}
                            type="button"
                            onClick={() => handleSelectClient(client)}
                            className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all text-left group"
                          >
                            <div className="w-8 h-8 rounded-full bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center flex-shrink-0 transition-colors">
                              <User className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 truncate">{client.full_name}</p>
                              <div className="flex items-center gap-1 text-slate-400 mt-0.5">
                                <Phone className="w-3 h-3" />
                                <span className="text-xs">{client.mobile_number}</span>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                      {!clientSearch.trim() && filteredClients.length > 4 && (
                        <p className="text-xs text-slate-400 text-center mt-2">
                          Showing 4 of {filteredClients.length} — search to find a specific client
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            )}

            {/* ── Step 2 — Select Care Profile ── */}
            {selectedClient && (
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${selectedCareProfile ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white'}`}>
                    {selectedCareProfile ? <Check className="w-3.5 h-3.5" /> : (presetClient ? '1' : '2')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm">Select Care Profile</p>
                    <p className="text-xs text-slate-500">Choose a profile or fill in manually below</p>
                  </div>
                  {selectedCareProfile && (
                    <div className="flex items-center gap-2 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <span className="text-xs font-medium text-emerald-700 truncate max-w-[160px]">{selectedCareProfile.full_name}</span>
                      <button type="button" onClick={handleDeselectCareProfile} className="text-emerald-500 hover:text-emerald-700">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="p-4">
                  {careProfilesLoading ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                    </div>
                  ) : careProfiles.length === 0 ? (
                    <div className="text-center py-4 text-slate-400">
                      <Heart className="w-7 h-7 mx-auto mb-2 text-slate-200" />
                      <p className="text-sm font-medium">No care profiles for this client</p>
                      <p className="text-xs mt-0.5">Fill in the details manually in the next step</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {careProfiles.map(profile => {
                        const isSelected = selectedCareProfile?.patient_id === profile.patient_id;
                        return (
                          <button
                            key={profile.patient_id}
                            type="button"
                            onClick={() => handleSelectCareProfile(profile)}
                            className={`flex items-start gap-3 p-3 border rounded-xl transition-all text-left ${
                              isSelected
                                ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-100'
                                : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-blue-100' : 'bg-slate-100'}`}>
                              <Heart className={`w-4 h-4 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm font-semibold ${isSelected ? 'text-blue-900' : 'text-slate-900'}`}>{profile.full_name}</p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {[profile.age && `Age ${profile.age}`, profile.relationship_to_client].filter(Boolean).join(' · ')}
                              </p>
                              {profile.medical_condition && (
                                <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{profile.medical_condition}</p>
                              )}
                            </div>
                            {isSelected && <Check className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Step 3 — Service Details ── */}
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50">
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">{presetClient ? '2' : '3'}</div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">Service Details</p>
                  <p className="text-xs text-slate-500">Review auto-filled info and configure the service</p>
                </div>
              </div>

              <div className="p-4 space-y-5">

                {/* Payer */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Payer Information</p>
                    {selectedClient && <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100 font-medium">Auto-filled</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Payer Name <span className="text-red-500">*</span></label>
                      <input type="text" name="payer_name" value={formData.payer_name} onChange={handleInputChange} className={inputCls} placeholder="Payer's full name" />
                    </div>
                    <div>
                      <label className={labelCls}>Mobile Number <span className="text-red-500">*</span></label>
                      <input type="tel" name="payer_mobile" value={formData.payer_mobile} onChange={handleInputChange} className={inputCls} placeholder="10-digit mobile number" />
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-100" />

                {/* Care Profile */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Care Profile</p>
                    {selectedCareProfile && <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100 font-medium">Auto-filled</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Full Name <span className="text-red-500">*</span></label>
                      <input type="text" name="patient_name" value={formData.patient_name} onChange={handleInputChange} className={inputCls} placeholder="Care recipient's name" />
                    </div>
                    <div>
                      <label className={labelCls}>Age <span className="text-red-500">*</span></label>
                      <input type="number" name="patient_age" value={formData.patient_age} onChange={handleInputChange} className={inputCls} placeholder="Age" min="1" />
                    </div>
                    <div>
                      <label className={labelCls}>Relationship to Client</label>
                      <select name="relationship_to_client" value={formData.relationship_to_client} onChange={handleInputChange} className={inputCls}>
                        <option value="">— Select —</option>
                        {RELATIONSHIP_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Medical Condition</label>
                      <input type="text" name="patient_condition" value={formData.patient_condition} onChange={handleInputChange} className={inputCls} placeholder="Condition or care needs" />
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-100" />

                {/* Service config */}
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Service Configuration</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Service Role <span className="text-red-500">*</span></label>
                      <select name="service_type" value={formData.service_type} onChange={handleInputChange} className={inputCls} required>
                        <option value="">— Select role —</option>
                        {SERVICE_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Service Model</label>
                      <select name="service_model" value={formData.service_model} onChange={handleInputChange} className={inputCls}>
                        {SERVICE_MODEL_OPTIONS.map(o => <option key={o} value={o}>{modelLabel(o)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Preferred Staff Gender</label>
                      <select name="preferred_gender" value={formData.preferred_gender} onChange={handleInputChange} className={inputCls}>
                        {GENDER_OPTIONS.map(o => <option key={o} value={o}>{o.charAt(0) + o.slice(1).toLowerCase()}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Initial Status</label>
                      <select name="status" value={formData.status} onChange={handleInputChange} className={inputCls}>
                        {STATUS_OPTIONS.map(o => <option key={o} value={o}>{STATUS_CONFIG[o]?.label ?? o}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-100" />

                {/* Location & schedule */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Location & Schedule</p>
                    {selectedCareProfile?.residential_address && (
                      <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100 font-medium">Auto-filled</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className={labelCls}>Service Address</label>
                      <textarea name="location_address" value={formData.location_address} onChange={handleInputChange} rows={2} className={inputCls} placeholder="Full service address" />
                    </div>
                    <div>
                      <label className={labelCls}>Preferred Start Date</label>
                      <input type="date" name="start_date" value={formData.start_date} onChange={handleInputChange} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Additional Remarks</label>
                      <textarea name="remarks" value={formData.remarks} onChange={handleInputChange} rows={2} className={inputCls} placeholder="Special requirements or notes" />
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 flex gap-3 border-t border-slate-200 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={formLoading}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={formLoading}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {formLoading
                ? <><Loader2 className="w-4 h-4 animate-spin" />Creating…</>
                : <><Save className="w-4 h-4" />Create Request</>
              }
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const ProxyServiceRequest = () => {
  const navigate = useNavigate();

  const [serviceRequests, setServiceRequests] = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [search, setSearch]                   = useState('');
  const [activeTab, setActiveTab]             = useState('All');
  const [showDrawer, setShowDrawer]           = useState(false);

  useEffect(() => { fetchServiceRequests(); }, []);

  const fetchServiceRequests = async () => {
    try {
      setLoading(true);
      const res = await apiClient.getAllServiceRequests();
      setServiceRequests(res.data || []);
    } catch { /* non-fatal */ } finally {
      setLoading(false);
    }
  };

  const filtered = serviceRequests.filter(r => {
    const statusMatch = activeTab === 'All' || r.status === TAB_TO_STATUS[activeTab];
    const q = search.trim().toLowerCase();
    const textMatch = !q || [r.payer_name, r.patient_name, r.payer_mobile, r.service_type]
      .some(v => v?.toLowerCase().includes(q));
    return statusMatch && textMatch;
  });

  const counts = {
    All: serviceRequests.length,
    ...Object.fromEntries(
      STATUS_TABS.filter(t => t !== 'All').map(tab => [
        tab,
        serviceRequests.filter(r => r.status === TAB_TO_STATUS[tab]).length,
      ])
    ),
  };

  if (loading) {
    return (
      <AdminLayout title="Service Requests" subtitle="Loading…">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Service Requests"
      subtitle={`${serviceRequests.length} total request${serviceRequests.length !== 1 ? 's' : ''}`}
      actions={
        <div className="flex items-center gap-2">
          {/* Proxy toggle — always ON on this page */}
          <div className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 bg-white rounded-lg">
            <Shield className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-700">Proxy Mode</span>
            <button
              type="button"
              onClick={() => navigate('/admin/service-requests')}
              role="switch"
              aria-checked={true}
              className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-emerald-500 transition-colors duration-200 ease-in-out focus:outline-none"
            >
              <span className="pointer-events-none inline-block h-4 w-4 translate-x-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out" />
            </button>
          </div>
          <button
            onClick={() => setShowDrawer(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Request
          </button>
        </div>
      }
    >
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-1 w-fit flex-wrap">
          {STATUS_TABS.map(tab => (
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
            placeholder="Search by name, phone, service…"
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
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Client / Payer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Care Profile</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Service</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Location</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Start Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="w-8 h-8 text-slate-200" />
                      <p className="text-sm text-slate-400">No service requests match your filters.</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.map(r => (
                <tr key={r.request_id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 align-top">
                    <p className="font-semibold text-slate-900 leading-tight">{r.payer_name}</p>
                    <div className="flex items-center gap-1 mt-0.5 text-slate-500 text-xs">
                      <Phone className="w-3 h-3" />
                      <span>{r.payer_mobile}</span>
                    </div>
                    {r.service_request_code && (
                      <p className="text-xs text-slate-400 font-mono mt-0.5">{r.service_request_code}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-0.5">{formatDateTime(r.created_at)}</p>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <p className="font-medium text-slate-900">{r.patient_name || '—'}</p>
                    {(r.patient_age || r.relationship_to_client) && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        {[r.patient_age && `Age ${r.patient_age}`, r.relationship_to_client].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {r.patient_condition && (
                      <p className="text-xs text-slate-400 mt-0.5 max-w-[160px] truncate">{r.patient_condition}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <p className="font-medium text-slate-900">
                      {SERVICE_TYPE_OPTIONS.find(o => o.value === r.service_type)?.label ?? r.service_type ?? '—'}
                    </p>
                    {r.service_model && (
                      <p className="text-xs text-slate-500 mt-0.5">{modelLabel(r.service_model)}</p>
                    )}
                    {r.preferred_gender && r.preferred_gender !== 'ANY' && (
                      <p className="text-xs text-slate-400 mt-0.5">Prefers {r.preferred_gender.toLowerCase()}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top max-w-[180px]">
                    <div className="flex items-start gap-1 text-slate-600">
                      <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0 text-slate-400" />
                      <span className="text-xs line-clamp-2">{r.location_address || '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top whitespace-nowrap">
                    <div className="flex items-center gap-1 text-slate-600 text-xs">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span>{formatDate(r.start_date)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <button
                      onClick={() => navigate(`/admin/service-requests/${r.request_id}/summary`)}
                      title="View Summary"
                      className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-blue-600 transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
            Showing {filtered.length} of {serviceRequests.length} request{serviceRequests.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Add Request Drawer */}
      <AddRequestDrawer
        open={showDrawer}
        onClose={() => setShowDrawer(false)}
        onSuccess={fetchServiceRequests}
      />

    </AdminLayout>
  );
};

export default ProxyServiceRequest;
