import React, { useState, useEffect } from 'react';
import {
  User, Building2, Trash2, Edit3, Plus, ClipboardList,
  CheckCircle, Clock, XCircle, ChevronDown, ChevronUp, Send, AlertCircle
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import apiClient from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';
import StaffSidebar from './StaffSidebar';

const REQUEST_TYPE_META = [
  { id: 'PROFILE_UPDATE', icon: User },
  { id: 'BANK_ACCOUNT_ADD', icon: Plus },
  { id: 'BANK_ACCOUNT_EDIT', icon: Edit3 },
  { id: 'BANK_ACCOUNT_REMOVE', icon: Trash2 },
];

const GENDER_OPTIONS = ['MALE', 'FEMALE', 'OTHER'];

const PROFILE_FIELD_META = [
  { key: 'full_name', labelKey: 'fullName', type: 'text' },
  { key: 'home_address', labelKey: 'homeAddress', type: 'textarea' },
  { key: 'location', labelKey: 'location', type: 'text' },
  { key: 'gender', labelKey: 'gender', type: 'select', options: GENDER_OPTIONS },
  { key: 'date_of_birth', labelKey: 'dateOfBirth', type: 'date' },
  { key: 'willing_to_live_in', labelKey: 'willingToLiveIn', type: 'boolean' },
  { key: 'qualifications', labelKey: 'qualifications', type: 'textarea' },
  { key: 'nic_number', labelKey: 'nicNumber', type: 'text' },
];

const STATUS_META = {
  PENDING: { labelKey: 'pending', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock },
  UNDER_REVIEW: { labelKey: 'underReview', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: ClipboardList },
  APPROVED: { labelKey: 'approved', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle },
  REJECTED: { labelKey: 'rejected', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: XCircle },
};

const StatusBadge = ({ status }) => {
  const { t } = useTranslation('staffChangeRequest');
  const cfg = STATUS_META[status] || STATUS_META.PENDING;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {t(`status.${cfg.labelKey}`)}
    </span>
  );
};

const InputField = ({ label, value, onChange, type = 'text', options = [], placeholder = '' }) => {
  const { t } = useTranslation('staffChangeRequest');
  if (type === 'textarea') {
    return (
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</label>
        <textarea
          rows={3}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
        />
      </div>
    );
  }
  if (type === 'select') {
    return (
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</label>
        <div className="relative">
          <select
            value={value}
            onChange={e => onChange(e.target.value)}
            className="w-full appearance-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white pr-8"
          >
            <option value="">{t('selectPlaceholder', { label })}</option>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>
    );
  }
  if (type === 'boolean') {
    return (
      <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        <button
          type="button"
          onClick={() => onChange(!value)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? 'bg-blue-600' : 'bg-slate-200'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>
    );
  }
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  );
};

const PROFILE_FIELD_LABEL_KEYS = Object.fromEntries(PROFILE_FIELD_META.map(f => [f.key, f.labelKey]));

const formatFieldValue = (key, value, t) => {
  if (typeof value === 'boolean') return value ? t('yes') : t('no');
  if (key === 'date_of_birth' && value) return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return String(value);
};

