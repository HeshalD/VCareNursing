// Registry of every outbound WhatsApp / SMS message the system can send.
// Each event can be switched on/off per channel by an admin (Notifications & Messages page),
// on top of the two global channel switches in systemSettings.js.
//
//   whatsapp / sms : whether this event sends over that channel at all
//   templates      : Meta WhatsApp template names that belong to this event, so
//                    metaWhatsapp.sendTemplate can find its event without every caller passing a key
//
// SMS callers and the Twilio WhatsApp helpers pass the event key explicitly (3rd argument).
const EVENTS = [
  // ── Verification codes ──
  { key: 'otp_auth', group: 'Verification codes', label: 'Account verification OTP', desc: 'Sign-up, login and password-reset codes (client / user accounts).', whatsapp: true, sms: true },
  { key: 'otp_staff_applicant', group: 'Verification codes', label: 'Staff applicant OTP', desc: 'Verification code during the staff application.', whatsapp: true, sms: true },
  { key: 'otp_priority_membership', group: 'Verification codes', label: 'Priority membership OTP', desc: 'Verification code when requesting a priority membership.', whatsapp: true, sms: true },

  // ── Client onboarding & requests ──
  { key: 'client_welcome', group: 'Client onboarding & requests', label: 'New client welcome / login details', desc: 'Sent when a client account is created (quotation, booking conversion, walk-in, client page). SMS carries the temporary password.', whatsapp: true, sms: true, templates: ['vcare_client_welcome_new'] },
  { key: 'service_request_confirmed', group: 'Client onboarding & requests', label: 'Service request received', desc: 'Confirmation after a service request is submitted.', whatsapp: true, sms: true, templates: ['vcare_service_request_confirmed'] },
  { key: 'priority_membership_confirmed', group: 'Client onboarding & requests', label: 'Priority membership confirmation', desc: 'Confirmation after a priority membership request.', whatsapp: true, sms: true },
  { key: 'candidate_profile', group: 'Client onboarding & requests', label: 'Suggested candidate profile', desc: 'Staff profile suggested to a client.', whatsapp: true, sms: false, templates: ['vcare_candidate_profile'] },

  // ── Client documents & billing ──
  { key: 'quotation_service', group: 'Client documents & billing', label: 'Service quotation PDF', desc: 'Care / service quotation sent to the client.', whatsapp: true, sms: false, templates: ['vcare_client_quotation'] },
  { key: 'quotation_product', group: 'Client documents & billing', label: 'Product / rental quotation PDF', desc: 'Product or rental quotation sent to the client.', whatsapp: true, sms: false, templates: ['vcare_product_quotation'] },
  { key: 'client_invoice', group: 'Client documents & billing', label: 'Client invoice PDF', desc: 'Invoice sent from invoices, quotes, client page and with receipts.', whatsapp: true, sms: false, templates: ['vcare_client_invoice'] },
  { key: 'payment_receipt', group: 'Client documents & billing', label: 'Payment receipt PDF', desc: 'Official receipt sent when a payment is recorded.', whatsapp: true, sms: false, templates: ['vcare_payment_receipt'] },
  { key: 'booking_statement', group: 'Client documents & billing', label: 'Booking statement PDF', desc: 'Statement of invoiced / paid / balance for a booking.', whatsapp: true, sms: false, templates: ['vcare_client_booking_statement'] },
  { key: 'reg_fee_notice', group: 'Client documents & billing', label: 'Registration fee notice', desc: 'First-touch notice that the registration fee is outstanding.', whatsapp: true, sms: false, templates: ['vcare_reg_fee_notice'] },
  { key: 'reg_fee_invoice', group: 'Client documents & billing', label: 'Registration fee invoice', desc: 'Invoice PDF with bank details and receipt-upload link.', whatsapp: true, sms: false, templates: ['vcare_reg_fee_invoice'] },
  { key: 'review_request', group: 'Client documents & billing', label: 'Review request', desc: 'Asks the client to review a completed booking.', whatsapp: true, sms: false, templates: ['vcare_review_request'] },
  { key: 'payment_recorded', group: 'Client documents & billing', label: 'Payment recorded', desc: 'Short payment-recorded notice (template currently unused).', whatsapp: true, sms: false, templates: ['vcare_payment_recorded'] },

  // ── Staff recruitment ──
  { key: 'staff_application_accepted', group: 'Staff recruitment', label: 'Application accepted / welcome', desc: 'Welcome message when an applicant is accepted.', whatsapp: true, sms: true, templates: ['vcare_staff_welcome_new', 'vcare_staff_welcome_existing'] },
  { key: 'staff_application_rejected', group: 'Staff recruitment', label: 'Application rejected', desc: 'Rejection notice with the reason.', whatsapp: true, sms: true, templates: ['vcare_staff_application_rejected'] },
  { key: 'staff_agreement', group: 'Staff recruitment', label: 'Contractor agreement PDF', desc: 'Independent Contractor Agreement sent to an approved applicant.', whatsapp: true, sms: false, templates: ['vcare_staff_agreement'] },
  { key: 'staff_doc_upload_request', group: 'Staff recruitment', label: 'Document upload request', desc: 'Link to upload Grama Niladhari / Police reports.', whatsapp: true, sms: false, templates: ['vcare_staff_doc_upload_request'] },
  { key: 'staff_account_created', group: 'Staff recruitment', label: 'Staff account created (login details)', desc: 'Temporary credentials sent when an admin creates a staff profile.', whatsapp: true, sms: false, templates: ['vcare_staff_account_created'] },

  // ── Bookings & assignments ──
  { key: 'booking_confirmed', group: 'Bookings & assignments', label: 'Booking confirmed (client)', desc: 'Tells the client which staff member was assigned.', whatsapp: true, sms: true, templates: ['vcare_booking_confirmed'] },
  { key: 'staff_new_assignment', group: 'Bookings & assignments', label: 'New assignment (staff)', desc: 'Sent to staff on assignment, resume-with-staff and swaps.', whatsapp: true, sms: true, templates: ['vcare_staff_new_assignment'] },
  { key: 'staff_swap_outgoing', group: 'Bookings & assignments', label: 'Staff swap – outgoing staff', desc: 'Tells the outgoing staff member who takes over.', whatsapp: false, sms: true },
  { key: 'client_staff_swapped', group: 'Bookings & assignments', label: 'Staff swap – client notice', desc: 'Tells the client their caregiver changed.', whatsapp: true, sms: true, templates: ['vcare_client_staff_swapped'] },
  { key: 'termination_requested', group: 'Bookings & assignments', label: 'Termination requested (client)', desc: 'Acknowledges a client termination request.', whatsapp: true, sms: false, templates: ['vcare_client_termination_requested'] },
  { key: 'termination_rejected', group: 'Bookings & assignments', label: 'Termination rejected (client)', desc: 'Tells the client the request was not approved.', whatsapp: false, sms: true },
  { key: 'termination_approved_client', group: 'Bookings & assignments', label: 'Termination approved (client)', desc: 'Booking ended notice with official end date.', whatsapp: true, sms: true, templates: ['vcare_client_termination_approved'] },
  { key: 'assignment_ended_staff', group: 'Bookings & assignments', label: 'Assignment ended (staff)', desc: 'Sent to staff when an assignment is terminated or completed.', whatsapp: true, sms: true, templates: ['vcare_staff_assignment_terminated'] },
  { key: 'force_terminated_client', group: 'Bookings & assignments', label: 'Booking force-stopped (client)', desc: 'Admin force-stop notice to the client.', whatsapp: true, sms: true, templates: ['vcare_client_force_terminated'] },
  { key: 'force_terminated_staff', group: 'Bookings & assignments', label: 'Booking force-stopped (staff)', desc: 'Admin force-stop notice to the staff member.', whatsapp: true, sms: true, templates: ['vcare_staff_force_terminated'] },

  // ── Staff pay & wallet ──
  { key: 'staff_salary_payout', group: 'Staff pay & wallet', label: 'Salary payout', desc: 'Salary sheet PDF (WhatsApp) and payment summary (SMS).', whatsapp: true, sms: true, templates: ['vcare_staff_salary_sheet_v3'] },
  { key: 'internal_staff_salary', group: 'Staff pay & wallet', label: 'Internal staff payslip', desc: 'Monthly payslip PDF for back-office staff.', whatsapp: true, sms: false, templates: ['vcare_internal_staff_salary_sheet_v1'] },
  { key: 'staff_deduction', group: 'Staff pay & wallet', label: 'Deduction applied', desc: 'Notice when a deduction is applied to a staff member.', whatsapp: true, sms: true, templates: ['vcare_staff_deduction'] },
  { key: 'staff_bonus', group: 'Staff pay & wallet', label: 'Bonus credited', desc: 'Notice when a bonus is credited to a staff member.', whatsapp: true, sms: true, templates: ['vcare_staff_bonus'] },
  { key: 'staff_advance_requested', group: 'Staff pay & wallet', label: 'Advance requested', desc: 'Acknowledges a staff advance request.', whatsapp: true, sms: false, templates: ['vcare_staff_advance_request_sent'] },
  { key: 'staff_advance_approved', group: 'Staff pay & wallet', label: 'Advance approved', desc: 'Advance approved with new wallet balance.', whatsapp: true, sms: true, templates: ['vcare_staff_advance_approved'] },
  { key: 'staff_advance_rejected', group: 'Staff pay & wallet', label: 'Advance rejected', desc: 'Advance rejected with the reason.', whatsapp: true, sms: true, templates: ['vcare_staff_advance_rejected'] },

  // ── Staff leave ──
  { key: 'staff_leave_approved', group: 'Staff leave', label: 'Leave approved', desc: 'Leave request approved.', whatsapp: true, sms: true, templates: ['vcare_leave_approved'] },
  { key: 'staff_leave_rejected', group: 'Staff leave', label: 'Leave rejected', desc: 'Leave request rejected with the reason.', whatsapp: true, sms: true, templates: ['vcare_leave_rejected'] },
];

const EVENT_BY_KEY = Object.fromEntries(EVENTS.map((e) => [e.key, e]));
const EVENT_BY_TEMPLATE = {};
for (const e of EVENTS) for (const t of e.templates || []) EVENT_BY_TEMPLATE[t] = e.key;

const settingKey = (eventKey, channel) => `msg.${eventKey}.${channel}`;

module.exports = { EVENTS, EVENT_BY_KEY, EVENT_BY_TEMPLATE, settingKey };
