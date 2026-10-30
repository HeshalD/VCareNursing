const db = require('../config/db');
const { userHasPermission } = require('../middleware/authMiddleware');

// Admin-wide search. One round trip fans out to a small capped query per entity; every group is
// gated by the same permission as its sidebar page, so search never reveals what the admin can't open.
//
// Shared SQL params for every group query:
//   $1 contains pattern (lowercased, LIKE-escaped)  $2 prefix pattern  $3 exact lowercased term
//   $4 phone-digits pattern (NULL when the term isn't phone-like)       $5 row limit
// Name/code predicates use the exact `lower(COALESCE(col,''))` expression from the trigram
// indexes in migrate.js so Postgres can use them.

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 60;
const GROUP_LIMIT = 5;
const INACTIVE_PENALTY = 10;

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

// Reduces a typed number to the digits that follow the country code / trunk zero, so "0771234567",
// "+94 77 123 4567" and "771234567" all match the digits of a stored E.164 value.
const phoneCore = (term) => {
  const stripped = term.replace(/[\s+\-()]/g, '');
  if (!/^\d{3,}$/.test(stripped)) return null;
  let core = stripped;
  if (core.startsWith('94') && core.length > 9) core = core.slice(2);
  else if (core.startsWith('0')) core = core.slice(1);
  return core.length >= 3 ? core : null;
};

const digitsOf = (col) => `regexp_replace(COALESCE(${col}::text, ''), '\\D', '', 'g')`;
const low = (col) => `lower(COALESCE(${col}::text, ''))`;

// 0 = exact, 1 = prefix, 2 = contains, across the given columns; phone-only hits count as contains.
const rankOf = (cols) =>
  `LEAST(${cols.map((c) => `CASE WHEN ${low(c)} = $3 THEN 0 WHEN ${low(c)} LIKE $2 THEN 1 ELSE 2 END`).join(', ')})`;

const matchAny = (cols, phoneCols = []) => {
  const parts = cols.map((c) => `${low(c)} LIKE $1`);
  phoneCols.forEach((c) => parts.push(`${digitsOf(c)} LIKE $4::text`));
  // Every group query must reference $4 or Postgres can't infer the parameter's type.
  if (!phoneCols.length) parts.push(`($4::text IS NOT NULL AND FALSE)`);
  return `(${parts.join(' OR ')})`;
};

const fmtMoney = (n) => (n === null || n === undefined ? null : `Rs. ${Number(n).toLocaleString('en-LK')}`);
const join = (...parts) => parts.filter(Boolean).join(' · ');
const titleCase = (s) => (s ? String(s).replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : null);

