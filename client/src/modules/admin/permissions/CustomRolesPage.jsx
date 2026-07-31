import React, { useState, useEffect } from 'react';
import { KeySquare, Plus, Save, Trash2, Lock } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import PermissionModuleList from './PermissionModuleList';

const emptyForm = { name: '', description: '' };

const CustomRolesPage = () => {
  const [roles, setRoles] = useState([]);
  const [registry, setRegistry] = useState({});
  const [selectedRole, setSelectedRole] = useState(null); // null = creating new
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [currentPerms, setCurrentPerms] = useState(new Set());
  const [originalPerms, setOriginalPerms] = useState(new Set());
  const [originalForm, setOriginalForm] = useState(emptyForm);
  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingRole, setLoadingRole] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [expandedModules, setExpandedModules] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    Promise.all([apiClient.listCustomRoles(), apiClient.getPermissionsRegistry()])
      .then(([rolesRes, regRes]) => {
        setRoles(rolesRes.roles || []);
        setRegistry(regRes.registry || {});
      })
      .catch((err) => console.error('Custom roles load error:', err))
      .finally(() => setLoadingInit(false));
  }, []);

  const startCreate = () => {
    setSelectedRole(null);
    setIsCreating(true);
    setForm(emptyForm);
    setOriginalForm(emptyForm);
    setCurrentPerms(new Set());
    setOriginalPerms(new Set());
    setSaveMsg(null);
  };

  const selectRole = async (role) => {
    if (selectedRole?.id === role.id) return;
    setSelectedRole(role);
    setIsCreating(false);
    setSaveMsg(null);
    setLoadingRole(true);
    try {
      const res = await apiClient.getCustomRole(role.id);
      const f = { name: res.role.name, description: res.role.description || '' };
      setForm(f);
      setOriginalForm(f);
      const keys = new Set(res.permissions || []);
      setCurrentPerms(keys);
      setOriginalPerms(new Set(keys));
    } catch (err) {
      console.error('getCustomRole error:', err);
    } finally {
      setLoadingRole(false);
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

  const toggleModule = (mod) => {
    setExpandedModules((prev) => ({ ...prev, [mod]: prev[mod] === false ? true : false }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setSaveMsg({ type: 'error', text: 'Role name is required.' });
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        permissions: Array.from(currentPerms),
      };
      if (isCreating) {
        const res = await apiClient.createCustomRole(payload);
        const newRole = { ...res.role, permission_count: res.permissions.length, assigned_count: 0 };
        setRoles((prev) => [...prev, newRole].sort((a, b) => a.name.localeCompare(b.name)));
        setSelectedRole(newRole);
        setIsCreating(false);
        setOriginalForm(form);
        setOriginalPerms(new Set(currentPerms));
        setSaveMsg({ type: 'success', text: 'Role created.' });
      } else {
        const res = await apiClient.updateCustomRole(selectedRole.id, payload);
        setRoles((prev) =>
          prev.map((r) =>
            r.id === selectedRole.id
              ? { ...r, name: res.role.name, description: res.role.description, permission_count: res.permissions.length }
              : r
          )
        );
        setSelectedRole((prev) => ({ ...prev, name: res.role.name, description: res.role.description }));
        setOriginalForm(form);
        setOriginalPerms(new Set(currentPerms));
        setSaveMsg({ type: 'success', text: 'Role updated. Everyone assigned this role is updated immediately.' });
      }
    } catch (err) {
      setSaveMsg({ type: 'error', text: err.message || 'Failed to save role.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (role) => {
    setDeleting(true);
    try {
      await apiClient.deleteCustomRole(role.id);
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
      if (selectedRole?.id === role.id) startCreate();
      setDeleteConfirm(null);
    } catch (err) {
      setSaveMsg({ type: 'error', text: err.message || 'Failed to delete role.' });
      setDeleteConfirm(null);
    } finally {
      setDeleting(false);
    }
  };

  const isDirty =
    (isCreating && (form.name.trim() || currentPerms.size > 0)) ||
    (!isCreating &&
      !!selectedRole &&
      (form.name !== originalForm.name ||
        form.description !== originalForm.description ||
        currentPerms.size !== originalPerms.size ||
        [...currentPerms].some((k) => !originalPerms.has(k))));

  const showEditor = isCreating || !!selectedRole;

  return (
    <AdminLayout
      title="Custom Roles"
      subtitle="Create reusable, named permission sets you can assign to staff"
    >
      <div className="flex gap-6" style={{ height: 'calc(100vh - 14rem)' }}>
        {/* ── Left panel: role list ─────────────────────────────── */}
        <div className="w-72 flex-shrink-0 bg-white rounded-xl border border-slate-200 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-800 flex items-center gap-2 text-sm">
                <KeySquare className="w-4 h-4" />
                Roles
              </h2>
              {!loadingInit && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {roles.length} role{roles.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            <button
              onClick={startCreate}
              title="Create new role"
              className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {loadingInit ? (
              <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Loading…</div>
            ) : roles.length === 0 ? (
              <div className="text-center p-6 text-slate-400">
                <KeySquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium text-slate-500">No custom roles yet</p>
                <p className="text-xs mt-1">Create a role to bundle permissions you can assign to multiple staff.</p>
              </div>
            ) : (
              roles.map((role) => {
                const isSelected = !isCreating && selectedRole?.id === role.id;
                return (
                  <button
                    key={role.id}
                    onClick={() => selectRole(role)}
                    className={`w-full text-left px-3 py-3 rounded-lg mb-1 transition-colors border ${
                      isSelected ? 'bg-blue-50 border-blue-200' : 'border-transparent hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-medium text-sm text-slate-800 truncate">{role.name}</div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                      <span>{role.permission_count} perm{role.permission_count !== 1 ? 's' : ''}</span>
                      <span className="text-slate-300">·</span>
                      <span>{role.assigned_count} staff</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── Right panel: role editor ────────────────────────── */}
        <div className="flex-1 bg-white rounded-xl border border-slate-200 flex flex-col overflow-hidden min-w-0">
          {!showEditor ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              <div className="text-center">
                <Lock className="w-10 h-10 mx-auto mb-3 opacity-25" />
                <p className="font-medium text-slate-500">Select a role, or create a new one</p>
              </div>
            </div>
          ) : (
            <>
              <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4 flex-shrink-0">
                <div className="flex-1 space-y-2">
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Role name, e.g. HR Manager"
                    className="w-full text-base font-semibold text-slate-900 border-b border-transparent hover:border-slate-200 focus:border-blue-400 outline-none pb-1"
                  />
                  <input
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Optional description"
                    className="w-full text-xs text-slate-400 outline-none"
                  />
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!isCreating && selectedRole && (
                    deleteConfirm === selectedRole.id ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-500">Delete?</span>
                        <button
                          onClick={() => handleDelete(selectedRole)}
                          disabled={deleting}
                          className="px-2.5 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-50"
                        >
                          {deleting ? 'Deleting…' : 'Yes'}
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="px-2.5 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(selectedRole.id)}
                        title={selectedRole.assigned_count > 0 ? `Assigned to ${selectedRole.assigned_count} staff — reassign them first` : 'Delete role'}
                        disabled={selectedRole.assigned_count > 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors text-slate-500 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-500 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    )
                  )}
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
                    {saving ? 'Saving…' : isCreating ? 'Create Role' : 'Save'}
                  </button>
                </div>
              </div>

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

              {loadingRole ? (
                <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Loading role…</div>
              ) : (
                <div className="flex-1 overflow-y-auto p-5 space-y-2">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-slate-500">
                      <span className="font-semibold text-slate-800">{currentPerms.size}</span>{' '}
                      permission{currentPerms.size !== 1 ? 's' : ''} in this role
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

                  <PermissionModuleList
                    registry={registry}
                    checkedKeys={currentPerms}
                    onToggle={togglePerm}
                    expandedModules={expandedModules}
                    onToggleModule={toggleModule}
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

export default CustomRolesPage;
