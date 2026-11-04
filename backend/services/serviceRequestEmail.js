// services/serviceRequestEmail.js
//
// Emails the configured recipients (admin Service Requests page -> notification settings)
// every time a service request is created (by a client online, or by an internal team
// member), saying who created it. Fire-and-forget: it never
// throws, so a mail problem can never fail the client's submission.

const db = require('../config/db');
const sendEmail = require('../utils/email');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const titleCase = (v) => String(v || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null);
const fmtDateTime = (d) => (d
  ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Colombo' })
  : null);

const adminBaseUrl = () => (process.env.CLIENT_URL || '').split(',')[0].trim().replace(/\/+$/, '');

async function loadRequest(requestId) {
  const res = await db.query(
    `SELECT sr.*,
            cp.client_code,
            sp.full_name AS preferred_staff_name, sp.staff_code AS preferred_staff_code,
            c.name AS city_name, c.district AS city_district,
            sr.gps_coordinates[0] AS gps_lng, sr.gps_coordinates[1] AS gps_lat
     FROM service_requests sr
     LEFT JOIN client_profiles cp ON cp.client_profile_id = sr.client_id
     LEFT JOIN staff_profiles sp ON sp.staff_profile_id = sr.preferred_staff_id
     LEFT JOIN sl_cities c ON c.city_id = sr.city_id
     WHERE sr.request_id = $1`,
    [requestId]
  );
  return res.rows[0] || null;
}

