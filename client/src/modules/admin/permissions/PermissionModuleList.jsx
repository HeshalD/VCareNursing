import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export const PermToggle = ({ label, checked, onToggle, locked }) => (
  <div
    className={`flex items-center justify-between gap-3 py-1.5 px-2 -mx-2 rounded-md transition-colors ${
      locked ? '' : 'hover:bg-slate-100'
    }`}
  >
    <span className="text-sm text-slate-700 flex items-center gap-1.5">
      {label}
      {locked && (
        <span className="text-[9px] font-semibold uppercase tracking-wide text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full">
          via role
        </span>
      )}
    </span>
    <button
      type="button"
      onClick={locked ? undefined : onToggle}
      aria-pressed={checked}
      disabled={locked}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        checked ? 'bg-blue-600' : 'bg-slate-200'
      } ${locked ? 'opacity-70 cursor-not-allowed' : ''}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 mt-0.5 ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  </div>
);

// Plain checkbox used inside an entity/verb table cell — checked+disabled
// (rather than hidden) when granted via role, so the grid still shows the
// full picture of what's enabled, just non-interactive for that cell.
const PermCheckbox = ({ checked, onChange, locked, title }) => (
  <input
    type="checkbox"
    checked={checked}
    onChange={locked ? undefined : onChange}
    disabled={locked}
    title={locked ? `${title} — granted via role` : title}
    className={`h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 ${
      locked ? 'opacity-70 cursor-not-allowed accent-blue-400' : 'cursor-pointer accent-blue-600'
    }`}
  />
);

const SectionSelectAll = ({ perms, checkedKeys, lockedKeys, onSectionToggle }) => {
  const togglable = perms.filter((p) => !lockedKeys?.has(p.key));
  if (togglable.length === 0) return null;
  const allChecked = togglable.every((p) => checkedKeys.has(p.key));
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSectionToggle(togglable.map((p) => p.key), !allChecked);
      }}
      className="text-[10px] font-semibold text-blue-600 hover:underline flex-shrink-0"
    >
      {allChecked ? 'Clear all' : 'Select all'}
    </button>
  );
};