const GROUPS = [
  {
    key: 'clients', label: 'Clients', permission: 'VIEW_USER_MANAGEMENT',
    sql: `SELECT cp.client_profile_id AS id, cp.client_code, cp.full_name, cp.company_name, u.mobile_number, u.is_active,
                 ${rankOf(['cp.client_code', 'cp.full_name', 'cp.company_name'])} AS rank
          FROM client_profiles cp JOIN users u ON u.user_id = cp.user_id
          WHERE ${matchAny(['cp.client_code', 'cp.full_name', 'cp.company_name', 'u.email'], ['u.mobile_number', 'cp.secondary_phone_numbers'])}
          ORDER BY rank, u.is_active DESC, cp.full_name LIMIT $5`,
    map: (r) => ({
      id: r.id, title: r.full_name || r.company_name || r.client_code,
      subtitle: join(r.client_code, r.mobile_number), inactive: r.is_active === false,
      url: `/admin/users/${r.id}/detail`,
    }),
  },
  {
    key: 'staff', label: 'Staff', permission: 'VIEW_USER_MANAGEMENT',
    sql: `SELECT sp.staff_profile_id AS id, sp.staff_code, sp.full_name, sp.designation, sp.nic_number, u.mobile_number, sp.is_active,
                 ${rankOf(['sp.staff_code', 'sp.full_name', 'sp.nic_number'])} AS rank
          FROM staff_profiles sp JOIN users u ON u.user_id = sp.user_id
          WHERE ${matchAny(['sp.staff_code', 'sp.full_name', 'sp.nic_number'], ['u.mobile_number', 'sp.secondary_phone_numbers'])}
          ORDER BY rank, sp.is_active DESC, sp.full_name LIMIT $5`,
    map: (r) => ({
      id: r.id, title: r.full_name || r.staff_code,
      subtitle: join(r.staff_code, titleCase(r.designation), r.mobile_number), inactive: r.is_active === false,
      url: `/admin/staff/${r.id}/v2`,
    }),
  },
  {
    key: 'internal_staff', label: 'Internal staff', permission: 'VIEW_INTERNAL_STAFF',
    sql: `SELECT id, full_name, role, phone, email, status,
                 ${rankOf(['full_name', 'email'])} AS rank
          FROM internal_staff
          WHERE ${matchAny(['full_name', 'email'], ['phone'])}
          ORDER BY rank, full_name LIMIT $5`,
    map: (r) => ({
      id: r.id, title: r.full_name, subtitle: join(titleCase(r.role), r.phone),
      inactive: !!r.status && String(r.status).toUpperCase() !== 'ACTIVE',
      url: `/admin/internal-staff/${r.id}`,
    }),
  },
  {
    key: 'patients', label: 'Care profiles', permission: 'VIEW_PATIENTS',
    sql: `SELECT patient_id AS id, patient_code, full_name, emergency_contact_number,
                 ${rankOf(['patient_code', 'full_name'])} AS rank
          FROM patient_profiles
          WHERE ${matchAny(['patient_code', 'full_name'], ['emergency_contact_number'])}
          ORDER BY rank, full_name LIMIT $5`,
    map: (r) => ({
      id: r.id, title: r.full_name, subtitle: join(r.patient_code, r.emergency_contact_number),
      url: `/admin/patients/${r.id}/detail`,
    }),
  },
  {
    key: 'bookings', label: 'Bookings', permission: 'VIEW_BOOKINGS',
    sql: `SELECT b.booking_id AS id, b.booking_code, b.status, b.service_type,
                 cp.full_name AS client_name, pp.full_name AS patient_name,
                 ${rankOf(['b.booking_code', 'pp.full_name'])} AS rank
          FROM bookings b
          LEFT JOIN client_profiles cp ON cp.client_profile_id = b.client_id
          LEFT JOIN patient_profiles pp ON pp.patient_id = b.patient_id
          WHERE ${matchAny(['b.booking_code', 'pp.full_name'])}
          ORDER BY rank, b.created_at DESC LIMIT $5`,
    map: (r) => ({
      id: r.id, title: r.booking_code || 'Booking',
      subtitle: join(r.patient_name, r.client_name, titleCase(r.service_type)), badge: titleCase(r.status),
      inactive: ['CANCELLED', 'COMPLETED', 'TERMINATED'].includes(String(r.status || '').toUpperCase()),
      url: `/admin/bookings/${r.id}/v2`,
    }),
  },
  {
    key: 'service_requests', label: 'Service requests', permission: 'VIEW_SERVICE_REQUESTS',
    sql: `SELECT request_id AS id, service_request_code, patient_name, payer_mobile, status,
                 ${rankOf(['service_request_code', 'patient_name'])} AS rank
          FROM service_requests
          WHERE ${matchAny(['service_request_code', 'patient_name'], ['payer_mobile'])}
          ORDER BY rank, created_at DESC LIMIT $5`,
    map: (r) => ({
      id: r.id, title: r.service_request_code || 'Service request',
      subtitle: join(r.patient_name, r.payer_mobile), badge: titleCase(r.status),
      inactive: ['REJECTED', 'CANCELLED'].includes(String(r.status || '').toUpperCase()),
      url: `/admin/service-requests/${r.id}/summary`,
    }),
  },
  {
    key: 'quotations', label: 'Quotations', permission: 'VIEW_QUOTATIONS',
    sql: `SELECT q.quote_id AS id, q.estimate_number, q.invoice_code, q.status, q.total_amount, cp.full_name AS client_name,
                 ${rankOf(['q.estimate_number', 'q.invoice_code'])} AS rank
          FROM quotations q
          LEFT JOIN service_requests sr ON sr.request_id = q.request_id
          LEFT JOIN client_profiles cp ON cp.client_profile_id = sr.client_id
          WHERE ${matchAny(['q.estimate_number', 'q.invoice_code'])}
          ORDER BY rank, q.created_at DESC LIMIT $5`,
    map: (r) => ({
      id: r.id, title: r.estimate_number ? `Quotation ${r.estimate_number}` : 'Quotation',
      subtitle: join(r.client_name, fmtMoney(r.total_amount)), badge: titleCase(r.status),
      url: `/admin/quotations/${r.id}`,
    }),
  },
  {
    key: 'invoices', label: 'Invoices', permission: 'VIEW_INVOICES',
    sql: `SELECT i.invoice_id AS id, i.invoice_code, i.status, i.amount, i.category,
                 COALESCE(cp.full_name, wc.full_name) AS customer_name,
                 ${rankOf(['i.invoice_code'])} AS rank
          FROM invoices i
          LEFT JOIN client_profiles cp ON cp.client_profile_id = i.client_id
          LEFT JOIN walk_in_customers wc ON wc.walk_in_customer_id = i.walk_in_customer_id
          WHERE ${matchAny(['i.invoice_code'])}
          ORDER BY rank, i.created_at DESC LIMIT $5`,
    map: (r) => ({
      id: r.id, title: r.invoice_code || 'Invoice',
      subtitle: join(r.customer_name, fmtMoney(r.amount)), badge: titleCase(r.status),
      inactive: String(r.status || '').toUpperCase() === 'VOID',
      url: `/admin/invoices?search=${encodeURIComponent(r.invoice_code || '')}`,
    }),
  },
  {
    key: 'statements', label: 'Statements', permission: 'VIEW_STATEMENTS',
    sql: `SELECT ss.statement_id AS id, ss.statement_code, ss.period_start, ss.period_end, cp.full_name AS client_name,
                 ${rankOf(['ss.statement_code'])} AS rank
          FROM saved_statements ss
          LEFT JOIN client_profiles cp ON cp.client_profile_id = ss.client_id
          WHERE ${matchAny(['ss.statement_code'])}
          ORDER BY rank, ss.created_at DESC LIMIT $5`,
    map: (r) => ({
      id: r.id, title: r.statement_code || 'Statement', subtitle: r.client_name,
      url: `/admin/statements?search=${encodeURIComponent(r.statement_code || '')}`,
    }),
  },
  {
    key: 'transactions', label: 'Transactions', permission: 'VIEW_TRANSACTIONS',
    sql: `SELECT t.transaction_id AS id, t.transaction_code, t.reference_number, t.amount, t.status, cp.full_name AS client_name,
                 ${rankOf(['t.transaction_code', 't.reference_number'])} AS rank
          FROM transactions t
          LEFT JOIN client_profiles cp ON cp.client_profile_id = t.client_id
          WHERE ${matchAny(['t.transaction_code', 't.reference_number'])}
          ORDER BY rank, t.created_at DESC LIMIT $5`,
    map: (r) => ({
      id: r.id, title: r.transaction_code || r.reference_number || 'Transaction',
      subtitle: join(r.reference_number, r.client_name, fmtMoney(r.amount)), badge: titleCase(r.status),
      url: `/admin/transactions?search=${encodeURIComponent(r.transaction_code || r.reference_number || '')}`,
    }),
  },
  {
    key: 'receipts', label: 'Receipts', permission: 'VIEW_USER_MANAGEMENT',
    sql: `SELECT pr.receipt_id AS id, pr.receipt_code, pr.reference_number, pr.total_amount, cp.full_name AS client_name,
                 ${rankOf(['pr.receipt_code', 'pr.reference_number'])} AS rank
          FROM payment_receipts pr
          LEFT JOIN client_profiles cp ON cp.client_profile_id = pr.client_id
          WHERE ${matchAny(['pr.receipt_code', 'pr.reference_number'])}
          ORDER BY rank, pr.created_at DESC LIMIT $5`,
    map: (r) => ({
      id: r.id, title: r.receipt_code || 'Receipt',
      subtitle: join(r.client_name, fmtMoney(r.total_amount)),
      url: `/admin/client-payments?search=${encodeURIComponent(r.receipt_code || '')}`,
    }),
  },
  {
    key: 'vendors', label: 'Vendors', permission: 'VIEW_VENDORS',
    sql: `SELECT vendor_id AS id, name, contact_person, phone, is_active,
                 ${rankOf(['name', 'contact_person'])} AS rank
          FROM vendors
          WHERE ${matchAny(['name', 'contact_person'], ['phone'])}
          ORDER BY rank, is_active DESC, name LIMIT $5`,
    map: (r) => ({
      id: r.id, title: r.name, subtitle: join(r.contact_person, r.phone), inactive: r.is_active === false,
      url: `/admin/vendors?search=${encodeURIComponent(r.name || '')}`,
    }),
  },
  {
    key: 'products', label: 'Products', permission: 'VIEW_PRODUCTS',
    sql: `SELECT product_id AS id, name, price, is_available,
                 ${rankOf(['name'])} AS rank
          FROM products
          WHERE ${matchAny(['name'])}
          ORDER BY rank, is_available DESC, name LIMIT $5`,
    map: (r) => ({
      id: r.id, title: r.name, subtitle: fmtMoney(r.price), inactive: r.is_available === false,
      url: `/admin/products?search=${encodeURIComponent(r.name || '')}`,
    }),
  },
];

