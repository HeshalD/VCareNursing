import React, { useState, useEffect } from 'react';
import { Shield, Users, ChevronDown, ChevronUp, Save, Zap, Lock } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const getRoleLabel = (user) => {
  if (typeof user.role === 'string') return user.role.replace(/[{}]/g, '').trim();
  if (Array.isArray(user.role)) return user.role.join(', ');
  return '';
};

const getRoleColor = (label) => {
  if (label.includes('COORDINATOR')) return 'bg-blue-100 text-blue-700';
  if (label.includes('ACCOUNTS')) return 'bg-teal-100 text-teal-700';
  return 'bg-slate-100 text-slate-600';
};

const StaffPermissionsPage = () => {
  const [users, setUsers] = useState([]);
  const [registry, setRegistry] = useState({});
  const [templates, setTemplates] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);
  const [currentPerms, setCurrentPerms] = useState(new Set());
  const [originalPerms, setOriginalPerms] = useState(new Set());
  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [expandedModules, setExpandedModules] = useState({});

  useEffect(() => {
    Promise.all([
      apiClient.getPermissionsRegistry(),
      apiClient.getAdminUsers(),
    ])
      .then(([regRes, usersRes]) => {
        setRegistry(regRes.registry || {});
        setTemplates(regRes.templates || {});
        setUsers(usersRes.users || []);
      })
      .catch((err) => console.error('Permission manager load error:', err))
      .finally(() => setLoadingInit(false));
  }, []);

  const selectUser = async (user) => {
    if (selectedUser?.user_id === user.user_id) return;
    setSelectedUser(user);
    setLoadingPerms(true);
    setSaveMsg(null);
    try {
      const res = await apiClient.getUserPermissions(user.user_id);
      const keys = new Set((res.permissions || []).map((p) => p.permission_key));
      setCurrentPerms(new Set(keys));
      setOriginalPerms(new Set(keys));
    } catch (err) {
      console.error('getUserPermissions error:', err);
    } finally {
      setLoadingPerms(false);
    }
  };

  const togglePerm = (key) => {
    setSaveMsg(null);
    setCurrentPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const applyTemplate = (templateName) => {
    setSaveMsg(null);
    setCurrentPerms(new Set(templates[templateName] || []));
  };

  const handleSave = async () => {
    if (!selectedUser) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await apiClient.setUserPermissions(selectedUser.user_id, Array.from(currentPerms));
      const saved = new Set(currentPerms);
      setOriginalPerms(saved);
      setUsers((prev) =>
        prev.map((u) =>
          u.user_id === selectedUser.user_id
            ? { ...u, permission_count: currentPerms.size }
            : u
        )
      );
      setSaveMsg({ type: 'success', text: 'Permissions saved.' });
    } catch (err) {
      setSaveMsg({ type: 'error', text: err.message || 'Failed to save permissions.' });
    } finally {
      setSaving(false);
    }
  };

  const isDirty =
    !!selectedUser &&
    (currentPerms.size !== originalPerms.size ||
      [...currentPerms].some((k) => !originalPerms.has(k)));

  const toggleModule = (mod) => {
    setExpandedModules((prev) => ({ ...prev, [mod]: prev[mod] === false ? true : false }));
  };

  const isModuleExpanded = (mod) => expandedModules[mod] !== false;

  return (
    <AdminLayout
      title="Staff Permissions"
      subtitle="Manage what each internal staff member can access and do"
    >
      <div className="flex gap-6" style={{ height: 'calc(100vh - 14rem)' }}>
        {/* ── Left panel: staff selector ─────────────────────────────── */}
        <div className="w-72 flex-shrink-0 bg-white rounded-xl border border-slate-200 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2 text-sm">
              <Users className="w-4 h-4" />
              Internal Staff
            </h2>
            {!loadingInit && (
              <p className="text-xs text-slate-400 mt-0.5">
                {users.length} account{users.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {loadingInit ? (
              <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
                Loading…
              </div>
            ) : users.length === 0 ? (
              <div className="text-center p-6 text-slate-400">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium text-slate-500">No staff accounts yet</p>
                <p className="text-xs mt-1">
                  Create internal staff accounts with COORDINATOR or ACCOUNTS role to manage
                  their permissions here.
                </p>
              </div>
            ) : (
              users.map((user) => {
                const roleLabel = getRoleLabel(user);
                const isSelected = selectedUser?.user_id === user.user_id;
                return (
                  <button
                    key={user.user_id}
                    onClick={() => selectUser(user)}
                    className={`w-full text-left px-3 py-3 rounded-lg mb-1 transition-colors border ${
                      isSelected
                        ? 'bg-blue-50 border-blue-200'
                        : 'border-transparent hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-medium text-sm text-slate-800 truncate">
                      {user.full_name}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${getRoleColor(roleLabel)}`}
                      >
                        {roleLabel}
                      </span>
                      <span className="text-xs text-slate-400">
                        {user.permission_count} perm{user.permission_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── Right panel: permission editor ────────────────────────── */}
        <div className="flex-1 bg-white rounded-xl border border-slate-200 flex flex-col overflow-hidden min-w-0">
          {!selectedUser ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              <div className="text-center">
                <Lock className="w-10 h-10 mx-auto mb-3 opacity-25" />
                <p className="font-medium text-slate-500">Select a staff member</p>
                <p className="text-sm mt-1">Choose from the list to manage their permissions.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-4 flex-shrink-0">
                <div>
                  <h2 className="font-semibold text-slate-900">{selectedUser.full_name}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {selectedUser.mobile_number} · {getRoleLabel(selectedUser)}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {Object.keys(templates).map((tpl) => (
                    <button
                      key={tpl}
                      onClick={() => applyTemplate(tpl)}
                      title={`Apply the ${tpl} permission template as a starting point`}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-slate-600"
                    >
                      <Zap className="w-3 h-3" />
                      {tpl}
                    </button>
                  ))}
                  <button
                    onClick={handleSave}
                    disabled={!isDirty || saving}
                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                      isDirty && !saving
                        ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-sm'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>

              {/* Save message */}
              {saveMsg && (
                <div
                  className={`mx-5 mt-4 px-4 py-2 rounded-lg text-sm flex-shrink-0 ${
                    saveMsg.type === 'success'
                      ? 'bg-green-50 text-green-700 border border-green-100'
                      : 'bg-red-50 text-red-700 border border-red-100'
                  }`}
                >
                  {saveMsg.text}
                </div>
              )}

              {/* Permission modules */}
              {loadingPerms ? (
                <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                  Loading permissions…
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-5 space-y-2">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-slate-500">
                      <span className="font-semibold text-slate-800">{currentPerms.size}</span>{' '}
                      permission{currentPerms.size !== 1 ? 's' : ''} enabled
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCurrentPerms(new Set(Object.values(registry).flat().map((p) => p.key)))}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Select all
                      </button>
                      <span className="text-slate-300">·</span>
                      <button
                        onClick={() => { setSaveMsg(null); setCurrentPerms(new Set()); }}
                        className="text-xs text-slate-500 hover:underline"
                      >
                        Clear all
                      </button>
                    </div>
                  </div>

                  {Object.entries(registry).map(([mod, perms]) => {
                    const expanded = isModuleExpanded(mod);
                    const enabledCount = perms.filter((p) => currentPerms.has(p.key)).length;
                    const pagePerms = perms.filter((p) => p.category === 'page');
                    const actionPerms = perms.filter((p) => p.category === 'action');

                    return (
                      <div key={mod} className="border border-slate-200 rounded-lg overflow-hidden">
                        <button
                          onClick={() => toggleModule(mod)}
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
                                      checked={currentPerms.has(perm.key)}
                                      onToggle={() => togglePerm(perm.key)}
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
                                      checked={currentPerms.has(perm.key)}
                                      onToggle={() => togglePerm(perm.key)}
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
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

const PermToggle = ({ label, checked, onToggle }) => (
  <div className="flex items-center justify-between gap-3 py-0.5">
    <span className="text-sm text-slate-700">{label}</span>
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        checked ? 'bg-blue-600' : 'bg-slate-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 mt-0.5 ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  </div>
);

export default StaffPermissionsPage;
