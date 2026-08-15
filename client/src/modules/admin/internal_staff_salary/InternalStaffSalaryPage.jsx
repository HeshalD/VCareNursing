import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, Settings2, X, Plus } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const STATUS_TABS = ['All', 'DRAFT', 'FINALIZED'];
const STATUS_LABELS = { All: 'All', DRAFT: 'Draft', FINALIZED: 'Finalized' };

const SHEET_STATUS_CONFIG = {
  DRAFT:     { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Draft' },
  FINALIZED: { text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Finalized' },
};

const money = (value) =>
  `LKR ${parseFloat(value || 0).toLocaleString('en-LK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const monthLabel = (month) => {
  if (!month) return '—';
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const SectionHeader = ({ title }) => (
  <div className="px-5 pt-5 pb-2.5 border-b border-slate-100">
    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</p>
  </div>
);

const inputCls =
  'w-full px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:border-blue-500 transition-colors border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:ring-blue-100';

const SheetStatusBadge = ({ status }) => {
  const cfg = SHEET_STATUS_CONFIG[status] || SHEET_STATUS_CONFIG.DRAFT;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.text} ${cfg.bg} ${cfg.border}`}>
      {cfg.label}
    </span>
  );
};

const PresetRow = ({ preset, onToggle, onRename }) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(preset.name);

  const save = async () => {
    if (name.trim() && name.trim() !== preset.name) await onRename(preset.id, name.trim());
    setEditing(false);
  };

  return (
    <div className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border ${preset.is_active ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'}`}>
      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          className="flex-1 text-sm border border-blue-300 rounded px-2 py-1 outline-none"
        />
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="flex-1 text-left text-sm text-slate-700">
          {preset.name}
        </button>
      )}
      <button
        type="button"
        onClick={() => onToggle(preset.id, !preset.is_active)}
        className={`text-xs font-medium px-2 py-1 rounded-md transition-colors ${
          preset.is_active ? 'text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'
        }`}
      >
        {preset.is_active ? 'Deactivate' : 'Activate'}
      </button>
    </div>
  );
};

const InternalStaffSalaryPage = () => {
  const navigate = useNavigate();
  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('All');
  const [search, setSearch] = useState('');

  const [showPresets, setShowPresets] = useState(false);
  const [presets, setPresets] = useState([]);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [presetTab, setPresetTab] = useState('ALLOWANCE');
  const [newPresetName, setNewPresetName] = useState('');
  const [addingPreset, setAddingPreset] = useState(false);

  const fetchSheets = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.listSalarySheets({
        ...(activeTab !== 'All' ? { status: activeTab } : {}),
        ...(search ? { search } : {}),
      });
      setSheets(res.sheets || []);
    } catch (err) {
      console.error('fetchSheets error:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, search]);

  useEffect(() => { fetchSheets(); }, [fetchSheets]);

  const openPresets = async () => {
    setShowPresets(true);
    setPresetsLoading(true);
    try {
      const res = await apiClient.listSalaryPresets();
      setPresets(res.presets || []);
    } catch (err) {
      console.error('openPresets error:', err);
    } finally {
      setPresetsLoading(false);
    }
  };

  const addPreset = async () => {
    if (!newPresetName.trim()) return;
    setAddingPreset(true);
    try {
      const res = await apiClient.createSalaryPreset({ name: newPresetName.trim(), type: presetTab });
      setPresets((p) => [...p, res.preset]);
      setNewPresetName('');
    } catch (err) {
      console.error('addPreset error:', err);
    } finally {
      setAddingPreset(false);
    }
  };

  const togglePreset = async (id, isActive) => {
    try {
      const res = await apiClient.updateSalaryPreset(id, { is_active: isActive });
      setPresets((p) => p.map((x) => (x.id === id ? res.preset : x)));
    } catch (err) {
      console.error('togglePreset error:', err);
    }
  };

  const renamePreset = async (id, name) => {
    try {
      const res = await apiClient.updateSalaryPreset(id, { name });
      setPresets((p) => p.map((x) => (x.id === id ? res.preset : x)));
    } catch (err) {
      console.error('renamePreset error:', err);
    }
  };

  const visiblePresets = presets.filter((p) => p.type === presetTab);

  return (
    <AdminLayout
      title="Internal Staff Salary"
      subtitle="Build, preview, and finalize monthly salary sheets."
      actions={
        <button
          onClick={openPresets}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
        >
          <Settings2 className="w-4 h-4" />
          Salary Presets
        </button>
      }
    >
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-1 w-fit flex-wrap">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {STATUS_LABELS[tab]}
            </button>
          ))}
        </div>

        <div className="relative sm:ml-auto">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by staff name…"
            className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none w-64"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Staff</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Month</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Net Payable</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Finalized On</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sheets.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-16 text-slate-400 text-sm">
                      No salary sheets found. Build one from a staff member's profile.
                    </td>
                  </tr>
                ) : sheets.map((sheet) => (
                  <tr
                    key={sheet.id}
                    onClick={() => navigate(`/admin/internal-staff-salary/build/${sheet.id}`)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-semibold text-slate-900">{sheet.staff_name}</td>
                    <td className="px-4 py-3 text-slate-600">{monthLabel(sheet.month)}</td>
                    <td className="px-4 py-3"><SheetStatusBadge status={sheet.status} /></td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">{money(sheet.net_payable)}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {sheet.finalized_at ? new Date(sheet.finalized_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && sheets.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
            Showing {sheets.length} salary sheet{sheets.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Presets Drawer */}
      {showPresets && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setShowPresets(false)} />
          <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 shrink-0">
              <h2 className="text-base font-semibold text-gray-900">Salary Presets</h2>
              <button type="button" onClick={() => setShowPresets(false)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="px-5 pt-5">
                <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-1 w-fit">
                  {['ALLOWANCE', 'DEDUCTION'].map((t) => (
                    <button
                      key={t}
                      onClick={() => setPresetTab(t)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                        presetTab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {t === 'ALLOWANCE' ? 'Allowances' : 'Deductions'}
                    </button>
                  ))}
                </div>
              </div>

              <SectionHeader title={presetTab === 'ALLOWANCE' ? 'Allowance Presets' : 'Deduction Presets'} />
              <div className="px-5 pt-4 pb-6 space-y-2">
                {presetsLoading ? (
                  <div className="flex items-center justify-center h-24">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                  </div>
                ) : (
                  <>
                    {visiblePresets.length === 0 && (
                      <p className="text-sm text-slate-400 text-center py-6">No {presetTab.toLowerCase()} presets yet.</p>
                    )}
                    {visiblePresets.map((preset) => (
                      <PresetRow key={preset.id} preset={preset} onToggle={togglePreset} onRename={renamePreset} />
                    ))}

                    <div className="flex items-center gap-2 pt-2">
                      <input
                        value={newPresetName}
                        onChange={(e) => setNewPresetName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addPreset()}
                        placeholder={`e.g. ${presetTab === 'ALLOWANCE' ? 'Transport Allowance' : 'Salary Advance'}`}
                        className={inputCls}
                      />
                      <button
                        type="button"
                        onClick={addPreset}
                        disabled={addingPreset || !newPresetName.trim()}
                        className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50 flex-shrink-0"
                      >
                        {addingPreset ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
};

export default InternalStaffSalaryPage;
