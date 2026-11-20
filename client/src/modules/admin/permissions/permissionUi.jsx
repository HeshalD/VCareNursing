import React, { useEffect, useMemo, useState } from 'react';
import { Search, Loader2, AlertTriangle, X, Zap } from 'lucide-react';
import PermissionModuleList, { moduleDomId } from './PermissionModuleList';
import {
  DEFAULT_HIGH_VERBS,
  analyzeModule,
  computeStats,
  diffSets,
  initials,
  isHighVerb,
  mergeKeys,
  permLabel,
} from './permissionUtils';

const AVATAR_COLOR = 'bg-slate-200 text-slate-700';

export const Avatar = ({ name, size = 'sm' }) => {
  const dim = size === 'lg' ? 'h-14 w-14 text-lg' : 'h-9 w-9 text-xs';
  return (
    <span className={`${dim} shrink-0 rounded-full font-bold flex items-center justify-center ${AVATAR_COLOR}`}>
      {initials(name)}
    </span>
  );
};

/* ───────────── Toast ───────────── */
const TOAST_TONE = {
  success: 'border-green-200 bg-green-50 text-green-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  info: 'border-blue-200 bg-blue-50 text-blue-900',
};

export const Toast = ({ toast, onClose }) => {
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(onClose, toast.actionLabel ? 7000 : 3500);
    return () => clearTimeout(t);
  }, [toast, onClose]);
  if (!toast) return null;
  return (
    <div className="fixed top-5 inset-x-0 z-[70] flex justify-center pointer-events-none px-4" role="status" aria-live="polite">
      <div
        className={`pointer-events-auto flex items-center gap-3 rounded-lg border px-4 py-2.5 font-medium shadow-lg ${TOAST_TONE[toast.type || 'info']}`}
        style={{ animation: 'barIn .3s both' }}
      >
        <span>{toast.text}</span>
        {toast.actionLabel && (
          <button
            type="button"
            className="text-blue-700 font-bold px-2 underline-offset-2 hover:underline"
            onClick={() => {
              toast.onAction?.();
              onClose();
            }}
          >
            {toast.actionLabel}
          </button>
        )}
        <button type="button" aria-label="Dismiss" onClick={onClose} className="text-slate-500 hover:text-slate-800">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

/* ───────────── Buttons / Menu ───────────── */
export const btnSecondary =
  'h-9 px-3.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 font-semibold text-slate-800 inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed';
export const btnPrimary =
  'h-9 px-3.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed';

export const Menu = ({ open, onClose, children, align = 'right', className = '' }) =>
  open ? (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div
        className={`absolute z-40 mt-1 ${align === 'right' ? 'right-0' : 'left-0'} bg-white border border-slate-200 rounded-lg shadow-lg py-1 ${className}`}
      >
        {children}
      </div>
    </>
  ) : null;

export const MenuItem = ({ children, onClick, danger, disabled }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed ${
      danger ? 'text-red-700' : 'text-slate-800'
    }`}
  >
    {children}
  </button>
);

/* ───────────── ConfirmDialog ───────────── */
const ACTION_STYLE = {
  primary: btnPrimary,
  secondary: btnSecondary,
  danger: 'h-9 px-3.5 rounded-md bg-red-600 hover:bg-red-700 text-white font-semibold',
  ghostDanger: 'h-9 px-3.5 rounded-md font-semibold text-red-700 hover:bg-red-50',
};

// actions: [{ label, onClick, variant, disabled }]
export const ConfirmDialog = ({ open, title, children, actions }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40" role="dialog" aria-modal="true" aria-label={title}>
      <div className="bg-white rounded-lg border border-slate-200 shadow-xl w-full max-w-md p-5" style={{ animation: 'fadeUp .25s both' }}>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <div className="text-slate-700 mt-2">{children}</div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {actions.map((a) => (
            <button key={a.label} type="button" disabled={a.disabled} onClick={a.onClick} className={`${ACTION_STYLE[a.variant || 'secondary']} disabled:opacity-60`}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ───────────── ReviewDrawer ───────────── */
// warnings: [{ tone: 'red'|'amber', text }]
export const ReviewDrawer = ({ open, onClose, onConfirm, saving, added, removed, index, highVerbs = DEFAULT_HIGH_VERBS, warnings = [] }) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;

  const groups = {};
  [...added.map((k) => ['+', k]), ...removed.map((k) => ['−', k])].forEach(([sign, key]) => {
    const e = index.byKey.get(key);
    const mod = e?.mod || 'Other';
    (groups[mod] ||= []).push({ sign, key, e });
  });
  const highAdded = added.map((k) => index.byKey.get(k)).filter((e) => e && isHighVerb(e.verb, highVerbs));
  const tones = { red: 'border-red-200 bg-red-50 text-red-900', amber: 'border-amber-200 bg-amber-50 text-amber-900' };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-slate-900/40" role="dialog" aria-modal="true" aria-label="Review changes">
      <div className="bg-white w-[460px] max-w-full h-full flex flex-col border-l border-slate-200 shadow-xl" style={{ animation: 'slideIn .32s both' }}>
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Review changes</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="text-slate-500 hover:text-slate-900">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {highAdded.length > 0 && (
            <div className={`rounded-lg border px-3 py-2.5 text-[13px] flex gap-2 ${tones.red}`}>
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                <b>{highAdded.length} high-impact permission{highAdded.length !== 1 ? 's' : ''} being added:</b>{' '}
                {highAdded.map(permLabel).join(', ')}
              </span>
            </div>
          )}
          {warnings.map((w) => (
            <div key={w.text} className={`rounded-lg border px-3 py-2.5 text-[13px] flex gap-2 ${tones[w.tone || 'amber']}`}>
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{w.text}</span>
            </div>
          ))}
          {Object.entries(groups).map(([mod, items]) => (
            <div key={mod}>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">{mod}</div>
              <ul className="space-y-1">
                {items.map(({ sign, key, e }) => (
                  <li key={key} className="flex items-center gap-2">
                    <span className={`w-4 text-center font-bold ${sign === '+' ? 'text-green-700' : 'text-red-700'}`}>{sign}</span>
                    <span>{e ? (e.category === 'page' ? 'Page access' : `${e.entity} · ${e.verb}`) : key}</span>
                    {e && isHighVerb(e.verb, highVerbs) && e.category !== 'page' && (
                      <span className="text-xs font-semibold text-red-700">High impact</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onClose}>Keep editing</button>
          <button type="button" className={btnPrimary} disabled={saving} onClick={onConfirm}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Confirm and save
          </button>
        </div>
      </div>
    </div>
  );
};

/* ───────────── ActionBar ───────────── */
export const ActionBar = ({ count, added, removed, saving, onDiscard, onReview, onSave, saveLabel = 'Save' }) => {
  if (!count) return null;
  return (
    <div
      className="sticky bottom-4 z-30 bg-white border border-slate-300 rounded-lg shadow-lg px-4 py-2.5 flex flex-wrap items-center gap-3"
      style={{ animation: 'barIn .32s both' }}
    >
      <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
      <b>{count} unsaved change{count !== 1 ? 's' : ''}</b>
      {added > 0 && <span className="text-xs font-semibold text-green-700">+{added} added</span>}
      {removed > 0 && <span className="text-xs font-semibold text-red-700">−{removed} removed</span>}
      <div className="ml-auto flex gap-2">
        <button type="button" className={btnSecondary} onClick={onDiscard} disabled={saving}>Discard</button>
        <button type="button" className={btnSecondary} onClick={onReview} disabled={saving}>Review changes</button>
        <button type="button" className={btnPrimary} onClick={onSave} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saveLabel}
        </button>
      </div>
    </div>
  );
};

/* ───────────── PermToolbar ───────────── */
export const PermToolbar = ({ search, onSearch, filter, onFilter, stats, showRoleFilters = true }) => {
  const chips = [
    ['all', 'All', stats.total],
    ['enabled', 'Enabled', stats.enabled],
    ['disabled', 'Disabled', stats.disabled],
    ...(showRoleFilters ? [['role', 'Via role', stats.role], ['direct', 'Direct', stats.direct]] : []),
    ['high', 'High impact', stats.highTotal],
  ];
  return (
    <div className="sticky top-3 z-20 bg-white border border-slate-200 rounded-lg p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            aria-label="Search permissions"
            className="w-full h-9 rounded-md border border-slate-300 pl-9 pr-3 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none"
            placeholder="Search permissions: try “delete”, “invoice” or “shifts”"
          />
        </div>
        <div className="text-slate-700">
          <b className="text-base text-slate-900">{stats.enabled}</b> of {stats.total} enabled
          {showRoleFilters && <span className="text-slate-600"> · {stats.role} via role · {stats.direct} direct</span>}
          {stats.high > 0 && (
            <span className="ml-3 text-xs font-semibold text-red-700">
              ▲ {stats.high} high-impact on
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {chips.map(([val, label, n]) => (
          <button
            key={val}
            type="button"
            aria-pressed={filter === val}
            onClick={() => onFilter(val)}
            className={`h-8 px-3 rounded-md text-xs font-semibold border ${
              filter === val ? 'bg-slate-800 border-slate-800 text-white' : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
            }`}
          >
            {label} <span className="opacity-80">{n}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

/* ───────────── JumpNav ───────────── */
export const JumpNav = ({ modules, onJump }) => (
  <nav aria-label="Jump to module" className="hidden lg:block w-44 shrink-0 sticky top-44 space-y-1 max-h-[calc(100vh-14rem)] overflow-y-auto thin-scroll">
    <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Jump to</div>
    {modules.map((m) => (
      <button key={m.name} type="button" onClick={() => onJump(m.name)} className="w-full text-left px-2 py-2 rounded-md hover:bg-slate-100">
        <div className="flex justify-between gap-2 text-[13px] text-slate-800">
          <span className="truncate">{m.name}</span>
          <span className="text-xs text-slate-600 shrink-0">{m.enabled}/{m.total}</span>
        </div>
        <div className="h-1 mt-1.5 rounded-full bg-slate-200">
          <div className={`h-1 rounded-full bg-blue-600`} style={{ width: `${m.total ? (m.enabled / m.total) * 100 : 0}%` }} />
        </div>
      </button>
    ))}
  </nav>
);

/* ───────────── PermissionWorkspace: toolbar + jump nav + module list ───────────── */
export const PermissionWorkspace = ({
  registry,
  checkedKeys,
  originalKeys,
  lockedKeys,
  roleSources,
  onToggle,
  onSectionToggle,
  expandedModules,
  onModuleOpen, // (module, nextOpen)
  showRoleFilters = true,
  highVerbs = DEFAULT_HIGH_VERBS,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const stats = useMemo(() => computeStats(registry, checkedKeys, lockedKeys, highVerbs), [registry, checkedKeys, lockedKeys, highVerbs]);
  const navModules = useMemo(
    () =>
      Object.entries(registry)
        .filter(([mod, perms]) => {
          const a = analyzeModule(mod, perms, { search, filter, checked: checkedKeys, locked: lockedKeys, highVerbs });
          return !a.active || a.hasMatch;
        })
        .map(([name, perms]) => ({ name, total: perms.length, enabled: perms.filter((p) => checkedKeys.has(p.key)).length })),
    [registry, search, filter, checkedKeys, lockedKeys, highVerbs]
  );

  const jump = (mod) => {
    onModuleOpen(mod, true);
    setTimeout(() => document.getElementById(moduleDomId(mod))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  return (
    <>
      <PermToolbar search={search} onSearch={setSearch} filter={filter} onFilter={setFilter} stats={stats} showRoleFilters={showRoleFilters} />
      <div className="flex gap-5 items-start">
        <JumpNav modules={navModules} onJump={jump} />
        <div className="flex-1 min-w-0">
          {navModules.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-600">
              <p className="font-medium text-slate-800">No permissions match.</p>
              <button type="button" className={`${btnSecondary} mt-3`} onClick={() => { setSearch(''); setFilter('all'); }}>
                Clear search and filters
              </button>
            </div>
          ) : (
            <PermissionModuleList
              registry={registry}
              checkedKeys={checkedKeys}
              originalKeys={originalKeys}
              lockedKeys={lockedKeys}
              roleSources={roleSources}
              onToggle={onToggle}
              onSectionToggle={onSectionToggle}
              expandedModules={expandedModules}
              onToggleModule={onModuleOpen}
              search={search}
              filter={filter}
              highVerbs={highVerbs}
            />
          )}
        </div>
      </div>
    </>
  );
};

/* ───────────── TemplateMenu (shared by Staff + Roles pages) ───────────── */
export const TemplateMenu = ({ templates, mode, onMode, current, locked, onApply, sources = [], sourceHeading, onPickSource, modeLocked }) => {
  const preview = (keys) => {
    const { added, removed } = diffSets(current, mergeKeys(current, keys, mode, locked));
    return added.length || removed.length ? `+${added.length} / −${removed.length}` : 'No change';
  };
  return (
    <div className="w-80">
      {!modeLocked && (
        <div className="px-3 pt-2 pb-2 border-b border-slate-100">
          <div className="inline-flex rounded-md border border-slate-300 overflow-hidden text-xs font-semibold" role="group" aria-label="Template mode">
            {[['add', 'Add to current'], ['replace', 'Replace direct']].map(([v, l]) => (
              <button key={v} type="button" aria-pressed={mode === v} onClick={() => onMode(v)} className={`px-3 h-8 ${mode === v ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      )}
      {Object.keys(templates).length === 0 && <div className="px-3 py-2 text-slate-600">No templates available.</div>}
      {Object.entries(templates).map(([name, keys]) => (
        <button key={name} type="button" onClick={() => onApply(keys, name)} className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50">
          <span className="flex items-center gap-2 font-medium text-slate-800"><Zap className="w-3.5 h-3.5 text-slate-500" />{name}</span>
          <span className="text-xs text-slate-600">{preview(keys)}</span>
        </button>
      ))}
      {sources.length > 0 && (
        <div className="px-3 py-2 border-t border-slate-100">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{sourceHeading}</label>
          <select
            value=""
            onChange={(e) => e.target.value && onPickSource(e.target.value)}
            className="w-full h-8 rounded-md border border-slate-300 px-2 text-sm bg-white"
          >
            <option value="">Choose…</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      )}
    </div>
  );
};

