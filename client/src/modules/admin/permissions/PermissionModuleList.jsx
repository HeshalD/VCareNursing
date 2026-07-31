import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export const PermToggle = ({ label, checked, onToggle, locked }) => (
  <div className="flex items-center justify-between gap-3 py-0.5">
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

// registry: { [moduleName]: [{ key, label, category }] }
// checkedKeys: Set<string>
// lockedKeys: optional Set<string> — permissions granted via a role, shown checked + non-interactive
const PermissionModuleList = ({
  registry,
  checkedKeys,
  onToggle,
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
            <button
              onClick={() => onToggleModule(mod)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
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
              {expanded ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {expanded && (
              <div>
                {pagePerms.length > 0 && (
                  <div className="px-4 pt-3 pb-2">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
                      Page Access
                    </p>
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
                    {pagePerms.length > 0 && (
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
                        Actions
                      </p>
                    )}
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