// Entity (rows) x verb (columns) table for one module — the actual "tick one
// by one" grid. `entityGroups` is { [entityName]: perm[] }; `verbs` is the
// ordered, deduplicated list of every verb used anywhere in the module (a
// module's entities rarely share every verb, so most rows have gaps — shown
// as a dash rather than an empty cell so it reads as "not applicable", not
// "forgot to check this").
const EntityVerbTable = ({ entityGroups, verbs, checkedKeys, lockedKeys, onToggle, onSectionToggle }) => {
  const columnKeys = (verb) =>
    Object.values(entityGroups)
      .map((perms) => perms.find((p) => p.verb === verb))
      .filter(Boolean)
      .map((p) => p.key);

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="min-w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-2 py-1.5 whitespace-nowrap">
              Entity
            </th>
            {verbs.map((verb) => (
              <th key={verb} className="text-center px-2 py-1.5 align-bottom">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10.5px] font-semibold text-slate-500 whitespace-nowrap">{verb}</span>
                  <SectionSelectAll
                    perms={columnKeys(verb).map((key) => ({ key }))}
                    checkedKeys={checkedKeys}
                    lockedKeys={lockedKeys}
                    onSectionToggle={onSectionToggle}
                  />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(entityGroups).map(([entity, perms]) => {
            const byVerb = new Map(perms.map((p) => [p.verb, p]));
            return (
              <tr key={entity} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                <td className="px-2 py-2 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">{entity}</span>
                    <SectionSelectAll perms={perms} checkedKeys={checkedKeys} lockedKeys={lockedKeys} onSectionToggle={onSectionToggle} />
                  </div>
                </td>
                {verbs.map((verb) => {
                  const perm = byVerb.get(verb);
                  return (
                    <td key={verb} className="text-center px-2 py-2">
                      {perm ? (
                        <PermCheckbox
                          checked={checkedKeys.has(perm.key)}
                          onChange={() => onToggle(perm.key)}
                          locked={lockedKeys?.has(perm.key)}
                          title={perm.label}
                        />
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// registry: { [moduleName]: [{ key, label, category, entity?, verb? }] }
// checkedKeys: Set<string>
// lockedKeys: optional Set<string> — permissions granted via a role, shown checked + non-interactive
const PermissionModuleList = ({
  registry,
  checkedKeys,
  onToggle,
  onSectionToggle,
  expandedModules,
  onToggleModule,
  lockedKeys,
}) => {
  const isModuleExpanded = (mod) => expandedModules[mod] !== false;

  return (
    <>
      {Object.entries(registry).map(([mod, perms]) => {
        const expanded = isModuleExpanded(mod);
        const enabledCount = perms.filter((p) => checkedKeys.has(p.key)).length;
        const pagePerms = perms.filter((p) => p.category === 'page');
        const actionPerms = perms.filter((p) => p.category === 'action');

        // A module with two or more distinct action permissions is worth grouping
        // by entity (rows) — one lone action (Settings, Receipts, etc.) gets a
        // table of one cell, which isn't clearer than the plain toggle it'd replace.
        const useGrid = actionPerms.length > 1;
        const entityGroups = useGrid
          ? actionPerms.reduce((acc, perm) => {
              const entity = perm.entity || mod; // defensive fallback for any unmapped key
              if (!acc[entity]) acc[entity] = [];
              acc[entity].push(perm);
              return acc;
            }, {})
          : null;
        // Column order = first-appearance order of each verb in the registry,
        // which already clusters related verbs together (e.g. Create/Edit/Delete
        // before the more one-off actions).
        const verbs = useGrid
          ? [...new Set(actionPerms.map((p) => p.verb || p.label))]
          : null;

        return (
          <div key={mod} className="border border-slate-200 rounded-lg overflow-hidden">
            <div
              onClick={() => onToggleModule(mod)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="font-semibold text-sm text-slate-800">{mod}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    enabledCount === perms.length && perms.length > 0
                      ? 'bg-green-100 text-green-700'
                      : enabledCount > 0
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {enabledCount}/{perms.length}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <SectionSelectAll
                  perms={perms}
                  checkedKeys={checkedKeys}
                  lockedKeys={lockedKeys}
                  onSectionToggle={onSectionToggle}
                />
                {expanded ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </div>

            {expanded && (
              <div>
                {pagePerms.length > 0 && (
                  <div className="px-4 pt-3 pb-2">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                        Page Access
                      </p>
                      <SectionSelectAll
                        perms={pagePerms}
                        checkedKeys={checkedKeys}
                        lockedKeys={lockedKeys}
                        onSectionToggle={onSectionToggle}
                      />
                    </div>
                    <div className="space-y-2">
                      {pagePerms.map((perm) => (
                        <PermToggle
                          key={perm.key}
                          label={perm.label}
                          checked={checkedKeys.has(perm.key)}
                          onToggle={() => onToggle(perm.key)}
                          locked={lockedKeys?.has(perm.key)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {actionPerms.length > 0 && (
                  <div
                    className={`px-4 pt-3 pb-3 ${
                      pagePerms.length > 0 ? 'border-t border-slate-100' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      {pagePerms.length > 0 ? (
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                          Actions
                        </p>
                      ) : (
                        <span />
                      )}
                      {!useGrid && (
                        <SectionSelectAll
                          perms={actionPerms}
                          checkedKeys={checkedKeys}
                          lockedKeys={lockedKeys}
                          onSectionToggle={onSectionToggle}
                        />
                      )}
                    </div>
                    {useGrid ? (
                      <EntityVerbTable
                        entityGroups={entityGroups}
                        verbs={verbs}
                        checkedKeys={checkedKeys}
                        lockedKeys={lockedKeys}
                        onToggle={onToggle}
                        onSectionToggle={onSectionToggle}
                      />
                    ) : (
                      <div className="space-y-2">
                        {actionPerms.map((perm) => (
                          <PermToggle
                            key={perm.key}
                            label={perm.label}
                            checked={checkedKeys.has(perm.key)}
                            onToggle={() => onToggle(perm.key)}
                            locked={lockedKeys?.has(perm.key)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
};

export default PermissionModuleList;
