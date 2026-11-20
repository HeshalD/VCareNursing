import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users, KeySquare, Search, Zap, ChevronDown, MoreHorizontal, ShieldCheck } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { formatMobileNumber } from '../../../utils/phoneFormat';
import {
  ActionBar,
  Avatar,
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
import { allKeys, buildIndex, dependencyFor, diffSets, mergeKeys, permLabel, setsEqual } from './permissionUtils';

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

const fixedRoleColor = () => 'bg-slate-100 text-slate-700';

// A staff member can hold several roles at once (e.g. Coordinator + a custom
// role). The registry sends the full `roles` array — each entry carries its own
// custom_role_name when applicable.
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

const roleDisplayLabel = (r) => (r.role === 'CUSTOM_ROLE' ? r.custom_role_name || 'Custom Role' : fixedRoleLabel(r.role));

const RoleChip = ({ r }) => (
  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${fixedRoleColor(r.role)}`}>
    {r.role === 'CUSTOM_ROLE' && <KeySquare className="w-3 h-3" />}
    {roleDisplayLabel(r)}
  </span>
);

const StaffPermissionsPage = () => {
  const [searchParams] = useSearchParams();
  const [users, setUsers] = useState([]);
  const [registry, setRegistry] = useState({});
  const [templates, setTemplates] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);
  const [currentPerms, setCurrentPerms] = useState(new Set()); // direct only
  const [originalPerms, setOriginalPerms] = useState(new Set());
  const [rolePerms, setRolePerms] = useState(new Set());
  const [effCounts, setEffCounts] = useState({});
  const [lastChanged, setLastChanged] = useState(null);
  const [loadingInit, setLoadingInit] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [permsError, setPermsError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [expandedModules, setExpandedModules] = useState({});
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [sort, setSort] = useState('name');
  const [pendingUser, setPendingUser] = useState(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [tplMode, setTplMode] = useState('add');
  const [moreOpen, setMoreOpen] = useState(false);
  const reqRef = useRef(0);
  const preselected = useRef(false);

  const index = useMemo(() => buildIndex(registry), [registry]);
  const closeToast = useCallback(() => setToast(null), []);

  const loadInit = useCallback(() => {
    setLoadingInit(true);
    setLoadError(null);
    Promise.all([apiClient.getPermissionsRegistry(), apiClient.getAdminUsers()])
      .then(([regRes, usersRes]) => {
        setRegistry(regRes.registry || {});
        setTemplates(regRes.templates || {});
        setUsers(usersRes.users || []);
      })
      .catch((err) => setLoadError(err.message || 'Failed to load the permission manager.'))
      .finally(() => setLoadingInit(false));
  }, []);

  useEffect(() => {
    loadInit();
  }, [loadInit]);

  const loadUser = async (user) => {
    const id = ++reqRef.current;
    setSelectedUser(user);
    setLoadingPerms(true);
    setPermsError(null);
    setLastChanged(null);
    try {
      const res = await apiClient.getUserPermissions(user.user_id);
      if (id !== reqRef.current) return;
      const role = new Set(res.role_permissions || []);
      // Role-granted keys are never held as direct permissions.
      const direct = new Set((res.permissions || []).map((p) => p.permission_key).filter((k) => !role.has(k)));
      setCurrentPerms(direct);
      setOriginalPerms(new Set(direct));
      setRolePerms(role);
      setEffCounts((prev) => ({ ...prev, [user.user_id]: new Set([...direct, ...role]).size }));
      const by = res.last_changed_by || res.updated_by_name;
      const at = res.last_changed_at || res.updated_at;
      setLastChanged(by || at ? { by, at } : null);
    } catch (err) {
      if (id === reqRef.current) setPermsError(err.message || 'Failed to load permissions.');
    } finally {
      if (id === reqRef.current) setLoadingPerms(false);
    }
  };

  // Deep link from the Custom Roles page: /admin/permissions?user=<id>
  useEffect(() => {
    const wanted = searchParams.get('user');
    if (!wanted || preselected.current || users.length === 0) return;
    const u = users.find((x) => String(x.user_id) === wanted);
    if (u) {
      preselected.current = true;
      loadUser(u);
    }
  }, [users, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const { added, removed } = useMemo(() => diffSets(originalPerms, currentPerms), [originalPerms, currentPerms]);
  const changeCount = added.length + removed.length;
  const isDirty = !!selectedUser && changeCount > 0;
  const effectivePerms = useMemo(() => new Set([...currentPerms, ...rolePerms]), [currentPerms, rolePerms]);
  const originalEffective = useMemo(() => new Set([...originalPerms, ...rolePerms]), [originalPerms, rolePerms]);
  const selectedRoles = selectedUser ? getUserRoles(selectedUser) : [];
  const roleSources = selectedRoles.map(roleDisplayLabel).join(' + ');
  const isSuperAdmin = selectedRoles.some((r) => r.role === 'SUPER_ADMIN');

  const handleSave = async () => {
    if (!selectedUser) return false;
    setSaving(true);
    try {
      const payload = [...currentPerms].filter((k) => !rolePerms.has(k)); // never save role-granted keys as direct
      await apiClient.setUserPermissions(selectedUser.user_id, payload);
      setCurrentPerms(new Set(payload));
      setOriginalPerms(new Set(payload));
      setEffCounts((prev) => ({ ...prev, [selectedUser.user_id]: new Set([...payload, ...rolePerms]).size }));
      setUsers((prev) => prev.map((u) => (u.user_id === selectedUser.user_id ? { ...u, permission_count: payload.length } : u)));
      setToast({ type: 'success', text: 'Permissions saved.' });
      return true;
    } catch (err) {
      setToast({ type: 'error', text: err.message || 'Failed to save permissions.' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const requestSelect = (user) => {
    if (selectedUser?.user_id === user.user_id) return;
    if (isDirty) setPendingUser(user);
    else loadUser(user);
  };

  const togglePerm = (key) => {
    if (rolePerms.has(key)) return; // granted via role — edit the role to change it
    const turningOn = !currentPerms.has(key);
    setCurrentPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    if (turningOn) {
      const dep = dependencyFor(key, index, effectivePerms);
      if (dep) {
        setToast({
          type: 'info',
          text: `${permLabel(index.byKey.get(key))} usually needs ${dep.label}, which is off.`,
          actionLabel: 'Enable View',
          onAction: () => setCurrentPerms((prev) => new Set([...prev, dep.key])),
        });
      }
    }
  };

  const setSectionPerms = (keys, checked) => {
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

  // Bulk action with an Undo toast.
  const applyBulk = (next, text) => {
    const prev = currentPerms;
    setCurrentPerms(next);
    setToast({ type: 'info', text, actionLabel: 'Undo', onAction: () => setCurrentPerms(prev) });
  };

  const applyKeys = (keys, label) => {
    const next = mergeKeys(currentPerms, keys, tplMode, rolePerms);
    setTplOpen(false);
    if (setsEqual(next, currentPerms)) {
      setToast({ type: 'info', text: `${label}: no change.` });
      return;
    }
    applyBulk(next, `Applied ${label}`);
  };

  const pickColleague = async (id) => {
    const colleague = users.find((u) => String(u.user_id) === String(id));
    if (!colleague) return;
    try {
      const res = await apiClient.getUserPermissions(colleague.user_id);
      const keys = [...(res.permissions || []).map((p) => p.permission_key), ...(res.role_permissions || [])];
      applyKeys(keys, `${colleague.full_name}'s access`);
    } catch (err) {
      setToast({ type: 'error', text: err.message || 'Could not copy permissions.' });
    }
  };

  const setModuleOpen = (mod, open) => setExpandedModules((prev) => ({ ...prev, [mod]: open }));
  const setAllOpen = (open) => {
    setExpandedModules(Object.fromEntries(Object.keys(registry).map((m) => [m, open])));
    setMoreOpen(false);
  };

  const roleOptions = useMemo(
    () => [...new Set(users.flatMap((u) => getUserRoles(u).map(roleDisplayLabel)))].sort(),
    [users]
  );
  const countOf = (u) => effCounts[u.user_id] ?? u.effective_permission_count ?? u.permission_count ?? 0;
  const shownUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users
      .filter((u) => {
        const labels = getUserRoles(u).map(roleDisplayLabel);
        if (roleFilter !== 'all' && !labels.includes(roleFilter)) return false;
        if (!q) return true;
        return (
          (u.full_name || '').toLowerCase().includes(q) ||
          String(u.mobile_number || '').toLowerCase().includes(q) ||
          labels.some((l) => l.toLowerCase().includes(q))
        );
      })
      .sort((a, b) =>
        sort === 'perms' ? countOf(b) - countOf(a) : (a.full_name || '').localeCompare(b.full_name || '')
      );
  }, [users, userSearch, roleFilter, sort, effCounts]); // eslint-disable-line react-hooks/exhaustive-deps

  const warnings = [];
  if (isDirty && roleSources) warnings.push({ tone: 'amber', text: 'Only direct permissions are changed here. Role-granted boxes stay as they are.' });

  return (
    <AdminLayout title="Staff Permissions" subtitle="Manage what each internal staff member can access and do">
      <div className="perm-motion text-sm text-slate-900">
        {loadError ? (
          <ErrorState message={loadError} onRetry={loadInit} />
        ) : (
          <div className="flex gap-5 items-start">
            {/* ===== LEFT LIST ===== */}
            <aside className="w-80 shrink-0 bg-white border border-slate-200 rounded-lg overflow-hidden sticky top-3 max-h-[calc(100vh-2rem)] flex flex-col">
              <div className="p-4 border-b border-slate-100 space-y-3">
                <div>
                  <div className="font-semibold">Internal staff</div>
                  <div className="text-xs text-slate-600">{loadingInit ? 'Loading…' : `${users.length} account${users.length !== 1 ? 's' : ''}`}</div>
                </div>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    aria-label="Search staff"
                    className="w-full h-9 rounded-md border border-slate-300 pl-9 pr-3 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none"
                    placeholder="Search name, number or role"
                  />
                </div>
                <div className="flex gap-2">
                  <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role" className="flex-1 min-w-0 h-8 rounded-md border border-slate-300 px-2 text-xs bg-white">
                    <option value="all">All roles</option>
                    {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort staff" className="flex-1 min-w-0 h-8 rounded-md border border-slate-300 px-2 text-xs bg-white">
                    <option value="name">Sort: Name A–Z</option>
                    <option value="perms">Sort: Most permissions</option>
                  </select>
                </div>
              </div>
              <div className="overflow-y-auto">
                {loadingInit ? (
                  <ListSkeleton />
                ) : users.length === 0 ? (
                  <div className="text-center p-6 text-slate-600">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="font-medium text-slate-800">No staff accounts yet</p>
                    <p className="text-xs mt-1">Create an internal staff member with a login account to manage their permissions here.</p>
                  </div>
                ) : shownUsers.length === 0 ? (
                  <div className="text-center p-6 text-slate-600">
                    <p className="font-medium text-slate-800">No staff match.</p>
                    <button type="button" className={`${btnSecondary} mt-3`} onClick={() => { setUserSearch(''); setRoleFilter('all'); }}>
                      Clear search and filters
                    </button>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {shownUsers.map((user) => {
                      const roles = getUserRoles(user);
                      const selected = selectedUser?.user_id === user.user_id;
                      const n = countOf(user);
                      return (
                        <li key={user.user_id}>
                          <button type="button" onClick={() => requestSelect(user)} aria-current={selected} className={`w-full flex gap-3 p-3 px-4 text-left ${selected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                            <Avatar name={user.full_name} />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2 font-semibold">
                                <span className="truncate">{user.full_name}</span>
                                {selected && isDirty && <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" title="Unsaved changes" />}
                              </span>
                              <span className="flex flex-wrap gap-1 my-1">
                                {roles.slice(0, 2).map((r, i) => <RoleChip key={`${r.role}-${r.custom_role_id || ''}-${i}`} r={r} />)}
                                {roles.length > 2 && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">+{roles.length - 2}</span>}
                              </span>
                              <span className="text-xs text-slate-600">{n} permission{n !== 1 ? 's' : ''}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </aside>

            {/* ===== EDITOR ===== */}
            <section className="flex-1 min-w-0 space-y-4">
              {!selectedUser ? (
                <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-slate-600">
                  <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="font-semibold text-slate-800">Select a staff member</p>
                  <p className="mt-1">Choose from the list to manage their permissions.</p>
                </div>
              ) : (
                <>
                  <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-wrap items-start gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-[280px]">
                      <Avatar name={selectedUser.full_name} size="lg" />
                      <div>
                        <div className="text-xl font-semibold">{selectedUser.full_name}</div>
                        <div className="text-slate-600">{formatMobileNumber(selectedUser.mobile_number)} · {roleSources || '—'}</div>
                        {lastChanged && (
                          <div className="text-xs text-slate-600 mt-2">
                            Last changed{lastChanged.by ? ` by ${lastChanged.by}` : ''}{lastChanged.at ? ` · ${new Date(lastChanged.at).toLocaleString()}` : ''}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="relative">
                        <button type="button" className={btnSecondary} aria-haspopup="menu" aria-expanded={tplOpen} onClick={() => setTplOpen((o) => !o)} disabled={loadingPerms || !!permsError}>
                          <Zap className="w-4 h-4" /> Templates <ChevronDown className="w-4 h-4" />
                        </button>
                        <Menu open={tplOpen} onClose={() => setTplOpen(false)}>
                          <TemplateMenu
                            templates={templates}
                            mode={tplMode}
                            onMode={setTplMode}
                            current={currentPerms}
                            locked={rolePerms}
                            onApply={applyKeys}
                            sources={users.filter((u) => u.user_id !== selectedUser.user_id).map((u) => ({ id: String(u.user_id), label: u.full_name }))}
                            sourceHeading="Copy from a colleague"
                            onPickSource={pickColleague}
                          />
                        </Menu>
                      </div>
                      <div className="relative">
                        <button type="button" className={`${btnSecondary} !px-0 w-9`} aria-label="More actions" aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)}>
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        <Menu open={moreOpen} onClose={() => setMoreOpen(false)} className="w-60">
                          <MenuItem onClick={() => setAllOpen(true)}>Expand all</MenuItem>
                          <MenuItem onClick={() => setAllOpen(false)}>Collapse all</MenuItem>
                          <MenuItem
                            disabled={loadingPerms || !!permsError}
                            onClick={() => { setMoreOpen(false); applyBulk(mergeKeys(currentPerms, allKeys(registry), 'add', rolePerms), 'Enabled everything (role-granted boxes skipped)'); }}
                          >
                            Enable everything
                          </MenuItem>
                          <MenuItem
                            danger
                            disabled={loadingPerms || !!permsError}
                            onClick={() => { setMoreOpen(false); applyBulk(new Set(), 'Cleared direct permissions'); }}
                          >
                            Clear direct permissions
                          </MenuItem>
                        </Menu>
                      </div>
                    </div>
                  </div>

                  {loadingPerms ? (
                    <EditorSkeleton />
                  ) : permsError ? (
                    <ErrorState message={permsError} onRetry={() => loadUser(selectedUser)} />
                  ) : (
                    <>
                      {isSuperAdmin && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 text-slate-800 px-4 py-2.5 text-[13px]">
                          <b>Super Admin.</b> Everything is granted by the role, so there is nothing to set here.
                        </div>
                      )}
                      {rolePerms.size > 0 && !isSuperAdmin && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 text-slate-800 px-4 py-2.5 text-[13px]">
                          Locked boxes come from <b>{roleSources}</b>. Hover one to see the role. Edit that role to change it.
                        </div>
                      )}
                      <PermissionWorkspace
                        registry={registry}
                        checkedKeys={effectivePerms}
                        originalKeys={originalEffective}
                        lockedKeys={rolePerms}
                        roleSources={roleSources}
                        onToggle={togglePerm}
                        onSectionToggle={setSectionPerms}
                        expandedModules={expandedModules}
                        onModuleOpen={setModuleOpen}
                      />
                      <ActionBar
                        count={changeCount}
                        added={added.length}
                        removed={removed.length}
                        saving={saving}
                        onDiscard={() => setCurrentPerms(new Set(originalPerms))}
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
          open={!!pendingUser}
          title={`You have ${changeCount} unsaved change${changeCount !== 1 ? 's' : ''}`}
          actions={[
            { label: 'Keep editing', variant: 'secondary', onClick: () => setPendingUser(null) },
            { label: 'Discard changes', variant: 'ghostDanger', onClick: () => { const u = pendingUser; setPendingUser(null); loadUser(u); } },
            { label: saving ? 'Saving…' : 'Save and continue', variant: 'primary', disabled: saving, onClick: async () => { const u = pendingUser; if (await handleSave()) { setPendingUser(null); loadUser(u); } } },
          ]}
        >
          Changes to {selectedUser?.full_name} haven’t been saved. Switching staff now would lose them.
        </ConfirmDialog>
        <Toast toast={toast} onClose={closeToast} />
      </div>
    </AdminLayout>
  );
};

export default StaffPermissionsPage;
