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
      className="text-[10px] font-semibold text-blue-600 hover:underline"
    >
      {allChecked ? 'Clear all' : 'Select all'}
    </button>
  );
};

// registry: { [moduleName]: [{ key, label, category }] }
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
                      <SectionSelectAll
                        perms={actionPerms}
                        checkedKeys={checkedKeys}
                        lockedKeys={lockedKeys}
                        onSectionToggle={onSectionToggle}
                      />
                    </div>
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
