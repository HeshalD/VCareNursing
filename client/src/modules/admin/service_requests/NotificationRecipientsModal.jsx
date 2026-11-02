import React, { useEffect, useState } from 'react';
import { X, Mail, Plus, Trash2, Loader2, Send } from 'lucide-react';
import apiClient from '../../../api/api';

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

// Who is emailed (with every detail of the request) whenever a client submits a service
// request from the website.
const NotificationRecipientsModal = ({ onClose }) => {
  const [recipients, setRecipients] = useState([]);
  const [max, setMax] = useState(20);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = () =>
    apiClient.getServiceRequestNotificationRecipients()
      .then((res) => { setRecipients(res?.data || []); if (res?.max) setMax(res.max); })
      .catch((err) => setError(err?.message || 'Failed to load the recipients.'))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    if (!email.trim()) return;
    setBusy(true);
    try {
      await apiClient.addServiceRequestNotificationRecipient(email.trim());
      setEmail('');
      await load();
    } catch (err) {
      setError(err?.message || 'Could not add that email.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`Stop sending new-request emails to ${r.email}?`)) return;
    setError(''); setInfo('');
    try {
      await apiClient.removeServiceRequestNotificationRecipient(r.recipient_id);
      await load();
    } catch (err) {
      setError(err?.message || 'Could not remove that email.');
    }
  };

  const sendTest = async () => {
    setError(''); setInfo('');
    setTesting(true);
    try {
      const res = await apiClient.sendServiceRequestNotificationTest();
      setInfo(res?.message || 'Sample email sent.');
    } catch (err) {
      setError(err?.message || 'Could not send the sample email.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
              <Mail className="w-4.5 h-4.5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">New request email alerts</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Everyone below gets an email with all the details each time a client submits a service request on the website.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <form onSubmit={add} className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
            />
            <button
              type="submit"
              disabled={busy || !email.trim() || recipients.length >= max}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
            </button>
          </form>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {info && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</div>}

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>
          ) : recipients.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-600">No one is being notified yet</p>
              <p className="text-xs text-slate-400 mt-1">Add an email above to start receiving new-request alerts.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {recipients.map((r) => (
                <li key={r.recipient_id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{r.email}</p>
                    <p className="text-[11px] text-slate-400">
                      Added {fmt(r.created_at)}{r.added_by_name ? ` by ${r.added_by_name}` : ''}
                    </p>
                  </div>
                  <button onClick={() => remove(r)} title="Remove" className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-slate-400">{recipients.length} of {max} recipients</p>
            <button
              onClick={sendTest}
              disabled={testing || recipients.length === 0}
              title="Emails the most recent request to everyone on this list, so you can see exactly what the alert looks like"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-300 hover:bg-slate-50 rounded-lg disabled:opacity-50"
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send a sample email
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationRecipientsModal;
