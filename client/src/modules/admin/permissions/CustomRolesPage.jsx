import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeySquare, Plus, Search, Pencil, Trash2, Copy, ChevronDown, MoreHorizontal } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import {
  ActionBar,
  ConfirmDialog,
  EditorSkeleton,
  ErrorState,
  ListSkeleton,
  Menu,
  MenuItem,
  PermissionWorkspace,
  ReviewDrawer,
  TemplateMenu,
  Toast,
  btnSecondary,
} from './permissionUi';
import { allKeys, buildIndex, diffSets, mergeKeys, setsEqual } from './permissionUtils';

const emptyForm = { name: '', description: '' };

const CustomRolesPage = () => {
  const navigate = useNavigate();
  const [roles, setRoles] = useState([]);
  const [registry, setRegistry] = useState({});
  const [templates, setTemplates] = useState({});
  const [users, setUsers] = useState(null); // null = not loaded
  const [selectedRole, setSelectedRole] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [originalForm, setOriginalForm] = useState(emptyForm);
  const [currentPerms, setCurrentPerms] = useState(new Set());
  const [originalPerms, setOriginalPerms] = useState(new Set());
  const [loadingInit, setLoadingInit] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [loadingRole, setLoadingRole] = useState(false);
  const [roleError, setRoleError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [expandedModules, setExpandedModules] = useState({});
  const [roleSearch, setRoleSearch] = useState('');
  const [sort, setSort] = useState('name');
  const [pending, setPending] = useState(null); // { run }
  const [reviewOpen, setReviewOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [tplMode, setTplMode] = useState('replace');
  const [moreOpen, setMoreOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [nameError, setNameError] = useState('');
  const [shake, setShake] = useState(false);
  const nameRef = useRef(null);
  const reqRef = useRef(0);

  const index = useMemo(() => buildIndex(registry), [registry]);
  const closeToast = useCallback(() => setToast(null), []);

  const loadInit = useCallback(() => {
    setLoadingInit(true);
    setLoadError(null);
    Promise.all([apiClient.listCustomRoles(), apiClient.getPermissionsRegistry()])
      .then(([rolesRes, regRes]) => {
        setRoles(rolesRes.roles || []);
        setRegistry(regRes.registry || {});
        setTemplates(regRes.templates || {});
      })
      .catch((err) => setLoadError(err.message || 'Failed to load custom roles.'))
      .finally(() => setLoadingInit(false));
    apiClient.getAdminUsers().then((r) => setUsers(r.users || [])).catch(() => setUsers(null));
  }, []);

  useEffect(() => {
    loadInit();
  }, [loadInit]);

  const { added, removed } = useMemo(() => diffSets(originalPerms, currentPerms), [originalPerms, currentPerms]);
  const formChanged = form.name !== originalForm.name || form.description !== originalForm.description;
  const changeCount = added.length + removed.length + (formChanged && !isCreating ? 1 : 0);
  const isDirty = isCreating
    ? !!form.name.trim() || currentPerms.size > 0
    : !!selectedRole && changeCount > 0;
  const showEditor = isCreating || !!selectedRole;

  const assigned = useMemo(() => {
    if (!selectedRole || !users) return [];
    return users.filter((u) => u.custom_role_id === selectedRole.id || (u.roles || []).some((r) => r.custom_role_id === selectedRole.id));
  }, [users, selectedRole]);
  const assignedCount = users ? assigned.length : selectedRole?.assigned_count || 0;

  const guard = (run) => {
    if (isDirty) setPending({ run });
    else run();
  };

  const startCreate = () => {
    reqRef.current++;
    setSelectedRole(null);
    setIsCreating(true);
    setForm(emptyForm);
    setOriginalForm(emptyForm);
    setCurrentPerms(new Set());
    setOriginalPerms(new Set());
    setNameError('');
    setRoleError(null);
    setLoadingRole(false);
  };

  const duplicate = () => {
    const f = { name: `${form.name} (copy)`, description: form.description };
    const perms = new Set(currentPerms);
    reqRef.current++;
    setSelectedRole(null);
    setIsCreating(true);
    setForm(f);
    setOriginalForm(emptyForm);
    setCurrentPerms(perms);
    setOriginalPerms(new Set());
    setNameError('');
    setMoreOpen(false);
    setToast({ type: 'info', text: 'Draft created. Nothing is saved until you click Create role.' });
  };

  const loadRole = async (role) => {
    const id = ++reqRef.current;
    setSelectedRole(role);
    setIsCreating(false);
    setLoadingRole(true);
    setRoleError(null);
    setNameError('');
    try {
      const res = await apiClient.getCustomRole(role.id);
      if (id !== reqRef.current) return;
      const f = { name: res.role.name, description: res.role.description || '' };
      setForm(f);
      setOriginalForm(f);
      const keys = new Set(res.permissions || []);
      setCurrentPerms(keys);
      setOriginalPerms(new Set(keys));
    } catch (err) {
      if (id === reqRef.current) setRoleError(err.message || 'Failed to load this role.');
    } finally {
      if (id === reqRef.current) setLoadingRole(false);
    }
  };

  const selectRole = (role) => {
    if (!isCreating && selectedRole?.id === role.id) return;
    guard(() => loadRole(role));
  };

  const togglePerm = (key) =>
    setCurrentPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Fixes the old crash: this page never passed onSectionToggle.
  const setSectionPerms = (keys, checked) =>
    setCurrentPerms((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (checked ? next.add(k) : next.delete(k)));
      return next;
    });

  const applyBulk = (next, text) => {
    const prev = currentPerms;
    setCurrentPerms(next);
    setToast({ type: 'info', text, actionLabel: 'Undo', onAction: () => setCurrentPerms(prev) });
  };

  const applyKeys = (keys, label) => {
    const next = mergeKeys(currentPerms, keys, tplMode, null);
    setTplOpen(false);
    if (setsEqual(next, currentPerms)) {
      setToast({ type: 'info', text: `${label}: no change.` });
      return;
    }
    applyBulk(next, `Applied ${label}`);
  };

  const pickRole = async (id) => {
    const r = roles.find((x) => String(x.id) === String(id));
    if (!r) return;
    try {
      const res = await apiClient.getCustomRole(r.id);
      applyKeys(res.permissions || [], `${r.name} permissions`);
    } catch (err) {
      setToast({ type: 'error', text: err.message || 'Could not load that role.' });
    }
  };

  const setModuleOpen = (mod, open) => setExpandedModules((prev) => ({ ...prev, [mod]: open }));
  const setAllOpen = (open) => {
    setExpandedModules(Object.fromEntries(Object.keys(registry).map((m) => [m, open])));
    setMoreOpen(false);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setNameError('Role name is required.');
      setShake(true);
      setTimeout(() => setShake(false), 400);
      nameRef.current?.focus();
      return false;
    }
    setNameError('');
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), description: form.description.trim(), permissions: Array.from(currentPerms) };
      if (isCreating) {
        const res = await apiClient.createCustomRole(payload);
        const newRole = { ...res.role, permission_count: res.permissions.length, assigned_count: 0 };
        setRoles((prev) => [...prev, newRole].sort((a, b) => a.name.localeCompare(b.name)));
        setSelectedRole(newRole);
        setIsCreating(false);
        setOriginalForm(form);
        setOriginalPerms(new Set(currentPerms));
        setToast({ type: 'success', text: 'Role created.' });
      } else {
        const res = await apiClient.updateCustomRole(selectedRole.id, payload);
        setRoles((prev) =>
          prev.map((r) =>
            r.id === selectedRole.id ? { ...r, name: res.role.name, description: res.role.description, permission_count: res.permissions.length } : r
          )
        );
        setSelectedRole((prev) => ({ ...prev, name: res.role.name, description: res.role.description }));
        setOriginalForm(form);
        setOriginalPerms(new Set(currentPerms));
        setToast({ type: 'success', text: 'Role updated. Everyone assigned this role is updated immediately.' });
      }
      return true;
    } catch (err) {
      setToast({ type: 'error', text: err.message || 'Failed to save role.' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const role = selectedRole;
    setDeleting(true);
    try {
      await apiClient.deleteCustomRole(role.id);
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
      setDeleteOpen(false);
      reqRef.current++;
      setSelectedRole(null);
      setIsCreating(false);
      setCurrentPerms(new Set());
      setOriginalPerms(new Set());
      setForm(emptyForm);
      setOriginalForm(emptyForm);
      setToast({ type: 'success', text: `Deleted “${role.name}”.` });
    } catch (err) {
      setDeleteOpen(false);
      setToast({ type: 'error', text: err.message || 'Failed to delete role.' });
    } finally {
      setDeleting(false);
    }
  };

  const shownRoles = useMemo(() => {
    const q = roleSearch.trim().toLowerCase();
    return roles
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .sort((a, b) =>
        sort === 'perms' ? b.permission_count - a.permission_count : sort === 'staff' ? b.assigned_count - a.assigned_count : a.name.localeCompare(b.name)
      );
  }, [roles, roleSearch, sort]);

  const warnings =
    !isCreating && assigned.length > 0
      ? [{ tone: 'amber', text: `Assigned to ${assigned.length} staff (${assigned.map((u) => u.full_name).join(', ')}). Their access changes immediately.` }]
      : [];

  const deleteReason = assignedCount > 0 ? 'Assigned to staff. Reassign them first.' : 'Delete role';

  return (
    <AdminLayout title="Custom Roles" subtitle="Create reusable, named permission sets you can assign to staff">
      <div className="perm-motion text-sm text-slate-900">
        {loadError ? (
          <ErrorState message={loadError} onRetry={loadInit} />
        ) : (
          <div className="flex gap-5 items-start">
            {/* ===== LEFT LIST ===== */}
            <aside className="w-80 shrink-0 bg-white border border-slate-200 rounded-lg overflow-hidden sticky top-3 max-h-[calc(100vh-2rem)] flex flex-col">
              <div className="p-4 border-b border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">Roles</div>
                    <div className="text-xs text-slate-600">{loadingInit ? 'Loading…' : `${roles.length} role${roles.length !== 1 ? 's' : ''}`}</div>
                  </div>
                  <button type="button" onClick={() => guard(startCreate)} className="h-8 px-3 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> New role
                  </button>
                </div>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={roleSearch}
                    onChange={(e) => setRoleSearch(e.target.value)}
                    aria-label="Search roles"
                    className="w-full h-9 rounded-md border border-slate-300 pl-9 pr-3 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none"
                    placeholder="Search roles"
                  />
                </div>
                <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort roles" className="w-full h-8 rounded-md border border-slate-300 px-2 text-xs bg-white">
                  <option value="name">Sort: Name A–Z</option>
                  <option value="perms">Sort: Most permissions</option>
                  <option value="staff">Sort: Most staff</option>
                </select>
              </div>
              <div className="overflow-y-auto">
                {loadingInit ? (
                  <ListSkeleton />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {isCreating && (
                      <li>
                        <div className="w-full flex gap-3 p-3 px-4 bg-blue-50">
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 font-semibold">
                              <span className="truncate">{form.name.trim() || 'New role'}</span>
                              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" title="Unsaved" />
                            </span>
                            <span className="text-xs text-slate-600">Unsaved draft · {currentPerms.size} permissions</span>
                          </span>
                        </div>
                      </li>
                    )}
                    {shownRoles.map((role) => {
                      const selected = !isCreating && selectedRole?.id === role.id;
                      return (
                        <li key={role.id}>
                          <button type="button" onClick={() => selectRole(role)} aria-current={selected} className={`w-full text-left p-3 px-4 ${selected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                            <span className="flex items-center gap-2 font-semibold">
                              <span className="truncate">{role.name}</span>
                              {selected && isDirty && <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" title="Unsaved changes" />}
                            </span>
                            <span className="text-xs text-slate-600">
                              {role.permission_count} permission{role.permission_count !== 1 ? 's' : ''} · {role.assigned_count} staff
                            </span>
                          </button>
                        </li>
                      );
                    })}
                    {!isCreating && shownRoles.length === 0 && (
                      <li className="text-center p-6 text-slate-600">
                        <KeySquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p className="font-medium text-slate-800">{roles.length === 0 ? 'No custom roles yet' : 'No roles match'}</p>
                        {roles.length === 0 ? (
                          <p className="text-xs mt-1">Create a role to bundle permissions you can assign to multiple staff.</p>
                        ) : (
                          <button type="button" className={`${btnSecondary} mt-3`} onClick={() => setRoleSearch('')}>Clear search</button>
                        )}
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </aside>

            {/* ===== EDITOR ===== */}
            <section className="flex-1 min-w-0 space-y-4">
              {!showEditor ? (
                <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-slate-600">
                  <KeySquare className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="font-semibold text-slate-800">Select a role, or create a new one</p>
                </div>
              ) : (
                <>
                  <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-wrap items-start gap-4">
                    <div className="flex-1 min-w-[280px] space-y-3">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1" htmlFor="role-name">Role name</label>
                        <div className={`relative ${shake ? 'animate-[shake_.35s]' : ''}`}>
                          <input
                            id="role-name"
                            ref={nameRef}
                            value={form.name}
                            onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setNameError(''); }}
                            aria-invalid={!!nameError}
                            placeholder="e.g. HR Manager"
                            className={`w-full h-10 rounded-md border px-3 pr-9 text-base font-semibold outline-none focus:ring-2 ${
                              nameError ? 'border-red-500 focus:ring-red-100' : 'border-slate-300 focus:border-blue-600 focus:ring-blue-100'
                            }`}
                          />
                          <Pencil className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                        {nameError && <p className="text-xs text-red-700 mt-1" role="alert">{nameError}</p>}
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1" htmlFor="role-desc">Description</label>
                        <div className="relative">
                          <input
                            id="role-desc"
                            value={form.description}
                            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                            placeholder="Optional description"
                            className="w-full h-9 rounded-md border border-slate-300 px-3 pr-9 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                          />
                          <Pencil className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                      </div>
                      {!isCreating && (
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Assigned staff</div>
                          {!users ? (
                            <span className="text-slate-600">{selectedRole?.assigned_count || 0} staff</span>
                          ) : assigned.length === 0 ? (
                            <span className="text-slate-600">Nobody yet</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {assigned.map((u) => (
                                <a
                                  key={u.user_id}
                                  href={`/admin/permissions?user=${u.user_id}`}
                                  onClick={(e) => { e.preventDefault(); guard(() => navigate(`/admin/permissions?user=${u.user_id}`)); }}
                                  className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
                                >
                                  {u.full_name}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {!isCreating && selectedRole && (
                        <button type="button" disabled={assignedCount > 0} title={deleteReason} onClick={() => setDeleteOpen(true)} className={`${btnSecondary} hover:!bg-red-50 hover:!text-red-700`}>
                          <Trash2 className="w-4 h-4" /> Delete
                        </button>
                      )}
                      {!isCreating && selectedRole && (
                        <button type="button" className={btnSecondary} onClick={duplicate} disabled={loadingRole || !!roleError}>
                          <Copy className="w-4 h-4" /> Duplicate
                        </button>
                      )}
                      <div className="relative">
                        <button type="button" className={btnSecondary} aria-haspopup="menu" aria-expanded={tplOpen} onClick={() => setTplOpen((o) => !o)} disabled={loadingRole || !!roleError}>
                          Start from… <ChevronDown className="w-4 h-4" />
                        </button>
                        <Menu open={tplOpen} onClose={() => setTplOpen(false)}>
                          <TemplateMenu
                            templates={templates}
                            mode={tplMode}
                            onMode={setTplMode}
                            current={currentPerms}
                            locked={null}
                            onApply={applyKeys}
                            sources={roles.filter((r) => r.id !== selectedRole?.id).map((r) => ({ id: String(r.id), label: r.name }))}
                            sourceHeading="Copy from another role"
                            onPickSource={pickRole}
                          />
                        </Menu>
                      </div>
                      <div className="relative">
                        <button type="button" className={`${btnSecondary} !px-0 w-9`} aria-label="More actions" aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)}>
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        <Menu open={moreOpen} onClose={() => setMoreOpen(false)} className="w-56">
                          <MenuItem onClick={() => setAllOpen(true)}>Expand all</MenuItem>
                          <MenuItem onClick={() => setAllOpen(false)}>Collapse all</MenuItem>
                          <MenuItem disabled={loadingRole || !!roleError} onClick={() => { setMoreOpen(false); applyBulk(new Set(allKeys(registry)), 'Enabled everything'); }}>Enable everything</MenuItem>
                          <MenuItem danger disabled={loadingRole || !!roleError} onClick={() => { setMoreOpen(false); applyBulk(new Set(), 'Cleared all permissions'); }}>Clear all permissions</MenuItem>
                        </Menu>
                      </div>
                    </div>
                  </div>

                  {loadingRole ? (
                    <EditorSkeleton />
                  ) : roleError ? (
                    <ErrorState message={roleError} onRetry={() => loadRole(selectedRole)} />
                  ) : (
                    <>
                      <PermissionWorkspace
                        registry={registry}
                        checkedKeys={currentPerms}
                        originalKeys={originalPerms}
                        lockedKeys={null}
                        onToggle={togglePerm}
                        onSectionToggle={setSectionPerms}
                        expandedModules={expandedModules}
                        onModuleOpen={setModuleOpen}
                        showRoleFilters={false}
                      />
                      <ActionBar
                        count={isDirty ? Math.max(1, changeCount) : 0}
                        added={added.length}
                        removed={removed.length}
                        saving={saving}
                        saveLabel={isCreating ? 'Create role' : 'Save'}
                        onDiscard={() => {
                          if (isCreating) { startCreate(); return; }
                          setForm(originalForm);
                          setCurrentPerms(new Set(originalPerms));
                          setNameError('');
                        }}
                        onReview={() => setReviewOpen(true)}
                        onSave={handleSave}
                      />
                    </>
                  )}
                </>
              )}
            </section>
          </div>
        )}

        <ReviewDrawer
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          onConfirm={async () => { if (await handleSave()) setReviewOpen(false); }}
          saving={saving}
          added={added}
          removed={removed}
          index={index}
          warnings={warnings}
        />
        <ConfirmDialog
          open={!!pending}
          title="You have unsaved changes"
          actions={[
            { label: 'Keep editing', variant: 'secondary', onClick: () => setPending(null) },
            { label: 'Discard changes', variant: 'ghostDanger', onClick: () => { const p = pending; setPending(null); p.run(); } },
            { label: saving ? 'Saving…' : 'Save and continue', variant: 'primary', disabled: saving, onClick: async () => { const p = pending; if (await handleSave()) { setPending(null); p.run(); } } },
          ]}
        >
          This role has edits that haven’t been saved. Continuing now would lose them.
        </ConfirmDialog>
        <ConfirmDialog
          open={deleteOpen}
          title={`Delete “${selectedRole?.name || ''}”?`}
          actions={[
            { label: 'Cancel', variant: 'secondary', onClick: () => setDeleteOpen(false) },
            { label: deleting ? 'Deleting…' : 'Delete role', variant: 'danger', disabled: deleting, onClick: handleDelete },
          ]}
        >
          Nobody is assigned this role. This can’t be undone.
        </ConfirmDialog>
        <Toast toast={toast} onClose={closeToast} />
      </div>
    </AdminLayout>
  );
};

export default CustomRolesPage;