/* ───────────── Skeletons ───────────── */
export const ListSkeleton = ({ rows = 6 }) => (
  <ul className="divide-y divide-slate-100" aria-busy="true" aria-label="Loading list">
    {Array.from({ length: rows }).map((_, i) => (
      <li key={i} className="flex gap-3 p-3 px-4">
        <span className="sk h-9 w-9 rounded-full shrink-0" />
        <span className="flex-1 space-y-2">
          <span className="sk block h-3.5 w-2/3 rounded" />
          <span className="sk block h-3 w-1/3 rounded" />
        </span>
      </li>
    ))}
  </ul>
);

export const EditorSkeleton = () => (
  <div className="space-y-4" aria-busy="true" aria-label="Loading permissions">
    <div className="bg-white border border-slate-200 rounded-lg p-5 flex items-center gap-4">
      <span className="sk h-14 w-14 rounded-full" />
      <span className="flex-1 space-y-2">
        <span className="sk block h-5 w-48 rounded" />
        <span className="sk block h-3.5 w-32 rounded" />
      </span>
    </div>
    <div className="sk h-24 rounded-lg" />
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="sk h-12 rounded-lg" />
    ))}
  </div>
);

export const ErrorState = ({ message, onRetry }) => (
  <div className="bg-white border border-red-200 rounded-lg p-8 text-center">
    <AlertTriangle className="w-8 h-8 mx-auto text-red-600 mb-2" />
    <p className="font-semibold text-slate-900">Couldn’t load this data</p>
    <p className="text-slate-700 mt-1">{message || 'Something went wrong.'}</p>
    <button type="button" className={`${btnPrimary} mt-4`} onClick={onRetry}>Retry</button>
  </div>
);
