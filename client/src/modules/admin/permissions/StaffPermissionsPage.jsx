import React, { useState, useEffect } from 'react';
import { Users, Save, Zap, Lock, KeySquare, CheckSquare, Square } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import PermissionModuleList from './PermissionModuleList';

// Must match the internal/office role labels used on the Internal Staff page.
const ROLE_LABELS = {
  SUPER_ADMIN: 'Super Admin',
  COORDINATOR: 'Coordinator',
  ACCOUNTS: 'Accounts',
  SALES: 'Sales',
  STORE_MANAGER: 'Store Manager',
  RECRUITER: 'Recruiter',
};

const fixedRoleLabel = (role) => ROLE_LABELS[role] || role;

const fixedRoleColor = (role) => {
  if (role === 'CUSTOM_ROLE') return 'bg-indigo-100 text-indigo-700';
  if (role === 'SUPER_ADMIN') return 'bg-purple-100 text-purple-700';
  if (role === 'COORDINATOR') return 'bg-blue-100 text-blue-700';
  if (role === 'ACCOUNTS') return 'bg-teal-100 text-teal-700';
  if (role === 'SALES') return 'bg-amber-100 text-amber-700';
  if (role === 'STORE_MANAGER') return 'bg-cyan-100 text-cyan-700';
  if (role === 'RECRUITER') return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-600';
};

// A staff member can hold several roles at once (e.g. Coordinator + a custom
// role). The registry now always sends the full `roles` array — each entry
// already carries its own custom_role_name when applicable — so every role
// renders with its real name instead of the raw CUSTOM_ROLE enum value.
const getUserRoles = (user) => {
  if (user.roles && user.roles.length > 0) return user.roles;
  if (!user.role) return [];
  const raw = typeof user.role === 'string' ? user.role.replace(/[{}]/g, '').trim() : '';
  return raw
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((role) => ({ role, custom_role_id: user.custom_role_id, custom_role_name: user.custom_role_name }));
};

const roleDisplayLabel = (r) => (r.role === 'CUSTOM_ROLE' ? (r.custom_role_name || 'Custom Role') : fixedRoleLabel(r.role));

const StaffPermissionsPage = () => {
  const [users, setUsers] = useState([]);
  const [registry, setRegistry] = useState({});
  const [templates, setTemplates] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);
  const [currentPerms, setCurrentPerms] = useState(new Set());
  const [originalPerms, setOriginalPerms] = useState(new Set());
  const [rolePerms, setRolePerms] = useState(new Set());
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
      setRolePerms(new Set(res.role_permissions || []));
    } catch (err) {
      console.error('getUserPermissions error:', err);
    } finally {
      setLoadingPerms(false);
    }
  };

  const togglePerm = (key) => {
    if (rolePerms.has(key)) return; // granted via the assigned role — edit the role to change it
    setSaveMsg(null);
    setCurrentPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const setSectionPerms = (keys, checked) => {
    setSaveMsg(null);
    setCurrentPerms((prev) => {
      const next = new Set(prev);
      keys.forEach((key) => {
        if (rolePerms.has(key)) return; // granted via role — not togglable
        if (checked) next.add(key);
        else next.delete(key);
      });
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

  const effectivePerms = new Set([...currentPerms, ...rolePerms]);

  const toggleModule = (mod) => {
    setExpandedModules((prev) => ({ ...prev, [mod]: prev[mod] === false ? true : false }));
  };

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
                  Create an internal staff member with a login account to manage their
                  permissions here.
                </p>
              </div>
            ) : (
              users.map((user) => {
                const roles = getUserRoles(user);
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
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {roles.map((r, i) => (
                        <span
                          key={`${r.role}-${r.custom_role_id || ''}-${i}`}
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${fixedRoleColor(r.role)}`}
                        >
                          {r.role === 'CUSTOM_ROLE' && <KeySquare className="w-2.5 h-2.5" />}
                          {roleDisplayLabel(r)}
                        </span>
                      ))}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {user.permission_count} perm{user.permission_count !== 1 ? 's' : ''}
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
                  <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                    {selectedUser.full_name}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {selectedUser.mobile_number} · {getUserRoles(selectedUser).map(roleDisplayLabel).join(', ') || '—'}
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
                      <span className="font-semibold text-slate-800">{effectivePerms.size}</span>{' '}
                      permission{effectivePerms.size !== 1 ? 's' : ''} enabled
                      {rolePerms.size > 0 && (
                        <span className="text-slate-400"> ({rolePerms.size} via role)</span>
                      )}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setSaveMsg(null); setCurrentPerms(new Set(Object.values(registry).flat().map((p) => p.key))); }}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                      >
                        <CheckSquare className="w-3 h-3" />
                        Select all
                      </button>
                      <button
                        onClick={() => { setSaveMsg(null); setCurrentPerms(new Set()); }}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                      >
                        <Square className="w-3 h-3" />
                        Clear all
                      </button>
                    </div>
                  </div>

                  <PermissionModuleList
                    registry={registry}
                    checkedKeys={effectivePerms}
                    onToggle={togglePerm}
                    onSectionToggle={setSectionPerms}
                    expandedModules={expandedModules}
                    onToggleModule={toggleModule}
                    lockedKeys={rolePerms}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default StaffPermissionsPage;
