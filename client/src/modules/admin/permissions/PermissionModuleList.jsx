import React from 'react';
import { ChevronDown, Check, Minus, Lock } from 'lucide-react';
import { DEFAULT_HIGH_VERBS, analyzeModule, nextToggle, triState } from './permissionUtils';

export const moduleDomId = (mod) => `perm-mod-${String(mod).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;

export const Highlight = ({ text, q }) => {
  const s = String(text ?? '');
  const n = (q || '').trim();
  if (!n) return s;
  const i = s.toLowerCase().indexOf(n.toLowerCase());
  if (i < 0) return s;
  return (
    <>
      {s.slice(0, i)}
      <mark className="bg-yellow-200 rounded-sm">{s.slice(i, i + n.length)}</mark>
      {s.slice(i + n.length)}
    </>
  );
};

// Tri-state checkbox: state = 'on' | 'off' | 'mixed'
export const TriBox = ({ state, onClick, label, disabled, ring }) => {
  const filled = state !== 'off';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === 'mixed' ? 'mixed' : state === 'on'}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`h-5 w-5 shrink-0 rounded flex items-center justify-center transition outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${
        filled ? 'bg-blue-600 border border-blue-600 text-white' : 'border-[1.5px] border-slate-400 bg-white hover:border-blue-600'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${ring ? 'ring-2 ring-offset-1 ring-blue-300' : ''}`}
    >
      {state === 'on' && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
      {state === 'mixed' && <Minus className="w-3.5 h-3.5" strokeWidth={3} />}
    </button>
  );
};

const NA_CELL = (
  <div className="flex justify-center">
    <span
      className="h-[22px] w-[26px] rounded bg-[repeating-linear-gradient(135deg,#F1F5F9_0_5px,#E2E8F0_5px_10px)]"
      title="Not available for this item"
    />
  </div>
);

const Cell = ({ perm, entity, verb, checked, locked, changed, dim, onToggle, roleSources }) => {
  if (!perm) return NA_CELL;
  const name = perm.category === 'page' ? `${entity}` : `${entity} · ${verb}`;
  if (locked) {
    return (
      <div className={`flex justify-center ${dim ? 'opacity-20' : ''}`}>
        <button
          type="button"
          aria-disabled="true"
          aria-label={`${name} (granted by role)`}
          title={`${name} — granted by ${roleSources || 'a role'}. Edit that role to change it.`}
          className="h-5 w-5 rounded bg-slate-200 border border-slate-300 text-slate-600 flex items-center justify-center cursor-not-allowed"
        >
          <Lock className="w-3 h-3" />
        </button>
      </div>
    );
  }
  return (
    <div className={`flex justify-center ${dim ? 'opacity-20' : ''}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={name}
        title={perm.label}
        onClick={() => onToggle(perm.key)}
        className={`h-5 w-5 rounded flex items-center justify-center transition outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${
          checked
            ? 'bg-blue-600 border border-blue-600 text-white'
            : 'border-[1.5px] border-slate-400 bg-white hover:border-blue-600 hover:scale-110'
        } ${changed ? 'ring-2 ring-offset-1 ring-blue-300' : ''}`}
      >
        {checked && (
          <span key="on" className="flex" style={{ animation: 'pop .22s' }}>
            <Check className="w-3.5 h-3.5" strokeWidth={3} />
          </span>
        )}
      </button>
    </div>
  );
};

const verbRisk = (verb) =>
  String(verb).toLowerCase() === 'delete' ? { text: 'text-red-700' } : { text: 'text-slate-700' };

