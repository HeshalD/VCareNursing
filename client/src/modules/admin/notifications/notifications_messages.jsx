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

// Three-position master switch. Its position is derived from the individual message switches:
// none on = Off, every one on = On, otherwise Mixed. Only Off / On are clickable (they set every message).
const TriToggle = ({ state, disabled, onChange }) => {
  const options = [
    { id: 'none', label: 'Off', active: 'bg-slate-500 text-white' },
    { id: 'some', label: 'Mixed', active: 'bg-amber-500 text-white' },
    { id: 'all', label: 'On', active: 'bg-blue-600 text-white' },
  ];
  return (
    <div role="group" className="inline-flex rounded-full bg-slate-100 p-0.5 text-xs font-semibold">
      {options.map(({ id, label, active }) => (
        <button
          key={id}
          type="button"
          aria-pressed={state === id}
          disabled={disabled || id === 'some'}
          onClick={() => id !== 'some' && state !== id && onChange(id === 'all')}
          className={`px-3 py-1 rounded-full transition-colors disabled:cursor-not-allowed ${state === id ? active : 'text-slate-500 hover:text-slate-700 disabled:hover:text-slate-500'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
};

const CHANNELS = [
  { key: 'whatsapp', label: 'WhatsApp messages', icon: MessageCircle, desc: 'Invoices, receipts, OTPs and notifications sent over WhatsApp.' },
  { key: 'sms', label: 'SMS messages', icon: Smartphone, desc: 'OTPs and staff notifications sent by SMS.' },
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

  const save = async (savingId, payload) => {
    setSavingKey(savingId);
    setError('');
    try {
      const res = await apiClient.updateNotificationSettings(payload);
      if (res?.data) setSettings(res.data);
    } catch (err) {
      setError(err?.message || 'Failed to update setting.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleChannelToggle = (channel, value) => save(channel, { channel, enabled: value });
  const handleEventToggle = (eventKey, channel, value) =>
    save(`${eventKey}.${channel}`, { event_key: eventKey, channel, enabled: value });

  // Group the per-message events, keeping the order the backend sends them in.
  const groups = (settings?.events || []).reduce((acc, ev) => {
    let g = acc.find((x) => x.name === ev.group);
    if (!g) acc.push((g = { name: ev.group, events: [] }));
    g.events.push(ev);
    return acc;
  }, []);

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
              Each channel switch reflects the individual message settings below: Off when none are on, On when all are on, Mixed otherwise. Choosing Off or On sets every message on that channel. Changes apply within seconds.
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
                    {savingKey === key && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                    <TriToggle
                      state={settings.channels?.[key] || 'none'}
                      disabled={!canEdit || savingKey !== null}
                      onChange={(v) => handleChannelToggle(key, v)}
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

        {settings && groups.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-200">
              <h3 className="font-bold text-lg text-slate-900">Individual Messages</h3>
              <p className="text-sm text-slate-500 mt-1">
                Choose which messages are sent, per channel. A dash means that message is not sent over that channel.              </p>
            </div>
            {groups.map((group) => (
              <div key={group.name}>
                <div className="px-5 py-2 bg-slate-50 border-y border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{group.name}</span>
                  <span className="hidden sm:flex gap-3 text-xs font-semibold text-slate-400">
                    <span className="w-11 text-center">WhatsApp</span>
                    <span className="w-11 text-center">SMS</span>
                  </span>
                </div>
                <div className="divide-y divide-slate-100">
                  {group.events.map((ev) => (
                    <div key={ev.key} className="px-5 py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 text-sm">{ev.label}</p>
                        <p className="text-xs text-slate-500">{ev.desc}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {[
                          { channel: 'whatsapp', name: 'WhatsApp' },
                          { channel: 'sms', name: 'SMS' },
                        ].map(({ channel, name }) => (
                          <div key={channel} className="w-11 flex flex-col items-center" title={name}>
                            <span className="sm:hidden text-[10px] text-slate-400 mb-0.5">{name}</span>
                            {ev[channel] === null ? (
                              <span className="text-slate-300 h-6 flex items-center">—</span>
                            ) : (
                              <div>
                                <Toggle
                                  checked={!!ev[channel]}
                                  disabled={!canEdit || savingKey !== null}
                                  onChange={(v) => handleEventToggle(ev.key, channel, v)}
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

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
