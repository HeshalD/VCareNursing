// Client names on documents (quotations, invoices, receipts, statements) are always shown
// with their honorific (Mr./Mrs./Dr. ...). Mirrors client/src/utils/clientName.js.

// Idempotent: a name that already starts with the honorific is returned untouched.
const withHonorific = (honorific, name) => {
  if (!name) return name;
  const h = String(honorific || '').trim();
  if (!h) return name;
  if (String(name).trim().toLowerCase().startsWith(h.toLowerCase())) return name;
  return `${h} ${name}`;
};

// The name a client is billed under: their company when they chose to be shown by company
// name, otherwise their own name with the honorific. `client` needs honorific, full_name,
// company_name and display_name_source (a client_profiles row).
const billingName = (client) => {
  if (!client) return null;
  if (client.display_name_source === 'COMPANY_NAME' && client.company_name) return client.company_name;
  return withHonorific(client.honorific, client.full_name) || null;
};

module.exports = { withHonorific, billingName };
