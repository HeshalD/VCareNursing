import { formatMobileNumber } from '../../../utils/phoneFormat';

export const CONTACT_LABEL = {
  CLIENT: 'Client',
  STAFF: 'Staff',
  INTERNAL_STAFF: 'Internal staff',
  APPLICANT: 'Applicant',
};

// Where an admin can open the person a conversation is linked to.
export const contactPath = (c) => {
  if (!c?.contact_id) return null;
  switch (c.contact_type) {
    case 'CLIENT': return `/admin/users/${c.contact_id}/detail`;
    case 'STAFF': return `/admin/staff/${c.contact_id}/v2`;
    case 'INTERNAL_STAFF': return `/admin/internal-staff/${c.contact_id}`;
    case 'APPLICANT': return `/admin/workers/${c.contact_id}`;
    default: return null;
  }
};

export const conversationTitle = (c) => c.display_name || c.wa_profile_name || formatMobileNumber(c.phone_e164);

export const initialsOf = (c) => {
  const name = c.display_name || c.wa_profile_name || '';
  const letters = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('');
  return (letters || '#').toUpperCase();
};

const sameDay = (a, b) => a.toDateString() === b.toDateString();

// List rows: time today, "Yesterday", else the date.
export const listTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(d, now)) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

export const clockTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');

export const dayLabel = (iso) => {
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(d, now)) return 'Today';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
};

export const isSameDay = (a, b) => sameDay(new Date(a), new Date(b));

// "3h 12m" until the reply window closes.
export const windowRemaining = (expiresIso) => {
  const ms = new Date(expiresIso).getTime() - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export const fillTemplate = (text, params = []) =>
  String(text || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (m, n) => (params[Number(n) - 1] ? params[Number(n) - 1] : m));

// What to show for a template message: the stored text (admin sends), else rebuilt from the
// approved template definition (automated sends), else just its name.
export const templateText = (msg, templates) => {
  if (msg.body) return msg.body;
  const def = templates?.find((t) => t.name === msg.template_name);
  if (def && Array.isArray(msg.template_params)) return fillTemplate(def.body.text, msg.template_params);
  if (def && msg.template_params === null) return def.body.text.replace(/\{\{\s*\d+\s*\}\}/g, '••••');
  return null;
};
