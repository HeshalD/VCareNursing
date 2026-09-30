// Client names must always be shown with their honorific (Mr./Mrs./Dr. ...).
// Idempotent: if the name already starts with the honorific it is returned untouched,
// so it is safe to call on values the API has already prefixed.
export const withHonorific = (honorific, name) => {
  if (!name) return name;
  const h = (honorific || '').trim();
  if (!h) return name;
  if (name.trim().toLowerCase().startsWith(h.toLowerCase())) return name;
  return `${h} ${name}`;
};

export const clientDisplayName = (client, fallback = '') => {
  if (!client) return fallback;
  return withHonorific(client.honorific, client.full_name || client.client_name) || fallback;
};