// registry: { [module]: [{ key, label, category, entity?, verb? }] }
// checkedKeys: Set (effective, incl. role-locked) · originalKeys: Set (effective at last save)
// lockedKeys: Set of role-granted keys · roleSources: string naming the roles
const PermissionModuleList = ({
  registry,
  checkedKeys,
  originalKeys,
  onToggle,
  onSectionToggle,
  expandedModules,
  onToggleModule, // (module, nextOpen)
  lockedKeys,
  roleSources,
  search = '',
  filter = 'all',
  highVerbs = DEFAULT_HIGH_VERBS,
}) => {
  const apply = (keys) => {
    const t = nextToggle(keys, checkedKeys, lockedKeys);
    if (t) onSectionToggle(t.keys, t.checked);
  };

  return (
    <div className="space-y-3">
      {Object.entries(registry).map(([mod, perms]) => {
        const a = analyzeModule(mod, perms, { search, filter, checked: checkedKeys, locked: lockedKeys, highVerbs });
        if (a.active && !a.hasMatch) return null;

        const open = expandedModules[mod] ?? (a.active && a.hasMatch);
        const enabledCount = perms.filter((p) => checkedKeys.has(p.key)).length;
        const pct = perms.length ? Math.round((enabledCount / perms.length) * 100) : 0;
        const edited = originalKeys && perms.some((p) => checkedKeys.has(p.key) !== originalKeys.has(p.key));

        const visibleRows = a.rows.filter((r) => r.visible);
        const rowKeys = (r) => a.columns.map((c) => r.cells[c]).filter((p) => p && a.cellOk(p)).map((p) => p.key);
        const colKeys = (c) => visibleRows.map((r) => r.cells[c]).filter((p) => p && a.cellOk(p)).map((p) => p.key);
        const modKeys = visibleRows.flatMap(rowKeys);
        const gridCols = { gridTemplateColumns: `220px repeat(${a.columns.length}, minmax(112px, 1fr))` };
        const minW = 220 + a.columns.length * 112;

        return (
          <div
            key={mod}
            id={moduleDomId(mod)}
            className="bg-white border border-slate-200 rounded-lg overflow-hidden scroll-mt-48"
            style={{ animation: 'fadeUp .4s both' }}
          >
            <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50">
              <TriBox
                state={triState(modKeys, checkedKeys)}
                onClick={() => apply(modKeys)}
                label={`Toggle all in ${mod}`}
                disabled={!modKeys.some((k) => !lockedKeys?.has(k))}
                ring={edited}
              />
              <button
                type="button"
                aria-expanded={!!open}
                onClick={() => onToggleModule(mod, !open)}
                className="flex-1 min-w-0 flex items-center gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-300 rounded"
              >
                <span className="font-semibold text-slate-900 truncate">
                  <Highlight text={mod} q={search} />
                </span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 whitespace-nowrap">
                  {enabledCount} / {perms.length}
                </span>
                <span className="hidden sm:block h-1.5 w-28 rounded-full bg-slate-200 overflow-hidden">
                  <span
                    className={`block h-full transition-[width] duration-500 ${'bg-blue-600'}`}
                    style={{ width: `${pct}%` }}
                  />
                </span>
                {edited && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full border border-slate-300 bg-white text-slate-700">Edited</span>
                )}
                <ChevronDown
                  className={`ml-auto w-4 h-4 text-slate-500 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
                />
              </button>
            </div>

            <div className={`grid transition-[grid-template-rows] duration-300 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr] invisible'}`}>
              <div className="min-h-0 overflow-hidden">
                <div className="overflow-x-auto thin-scroll border-t border-slate-100">
                  <div style={{ minWidth: minW }}>
                    <div className="grid items-stretch bg-slate-50 border-b border-slate-200" style={gridCols}>
                      <div className="px-4 py-3 flex items-end text-xs font-semibold uppercase tracking-wide text-slate-500">Entity</div>
                      {a.columns.map((c) => {
                        const keys = colKeys(c);
                        const risk = verbRisk(c);
                        const hit = a.q && String(c).toLowerCase().includes(a.q);
                        return (
                          <div
                            key={c}
                            className={`flex flex-col items-center justify-between gap-2 px-2 py-3 text-center ${hit ? 'bg-yellow-100' : ''}`}
                          >
                            <span className={`text-xs font-semibold leading-tight ${risk.text}`}>
                              <Highlight text={c} q={search} />
                            </span>
                            <TriBox
                              state={triState(keys, checkedKeys)}
                              onClick={() => apply(keys)}
                              label={`Toggle ${c} for all visible items in ${mod}`}
                              disabled={!keys.some((k) => !lockedKeys?.has(k))}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {visibleRows.map((r) => {
                      const keys = rowKeys(r);
                      return (
                        <div key={r.id} className="grid items-center border-t border-slate-100 min-h-[44px] hover:bg-slate-50" style={gridCols}>
                          <div className="px-4 flex items-center gap-2.5 min-w-0">
                            <TriBox
                              state={triState(keys, checkedKeys)}
                              onClick={() => apply(keys)}
                              label={`Toggle all for ${r.entity}`}
                              disabled={!keys.some((k) => !lockedKeys?.has(k))}
                            />
                            <span className="font-medium text-slate-800 truncate">
                              <Highlight text={r.entity} q={search} />
                            </span>
                          </div>
                          {a.columns.map((c) => {
                            const perm = r.cells[c];
                            return (
                              <Cell
                                key={c}
                                perm={perm}
                                entity={r.entity}
                                verb={c}
                                checked={!!perm && checkedKeys.has(perm.key)}
                                locked={!!perm && !!lockedKeys?.has(perm.key)}
                                changed={!!perm && !!originalKeys && checkedKeys.has(perm.key) !== originalKeys.has(perm.key)}
                                dim={a.active && !!perm && !a.cellOk(perm)}
                                onToggle={onToggle}
                                roleSources={roleSources}
                              />
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PermissionModuleList;
