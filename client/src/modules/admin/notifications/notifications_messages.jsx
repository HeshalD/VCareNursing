import React, { useEffect, useState } from 'react';
import { Loader2, MessageSquare, Smartphone, MessageCircle } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';

const Toggle = ({ checked, disabled, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${checked ? 'bg-blue-600' : 'bg-slate-300'}`}
  >
    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
  </button>
);

const CHANNELS = [
  { key: 'whatsapp_enabled', label: 'WhatsApp messages', icon: MessageCircle, desc: 'Invoices, receipts, OTPs and notifications sent over WhatsApp.' },
  { key: 'sms_enabled', label: 'SMS messages', icon: Smartphone, desc: 'OTPs and staff advance / leave notifications sent by SMS.' },
];

const NotificationsMessages = () => {
  const { adminToken, hasPermission } = useAdminAuth();
  const canEdit = hasPermission ? hasPermission('NOTIFICATION_SETTINGS_EDIT') : false;
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState(null);

  useEffect(() => {
    if (!adminToken) return;
    apiClient.getNotificationSettings()
      .then(res => setSettings(res?.data || {}))
      .catch(err => setError(err?.message || 'Failed to load settings.'));
  }, [adminToken]);

  const handleToggle = async (key, value) => {
    setSavingKey(key);
    setError('');
    try {
      const res = await apiClient.updateNotificationSettings({ [key]: value });
      setSettings(res?.data || { ...settings, [key]: value });
    } catch (err) {
      setError(err?.message || 'Failed to update setting.');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <AdminLayout
      title="Notifications & Messages"
      subtitle="Control outbound WhatsApp and SMS messages sent by the system."
    >
      <div className="max-w-3xl space-y-6">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h3 className="font-bold text-lg text-slate-900">Message Sending</h3>
            <p className="text-sm text-slate-500 mt-1">
              When a channel is off, messages are skipped and nothing is sent to clients or staff. Changes apply within seconds.
            </p>
          </div>
          {!settings ? (
            <div className="p-10 flex justify-center">
              {error ? null : <Loader2 className="w-5 h-5 animate-spin text-blue-600" />}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {CHANNELS.map(({ key, label, icon: Icon, desc }) => (
                <div key={key} className="p-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 text-slate-400" />
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{label}</p>
                      <p className="text-xs text-slate-500">{desc}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-semibold ${settings[key] ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {settings[key] ? 'On' : 'Off'}
                    </span>
                    {savingKey === key && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                    <Toggle
                      checked={!!settings[key]}
                      disabled={!canEdit || savingKey !== null}
                      onChange={(v) => handleToggle(key, v)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          {settings && !canEdit && (
            <p className="px-5 pb-4 text-xs text-slate-400">You don't have permission to change these switches.</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
          <MessageSquare className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">WhatsApp message log</p>
          <p className="text-xs mt-1">Sent and received WhatsApp messages will appear here soon.</p>
        </div>
      </div>
    </AdminLayout>
  );
};

export default NotificationsMessages;