const RequestDetails = ({ req }) => {
  const { t } = useTranslation('staffChangeRequest');
  // Backend stores changes in `requested_changes`
  const changes = req.requested_changes || {};
  const keys = Object.keys(changes);

  if (req.request_type === 'PROFILE_UPDATE') {
    if (keys.length === 0) return <p className="text-xs text-slate-400 italic">{t('requestDetails.noFieldDetails')}</p>;
    // Each value is { old_value, new_value }
    return (
      <div className="space-y-2">
        {keys.map(k => {
          const entry = changes[k];
          const oldVal = entry?.old_value;
          const newVal = entry?.new_value;
          const labelKey = PROFILE_FIELD_LABEL_KEYS[k];
          return (
            <div key={k} className="flex items-start gap-3 text-sm">
              <span className="w-32 flex-shrink-0 text-xs font-semibold text-slate-400 uppercase tracking-wide pt-0.5">
                {labelKey ? t(`profileFields.${labelKey}`) : k}
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="line-through text-slate-400 text-xs">{oldVal != null && oldVal !== '' ? formatFieldValue(k, oldVal, t) : t('requestDetails.empty')}</span>
                <span className="text-slate-300">→</span>
                <span className="text-slate-800 font-medium">{newVal != null && newVal !== '' ? formatFieldValue(k, newVal, t) : t('requestDetails.empty')}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (req.request_type === 'BANK_ACCOUNT_ADD') {
    const fields = [
      { labelKey: 'accountHolder', key: 'account_holder_name' },
      { labelKey: 'bank', key: 'bank_name' },
      { labelKey: 'branch', key: 'branch_name' },
      { labelKey: 'accountNumber', key: 'account_number' },
      { labelKey: 'currency', key: 'currency' },
    ];
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
        {fields.filter(f => changes[f.key]).map(f => (
          <div key={f.key} className="flex flex-col">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t(`requestDetails.bankAddFields.${f.labelKey}`)}</span>
            <span className="text-sm text-slate-800 mt-0.5">{changes[f.key]}</span>
          </div>
        ))}
      </div>
    );
  }

  if (req.request_type === 'BANK_ACCOUNT_EDIT') {
    if (keys.length === 0) return <p className="text-xs text-slate-400 italic">{t('requestDetails.noFieldDetails')}</p>;
    // Each value is { old_value, new_value }
    return (
      <div className="space-y-2">
        {keys.map(k => {
          const entry = changes[k];
          const oldVal = entry?.old_value;
          const newVal = entry?.new_value;
          return (
            <div key={k} className="flex items-start gap-3 text-sm">
              <span className="w-32 flex-shrink-0 text-xs font-semibold text-slate-400 uppercase tracking-wide pt-0.5">
                {k.replace(/_/g, ' ')}
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="line-through text-slate-400 text-xs">{oldVal != null && oldVal !== '' ? oldVal : t('requestDetails.empty')}</span>
                <span className="text-slate-300">→</span>
                <span className="text-slate-800 font-medium">{newVal != null && newVal !== '' ? newVal : t('requestDetails.empty')}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (req.request_type === 'BANK_ACCOUNT_REMOVE') {
    return (
      <p className="text-xs text-slate-600">
        {req.target_bank_account_id
          ? t('requestDetails.removeTextWithId', { id: req.target_bank_account_id })
          : t('requestDetails.removeText')}
      </p>
    );
  }

  return null;
};

const StaffChangeRequestPage = () => {
  const { t } = useTranslation('staffChangeRequest');
  const { user, loading: authLoading } = useAuth();

  const [staffData, setStaffData] = useState(null);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [expandedRequestId, setExpandedRequestId] = useState(null);

  const [requestType, setRequestType] = useState('PROFILE_UPDATE');
  const [profileChanges, setProfileChanges] = useState({});
  const [bankForm, setBankForm] = useState({ account_holder_name: '', bank_name: '', branch_name: '', account_number: '', currency: 'LKR' });
  const [selectedBankAccountId, setSelectedBankAccountId] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const requestTypeTranslations = t('requestTypes', { returnObjects: true });
  const REQUEST_TYPES = REQUEST_TYPE_META.map((meta, i) => ({ ...meta, ...requestTypeTranslations[i] }));

  const PROFILE_FIELDS = PROFILE_FIELD_META.map(f => ({ ...f, label: t(`profileFields.${f.labelKey}`) }));

  useEffect(() => {
    const fetchData = async () => {
      if (authLoading) return;
      const userId = user?.user_id || user?.id;
      if (!userId) { setDataLoading(false); return; }

      try {
        const [staffRes, requestsRes] = await Promise.allSettled([
          apiClient.getStaffByUserID(userId),
          apiClient.getMyChangeRequests(),
        ]);

        if (staffRes.status === 'fulfilled') {
          const data = staffRes.value.data;
          setStaffData(data);

          // Pre-fill profile form with current values
          const prefilled = {};
          PROFILE_FIELDS.forEach(f => {
            if (data[f.key] !== null && data[f.key] !== undefined) {
              prefilled[f.key] = f.type === 'date' && data[f.key]
                ? data[f.key].split('T')[0]
                : data[f.key];
            } else {
              prefilled[f.key] = f.type === 'boolean' ? false : '';
            }
          });
          setProfileChanges(prefilled);

          // Fetch bank accounts for this staff member
          if (data.staff_profile_id) {
            try {
              const bankRes = await apiClient.getStaffBankAccounts(data.staff_profile_id);
              const accounts = bankRes.data || bankRes || [];
              setBankAccounts(Array.isArray(accounts) ? accounts.filter(a => a.is_active) : []);
            } catch {
              setBankAccounts([]);
            }
          }
        }

        if (requestsRes.status === 'fulfilled') {
          setMyRequests(requestsRes.value.data || []);
        }
      } catch (err) {
        console.error('StaffChangeRequestPage fetch error:', err);
      } finally {
        setDataLoading(false);
      }
    };

    fetchData();
  }, [user, authLoading]);

  const handleProfileFieldChange = (key, value) => {
    setProfileChanges(prev => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setBankForm({ account_holder_name: '', bank_name: '', branch_name: '', account_number: '', currency: 'LKR' });
    setSelectedBankAccountId('');
    setSubmitError(null);
  };

  const handleTypeChange = (type) => {
    setRequestType(type);
    resetForm();
    setSubmitSuccess(false);
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    setSubmitting(true);

    try {
      let payload;

      if (requestType === 'PROFILE_UPDATE') {
        // Only send fields that differ from current DB values
        const changes = {};
        PROFILE_FIELDS.forEach(f => {
          const current = staffData?.[f.key];
          const submitted = profileChanges[f.key];
          const currentNorm = f.type === 'date' && current ? current.split('T')[0] : current;
          if (String(submitted) !== String(currentNorm ?? '')) {
            changes[f.key] = submitted;
          }
        });

        if (Object.keys(changes).length === 0) {
          setSubmitError('No changes detected. Please modify at least one field.');
          setSubmitting(false);
          return;
        }
        payload = { request_type: 'PROFILE_UPDATE', changes };

      } else if (requestType === 'BANK_ACCOUNT_ADD') {
        if (!bankForm.account_holder_name || !bankForm.bank_name || !bankForm.account_number) {
          setSubmitError('Account holder name, bank name, and account number are required.');
          setSubmitting(false);
          return;
        }
        payload = { request_type: 'BANK_ACCOUNT_ADD', changes: bankForm };

      } else if (requestType === 'BANK_ACCOUNT_EDIT') {
        if (!selectedBankAccountId) {
          setSubmitError('Please select a bank account to edit.');
          setSubmitting(false);
          return;
        }
        if (!bankForm.account_holder_name && !bankForm.bank_name && !bankForm.account_number && !bankForm.branch_name) {
          setSubmitError('Please fill in at least one field to change.');
          setSubmitting(false);
          return;
        }
        const changes = {};
        Object.entries(bankForm).forEach(([k, v]) => { if (v) changes[k] = v; });
        payload = { request_type: 'BANK_ACCOUNT_EDIT', changes, target_bank_account_id: selectedBankAccountId };

      } else if (requestType === 'BANK_ACCOUNT_REMOVE') {
        if (!selectedBankAccountId) {
          setSubmitError('Please select a bank account to remove.');
          setSubmitting(false);
          return;
        }
        payload = { request_type: 'BANK_ACCOUNT_REMOVE', changes: {}, target_bank_account_id: selectedBankAccountId };
      }

      await apiClient.submitChangeRequest(payload);

      // Refresh request list
      const refreshed = await apiClient.getMyChangeRequests();
      setMyRequests(refreshed.data || []);
      setSubmitSuccess(true);
      resetForm();

    } catch (err) {
      setSubmitError(err.message || 'Failed to submit request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || dataLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600 font-medium">Loading...</div>
      </div>
    );
  }

  const selectedBankAccount = bankAccounts.find(a => a.staff_bank_account_id === selectedBankAccountId);

  return (
    <div className="h-screen bg-slate-50 font-sans flex flex-col md:flex-row text-slate-900 overflow-hidden">
      <StaffSidebar staffProfileId={staffData?.staff_profile_id} title="Request Change" />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 md:px-8 py-6 md:py-8 space-y-6">

          {/* Header */}
          <header className="border-b border-slate-200 bg-white px-6 py-6 rounded-2xl shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 mb-1">Provider Portal</p>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900">Request a Change</h1>
            <p className="text-sm text-slate-500 mt-1.5">
              Submit changes to your profile or bank account details. All requests are reviewed by our team before being applied.
            </p>
          </header>

          {/* Request Type Selector */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {REQUEST_TYPES.map(({ id, label, icon: Icon, description }) => (
              <button
                key={id}
                onClick={() => handleTypeChange(id)}
                className={`flex items-start gap-4 rounded-2xl border p-4 text-left transition-all ${requestType === id
                  ? 'border-blue-500 bg-blue-50 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${requestType === id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className={`text-sm font-semibold ${requestType === id ? 'text-blue-700' : 'text-slate-900'}`}>{label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{description}</p>
                </div>
              </button>
            ))}
          </section>

          {/* Form */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="text-base font-semibold text-slate-900">
                {REQUEST_TYPES.find(t => t.id === requestType)?.label}
              </h2>
            </div>

            <div className="p-6 space-y-4">

              {/* Profile Update Form */}
              {requestType === 'PROFILE_UPDATE' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {PROFILE_FIELDS.map(field => (
                    <div key={field.key} className={field.type === 'textarea' || field.type === 'boolean' ? 'md:col-span-2' : ''}>
                      <InputField
                        label={field.label}
                        type={field.type}
                        options={field.options}
                        value={profileChanges[field.key] ?? (field.type === 'boolean' ? false : '')}
                        onChange={val => handleProfileFieldChange(field.key, val)}
                      />
                    </div>
                  ))}
                  <div className="md:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">
                      To update your profile picture or NIC documents, please contact the admin directly.
                    </p>
                  </div>
                </div>
              )}

              {/* Add Bank Account Form */}
              {requestType === 'BANK_ACCOUNT_ADD' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InputField label="Account Holder Name" value={bankForm.account_holder_name} onChange={v => setBankForm(p => ({ ...p, account_holder_name: v }))} placeholder="Full name on bank account" />
                  <InputField label="Bank Name" value={bankForm.bank_name} onChange={v => setBankForm(p => ({ ...p, bank_name: v }))} placeholder="e.g. Commercial Bank" />
                  <InputField label="Branch Name" value={bankForm.branch_name} onChange={v => setBankForm(p => ({ ...p, branch_name: v }))} placeholder="e.g. Nugegoda Branch" />
                  <InputField label="Account Number" value={bankForm.account_number} onChange={v => setBankForm(p => ({ ...p, account_number: v }))} placeholder="Account number" />
                </div>
              )}

              {/* Edit / Remove Bank Account — account selector */}
              {(requestType === 'BANK_ACCOUNT_EDIT' || requestType === 'BANK_ACCOUNT_REMOVE') && (
                <div className="space-y-4">
                  {bankAccounts.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                      No active bank accounts found on your profile.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Select Bank Account</p>
                      {bankAccounts.map(account => (
                        <button
                          key={account.staff_bank_account_id}
                          onClick={() => setSelectedBankAccountId(account.staff_bank_account_id)}
                          className={`w-full flex items-center gap-4 rounded-xl border p-4 text-left transition-all ${selectedBankAccountId === account.staff_bank_account_id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <Building2 className={`w-5 h-5 flex-shrink-0 ${selectedBankAccountId === account.staff_bank_account_id ? 'text-blue-600' : 'text-slate-400'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900">{account.bank_name}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{account.account_holder_name} · ••••{account.account_number.slice(-4)}{account.branch_name ? ` · ${account.branch_name}` : ''}</p>
                          </div>
                          {selectedBankAccountId === account.staff_bank_account_id && (
                            <CheckCircle className="w-4 h-4 text-blue-600 flex-shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Edit fields — only show once an account is selected */}
                  {requestType === 'BANK_ACCOUNT_EDIT' && selectedBankAccountId && (
                    <div className="border-t border-slate-100 pt-4">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">New Values (leave blank to keep unchanged)</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputField label="Account Holder Name" value={bankForm.account_holder_name} onChange={v => setBankForm(p => ({ ...p, account_holder_name: v }))} placeholder={selectedBankAccount?.account_holder_name || ''} />
                        <InputField label="Bank Name" value={bankForm.bank_name} onChange={v => setBankForm(p => ({ ...p, bank_name: v }))} placeholder={selectedBankAccount?.bank_name || ''} />
                        <InputField label="Branch Name" value={bankForm.branch_name} onChange={v => setBankForm(p => ({ ...p, branch_name: v }))} placeholder={selectedBankAccount?.branch_name || ''} />
                        <InputField label="Account Number" value={bankForm.account_number} onChange={v => setBankForm(p => ({ ...p, account_number: v }))} placeholder={selectedBankAccount?.account_number || ''} />
                      </div>
                    </div>
                  )}

                  {requestType === 'BANK_ACCOUNT_REMOVE' && selectedBankAccountId && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 flex items-start gap-3">
                      <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-rose-700">
                        This will submit a request to deactivate the selected account. It will only be removed after admin approval.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Feedback */}
              {submitError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 flex items-center gap-3">
                  <XCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <p className="text-sm text-rose-700">{submitError}</p>
                </div>
              )}
              {submitSuccess && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <p className="text-sm text-emerald-700">Request submitted successfully. Our team will review it shortly.</p>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="w-4 h-4" />
                  {submitting ? 'Submitting…' : 'Submit Request'}
                </button>
              </div>
            </div>
          </section>

          {/* Request History */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="text-base font-semibold text-slate-900">My Requests</h2>
              <p className="text-xs text-slate-500 mt-0.5">Track the status of your submitted change requests.</p>
            </div>

            {myRequests.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-slate-400">
                No change requests submitted yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {myRequests.map(req => {
                  const isExpanded = expandedRequestId === req.request_id;
                  return (
                    <div key={req.request_id} className="transition-colors">
                      <button
                        onClick={() => setExpandedRequestId(isExpanded ? null : req.request_id)}
                        className="w-full flex flex-col gap-1 px-6 py-4 text-left hover:bg-slate-50 transition-colors sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900">
                            {REQUEST_TYPES.find(t => t.id === req.request_type)?.label || req.request_type}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Submitted {new Date(req.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {req.reviewer_name && ` · Reviewer: ${req.reviewer_name}`}
                          </p>
                          {req.review_notes && (
                            <p className="text-xs text-slate-600 mt-1 italic">"{req.review_notes}"</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <StatusBadge status={req.status} />
                          {isExpanded
                            ? <ChevronUp className="w-4 h-4 text-slate-400" />
                            : <ChevronDown className="w-4 h-4 text-slate-400" />
                          }
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-6 pb-5 pt-1 border-t border-slate-100 bg-slate-50">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Change Details</p>
                          <RequestDetails req={req} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

        </div>
      </main>
    </div>
  );
};

export default StaffChangeRequestPage;