// GET /api/admin-search?q=
exports.adminSearch = async (req, res) => {
  const term = String(req.query.q || '').trim().slice(0, MAX_QUERY_LENGTH);
  if (term.length < MIN_QUERY_LENGTH) return res.json({ query: term, groups: [] });

  const lower = term.toLowerCase();
  const core = phoneCore(term);
  const params = [`%${escapeLike(lower)}%`, `${escapeLike(lower)}%`, lower, core ? `%${core}%` : null, GROUP_LIMIT];

  try {
    const allowed = await Promise.all(GROUPS.map((g) => userHasPermission(req.user, g.permission)));
    const settled = await Promise.all(GROUPS.map(async (group, i) => {
      if (!allowed[i]) return null;
      try {
        const { rows } = await db.query(group.sql, params);
        if (!rows.length) return null;
        const items = rows.map((row) => {
          const item = group.map(row);
          return { type: group.key, ...item, rank: Number(row.rank) + (item.inactive ? INACTIVE_PENALTY : 0) };
        }).sort((a, b) => a.rank - b.rank);
        return { key: group.key, label: group.label, bestRank: items[0].rank, items };
      } catch (err) {
        // One broken group must not blank the whole popup.
        console.error(`adminSearch group "${group.key}" failed:`, err.message);
        return null;
      }
    }));

    const groups = settled.filter(Boolean).sort((a, b) => a.bestRank - b.bestRank);
    res.json({ query: term, groups });
  } catch (err) {
    console.error('adminSearch error:', err);
    res.status(500).json({ message: 'Search failed' });
  }
};
