import React, { useEffect, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import apiClient from '../../../api/api';

const PATIENT_RELATIONSHIP_OPTIONS = [
  'Parent', 'Child', 'Sibling', 'Spouse / Partner',
  'Guardian', 'Caregiver', 'Friend', 'Neighbor', 'Other',
];

const serializeEmergencyContacts = (contacts) => ({
  emergency_contact_name: contacts.map(c => c.name).join(' | '),
  emergency_contact_number: contacts.map(c => c.number).join(' | '),
});

const emptyForm = {
  full_name: '',
  age: '',
  gender: '',
  relationship_to_client: '',
  medical_condition: '',
  residential_address: '',
  emergency_contacts: [{ name: '', number: '' }],
};

const inputCls  = 'w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const selectCls = `${inputCls} bg-white`;
const labelCls  = 'mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-400';

export default function AddCareProfileDrawer({ open, clientProfileId, onClose, onSuccess }) {
  const [form, setForm]         = useState(emptyForm);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    if (!open) {
      setForm(emptyForm);
      setError('');
    }
  }, [open]);

  const updateField = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const updateContact = (idx, key, value) =>
    setForm(f => ({
      ...f,
      emergency_contacts: f.emergency_contacts.map((c, i) => i === idx ? { ...c, [key]: value } : c),
    }));

  const addContact = () =>
    setForm(f => ({ ...f, emergency_contacts: [...f.emergency_contacts, { name: '', number: '' }] }));

  const removeContact = (idx) =>
    setForm(f => ({ ...f, emergency_contacts: f.emergency_contacts.filter((_, i) => i !== idx) }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim()) {
      setError('Care profile name is required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { emergency_contacts, ...rest } = form;
      const serialized = serializeEmergencyContacts(emergency_contacts);
      await apiClient.createPatient({
        ...rest,
        ...serialized,
        age: rest.age ? parseInt(rest.age, 10) : null,
        client_id: clientProfileId,
      });
      onClose();
      onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to add care profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl">

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h3 className="text-[15px] font-semibold text-gray-900">Add New Care Profile</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <form id="add-care-profile-form" onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

            {error && (
              <div className="rounded-md bg-red-50 px-4 py-3 text-sm font-medium text-red-700 border border-red-200">
                {error}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelCls}>Full Name *</label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={e => updateField('full_name', e.target.value)}
                  className={inputCls}
                  placeholder="e.g. Saman Kumara"
                  required
                />
              </div>

              <div>
                <label className={labelCls}>Age</label>
                <input
                  type="number"
                  value={form.age}
                  onChange={e => updateField('age', e.target.value)}
                  className={inputCls}
                  placeholder="e.g. 65"
                  min="0"
                />
              </div>

              <div>
                <label className={labelCls}>Gender</label>
                <select
                  value={form.gender}
                  onChange={e => updateField('gender', e.target.value)}
                  className={selectCls}
                >
                  <option value="">— Select —</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className={labelCls}>Relationship with Client</label>
                <select
                  value={form.relationship_to_client}
                  onChange={e => updateField('relationship_to_client', e.target.value)}
                  className={selectCls}
                >
                  <option value="">— Select —</option>
                  {PATIENT_RELATIONSHIP_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className={labelCls}>Medical Condition / Remarks</label>
                <textarea
                  value={form.medical_condition}
                  onChange={e => updateField('medical_condition', e.target.value)}
                  className={inputCls}
                  rows={2}
                  placeholder="Describe the condition or any special remarks"
                />
              </div>

              <div className="sm:col-span-2">
                <label className={labelCls}>Residential Address</label>
                <input
                  type="text"
                  value={form.residential_address}
                  onChange={e => updateField('residential_address', e.target.value)}
                  className={inputCls}
                  placeholder="e.g. 45/A, Galle Road, Dehiwala, Colombo"
                />
              </div>

              <div className="sm:col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Emergency Contacts
                  </label>
                  <button
                    type="button"
                    onClick={addContact}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                  >
                    + Add Contact
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {form.emergency_contacts.map((contact, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                      <input
                        type="text"
                        value={contact.name}
                        onChange={e => updateContact(idx, 'name', e.target.value)}
                        className="rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        placeholder="e.g. Nimal Perera"
                      />
                      <input
                        type="tel"
                        value={contact.number}
                        onChange={e => updateContact(idx, 'number', e.target.value)}
                        className="rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        placeholder="e.g. 077 123 4567"
                      />
                      {form.emergency_contacts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeContact(idx)}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-500 hover:bg-red-100"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 flex gap-3 border-t border-gray-200 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {loading ? 'Adding...' : 'Add Care Profile'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
