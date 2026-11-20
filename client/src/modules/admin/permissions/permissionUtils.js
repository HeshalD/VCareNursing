// Pure helpers for the permissions UI (no React). Registry shape:
// { [module]: [{ key, label, category: 'page'|'action', entity?, verb? }] }

export const DEFAULT_HIGH_VERBS = ['delete', 'export', 'approve'];

export const isHighVerb = (verb, highVerbs = DEFAULT_HIGH_VERBS) =>
  highVerbs.includes(String(verb || '').toLowerCase());

export const allKeys = (registry) => Object.values(registry).flat().map((p) => p.key);

export const buildIndex = (registry) => {
  const byKey = new Map();
  const viewByEntity = new Map();
  const pageByMod = new Map();
  Object.entries(registry).forEach(([mod, perms]) =>
    perms.forEach((p) => {
      const entity = p.entity || mod;
      const verb = p.verb || p.label;
      byKey.set(p.key, { ...p, mod, entity, verb });
      if (p.category === 'page') {
        if (!pageByMod.has(mod)) pageByMod.set(mod, p.key);
      } else if (/^view$/i.test(verb)) {
        viewByEntity.set(`${mod}||${entity}`, p.key);
      }
    })
  );
  return { byKey, viewByEntity, pageByMod };
};

export const diffSets = (orig, cur) => ({
  added: [...cur].filter((k) => !orig.has(k)),
  removed: [...orig].filter((k) => !cur.has(k)),
});

export const setsEqual = (a, b) => a.size === b.size && [...a].every((k) => b.has(k));

// 'on' | 'off' | 'mixed' across a list of keys (locked keys count as on).
export const triState = (keys, checked) => {
  if (!keys.length) return 'off';
  let n = 0;
  keys.forEach((k) => checked.has(k) && n++);
  return n === 0 ? 'off' : n === keys.length ? 'on' : 'mixed';
};

// What a tri-state click should do. Locked keys are ignored. null = nothing togglable.
export const nextToggle = (keys, checked, locked) => {
  const togglable = keys.filter((k) => !locked?.has(k));
  if (!togglable.length) return null;
  return { keys: togglable, checked: !togglable.every((k) => checked.has(k)) };
};

// Combine incoming keys with the current direct set. Role-locked keys never go in.
export const mergeKeys = (current, keys, mode, locked) => {
  const incoming = keys.filter((k) => !locked?.has(k));
  return mode === 'replace' ? new Set(incoming) : new Set([...current, ...incoming]);
};

export const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || '?';

export const buildModuleModel = (mod, perms) => {
  const pages = perms.filter((p) => p.category === 'page');
  const actions = perms.filter((p) => p.category !== 'page');
  const verbs = [];
  actions.forEach((p) => {
    const v = p.verb || p.label;
    if (!verbs.includes(v)) verbs.push(v);
  });
  const columns = verbs.length ? verbs : ['Access'];
  const rows = [];
  pages.forEach((p) =>
    rows.push({ id: `page:${p.key}`, entity: pages.length > 1 ? p.label : 'Page access', cells: { [columns[0]]: p }, isPage: true })
  );
  const ents = new Map();
  actions.forEach((p) => {
    const e = p.entity || mod;
    const v = p.verb || p.label;
    if (!ents.has(e)) ents.set(e, {});
    if (!ents.get(e)[v]) ents.get(e)[v] = p;
  });
  ents.forEach((cells, e) => rows.push({ id: `e:${e}`, entity: e, cells }));
  return { columns, rows };
};

export const matchesFilter = (perm, filter, { checked, locked, highVerbs }) => {
  switch (filter) {
    case 'enabled': return checked.has(perm.key);
    case 'disabled': return !checked.has(perm.key);
    case 'role': return !!locked?.has(perm.key);
    case 'direct': return checked.has(perm.key) && !locked?.has(perm.key);
    case 'high': return perm.category !== 'page' && isHighVerb(perm.verb || perm.label, highVerbs);
    default: return true;
  }
};

// Work out what a module shows under the current search + filter.
export const analyzeModule = (mod, perms, { search, filter, checked, locked, highVerbs }) => {
  const model = buildModuleModel(mod, perms);
  const q = (search || '').trim().toLowerCase();
  const modHit = !!q && mod.toLowerCase().includes(q);
  const active = !!q || filter !== 'all';
  const cellOk = (perm) => {
    if (!perm) return false;
    const textOk =
      !q ||
      modHit ||
      (perm.entity || '').toLowerCase().includes(q) ||
      (perm.verb || '').toLowerCase().includes(q) ||
      (perm.label || '').toLowerCase().includes(q);
    return textOk && matchesFilter(perm, filter, { checked, locked, highVerbs });
  };
  const rows = model.rows.map((r) => ({
    ...r,
    visible: !active || model.columns.some((c) => cellOk(r.cells[c])),
  }));
  return {
    columns: model.columns,
    rows,
    active,
    q,
    cellOk,
    hasMatch: rows.some((r) => r.visible),
  };
};

export const computeStats = (registry, checked, locked, highVerbs) => {
  const perms = Object.values(registry).flat();
  let enabled = 0;
  let role = 0;
  let high = 0;
  let highTotal = 0;
  perms.forEach((p) => {
    const isHigh = p.category !== 'page' && isHighVerb(p.verb || p.label, highVerbs);
    if (isHigh) highTotal++;
    if (checked.has(p.key)) {
      enabled++;
      if (locked?.has(p.key)) role++;
      if (isHigh) high++;
    }
  });
  return { total: perms.length, enabled, disabled: perms.length - enabled, role, direct: enabled - role, high, highTotal };
};

// If turning `key` on, which prerequisite (View, else page access) is still off?
export const dependencyFor = (key, index, checked) => {
  const p = index.byKey.get(key);
  if (!p || p.category === 'page' || /^view$/i.test(p.verb)) return null;
  const depKey = index.viewByEntity.get(`${p.mod}||${p.entity}`) || index.pageByMod.get(p.mod);
  if (!depKey || checked.has(depKey)) return null;
  return { key: depKey, label: index.byKey.get(depKey)?.entity ? `${index.byKey.get(depKey).entity} · View` : 'View' };
};

export const permLabel = (e) =>
  !e ? '' : e.category === 'page' ? `${e.mod} · Page access` : `${e.entity} · ${e.verb}`;