// [section title, [[label, value, optional href], ...]] - empty values are dropped.
// `creator` = { type: 'CLIENT' } (website / client portal, the default) or
// { type: 'STAFF', name } for a request an internal team member entered.
function buildSections(r, creator = { type: 'CLIENT' }) {
  const mapHref = r.gps_lat != null && r.gps_lng != null
    ? `https://www.google.com/maps?q=${r.gps_lat},${r.gps_lng}`
    : null;
  const payerName = [r.honorific, r.payer_name].filter(Boolean).join(' ');

  const sections = [
    ['Request', [
      ['Request code', r.service_request_code],
      ['Created by', creator.type === 'STAFF'
        ? `${creator.name || 'An internal team member'} (internal team member)`
        : 'The client (submitted online)'],
      ['Assignment', creator.type === 'STAFF'
        ? (creator.name ? `Coordinated by ${creator.name}` : null)
        : 'Unassigned service request - no coordinator yet'],
      ['Submitted', fmtDateTime(r.created_at)],
      ['Status', titleCase(r.status)],
      ['Service', titleCase(r.service_type)],
      ['Service model', r.service_model ? titleCase(r.service_model) : null],
      ['Start date', fmtDate(r.start_date)],
      ['Requested end date', fmtDate(r.requested_end_date)],
    ]],
    ['Contact (payer)', [
      ['Name', payerName],
      ['Mobile', r.payer_mobile, r.payer_mobile ? `tel:${r.payer_mobile}` : null],
      ['Email', r.payer_email, r.payer_email ? `mailto:${r.payer_email}` : null],
      ['Client type', r.client_type ? titleCase(r.client_type) : null],
      ['Company', r.company_name],
      ['Gender', r.payer_gender ? titleCase(r.payer_gender) : null],
      ['Existing client', r.client_code ? `Yes (${r.client_code})` : 'No - new / not yet registered'],
    ]],
    ['Patient', [
      ['Name', r.patient_name],
      ['Age', r.patient_age],
      ['Gender', r.gender ? titleCase(r.gender) : null],
      ['Relationship to client', r.relationship_to_client],
      ['Condition', r.patient_condition],
      ['Hospital', r.hospital_name],
    ]],
    ['Location', [
      ['Address', r.location_address],
      ['City', [r.city_name, r.city_district].filter(Boolean).join(', ')],
      ['Map pin', mapHref ? 'Open in Google Maps' : null, mapHref],
    ]],
    ['Preferences', [
      ['Preferred caregiver gender', r.preferred_gender && r.preferred_gender !== 'ANY' ? titleCase(r.preferred_gender) : 'Any'],
      ['Preferred staff member', r.preferred_staff_name ? `${r.preferred_staff_name}${r.preferred_staff_code ? ` (${r.preferred_staff_code})` : ''}` : null],
      ['Emergency contact', [r.emergency_contact_name, r.emergency_contact_number].filter(Boolean).join(' - ')],
      ['Remarks', r.remarks],
    ]],
  ];

  return sections
    .map(([title, rows]) => [title, rows.filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')])
    .filter(([, rows]) => rows.length > 0);
}

function buildEmail(r, creator = { type: 'CLIENT' }) {
  const isStaff = creator.type === 'STAFF';
  const sections = buildSections(r, creator);
  const intro = isStaff
    ? `A new service request was created by ${creator.name || 'an internal team member'} (internal team member).`
    : 'A new service request was submitted by a client online. It is an unassigned service request.';
  const link = adminBaseUrl() ? `${adminBaseUrl()}/admin/service-requests/${r.request_id}/summary` : null;
  const subject = `New service request${r.service_request_code ? ` ${r.service_request_code}` : ''}: ${titleCase(r.service_type) || 'Service'} - ${r.payer_name || 'Unknown client'}`;

  const text = [
    intro,
    '',
    ...sections.flatMap(([title, rows]) => [`${title.toUpperCase()}`, ...rows.map(([l, v, href]) => `  ${l}: ${v}${href && !String(href).startsWith('tel:') && !String(href).startsWith('mailto:') ? ` (${href})` : ''}`), '']),
    link ? `Open in the admin dashboard: ${link}` : '',
  ].join('\n');

  const sectionHtml = sections.map(([title, rows]) => `
    <tr><td colspan="2" style="padding:18px 0 6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#2563eb;border-bottom:1px solid #e2e8f0;">${esc(title)}</td></tr>
    ${rows.map(([label, value, href]) => `
      <tr>
        <td style="padding:7px 12px 7px 0;width:38%;font-size:13px;color:#64748b;vertical-align:top;">${esc(label)}</td>
        <td style="padding:7px 0;font-size:14px;color:#0f172a;vertical-align:top;white-space:pre-line;">${href ? `<a href="${esc(href)}" style="color:#2563eb;text-decoration:none;">${esc(value)}</a>` : esc(value)}</td>
      </tr>`).join('')}`).join('');

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
    <tr><td style="background:#2563eb;padding:20px 24px;">
      <div style="font-size:12px;color:#bfdbfe;letter-spacing:.06em;text-transform:uppercase;">VCare Nursing</div>
      <div style="font-size:20px;font-weight:700;color:#ffffff;margin-top:2px;">New service request</div>
      <div style="font-size:14px;color:#dbeafe;margin-top:4px;">${esc(titleCase(r.service_type) || 'Service')} - ${esc(r.payer_name || '')}</div>
    </td></tr>
    <tr><td style="padding:16px 24px 0;font-size:14px;color:#0f172a;">${esc(intro)}</td></tr>
    <tr><td style="padding:0 24px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${sectionHtml}</table>
      ${link ? `<div style="margin-top:24px;"><a href="${esc(link)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:8px;">Open in admin dashboard</a></div>` : ''}
    </td></tr>
  </table>
  <p style="text-align:center;font-size:11px;color:#94a3b8;margin-top:14px;">Sent automatically whenever a service request is created.</p>
</body></html>`;

  return { subject, text, html };
}

async function getRecipientEmails() {
  const res = await db.query('SELECT email FROM service_request_notification_recipients ORDER BY created_at');
  return res.rows.map((r) => r.email);
}

// Never throws. Safe to call without awaiting.
async function notifyNewServiceRequest(requestId, creator = { type: 'CLIENT' }) {
  try {
    const recipients = await getRecipientEmails();
    if (recipients.length === 0) return { skipped: true, reason: 'No recipients configured' };

    const request = await loadRequest(requestId);
    if (!request) return { skipped: true, reason: 'Service request not found' };

    const { subject, text, html } = buildEmail(request, creator);
    const result = await sendEmail({ email: recipients.join(', '), subject, message: text, html });
    if (result?.skipped) console.warn(`[ServiceRequestEmail] Not sent for ${request.service_request_code || requestId}: ${result.reason || result.error}`);
    return result;
  } catch (err) {
    console.error('[ServiceRequestEmail] Failed (non-fatal):', err.message);
    return { skipped: true, reason: err.message };
  }
}

module.exports = { notifyNewServiceRequest, buildEmail, loadRequest, getRecipientEmails };
