import React, { useEffect, useState } from 'react';
import { X, Loader2, UserCog, Check } from 'lucide-react';
import apiClient from '../../../api/api';

// Pick (or clear) the coordinator a service request is assigned to.
const AssignCoordinatorModal = ({ requestId, currentId, onClose, onSaved }) => {
  const [coordinators, setCoordinators] = useState([]);
  const [selected, setSelected] = useState(currentId || '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    apiClient.getAssignableCoordinators()
      .then((res) => alive && setCoordinators(res?.data || []))
      .catch((err) => alive && setError(err?.message || 'Failed to load the coordinators.'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const save = async () => {
    setError('');
    setSaving(true);
    try {
      const res = await apiClient.assignServiceRequestCoordinator(requestId, selected || null);
      onSaved(res?.data || { coordinator_staff_id: selected || null, coordinator_name: null });
    } catch (err) {
      setError(err?.message || 'Could not change the coordinator.');
    } finally {
      setSaving(false);
    }
  };

  const unchanged = (selected || '') === (currentId || '');
  const Option = ({ value, label, hint }) => (
    <label className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${selected === value ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
      <span className="flex items-center gap-3">
        <input type="radio" name="coordinator" checked={selected === value} onChange={() => setSelected(value)} className="accent-blue-600" />
        <span className="font-medium text-slate-800">{label}</span>
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
      </span>
      {selected === value && <Check className="h-4 w-4 text-blue-600" />}
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100">
              <UserCog className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{currentId ? 'Change coordinator' : 'Assign a coordinator'}</h2>
              <p className="mt-0.5 text-xs text-slate-500">Once assigned, only this coordinator (or an admin) can edit the request.</p>
            </div>
          </div>
          <button onClick={onClose} disabled={saving} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2 px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-blue-600" /></div>
          ) : (
            <>
              {coordinators.length === 0 && <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">No active coordinators found.</p>}
              {coordinators.map((c) => (
                <Option key={c.id} value={c.id} label={c.full_name} hint={c.id === currentId ? 'current' : ''} />
              ))}
              {currentId && <Option value="" label="Unassigned" hint="remove the coordinator" />}
            </>
          )}
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button onClick={onClose} disabled={saving} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
          <button
            onClick={save}
            disabled={saving || loading || unchanged}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssignCoordinatorModal;
