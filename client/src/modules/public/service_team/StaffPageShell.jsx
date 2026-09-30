import React from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import StaffSidebar from './StaffSidebar';

// Shared layout for the staff portal list pages (sidebar + header + loading/error states).
const StaffPageShell = ({ staffProfileId, title, subtitle, loading, error, children }) => (
  <div className="h-screen bg-slate-50 font-sans flex flex-col md:flex-row text-slate-900 overflow-hidden">
    <StaffSidebar staffProfileId={staffProfileId} title={title} />
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 md:px-8 py-6 md:py-8 space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white px-6 py-6 shadow-sm">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
        </header>
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 rounded-2xl border border-rose-100 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
          </div>
        ) : children}
      </div>
    </main>
  </div>
);

export const EmptyState = ({ icon: Icon, title, description }) => (
  <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-slate-400 shadow-sm">
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 mb-4">
      <Icon className="w-7 h-7 text-slate-300" />
    </div>
    <p className="text-sm font-semibold text-slate-500">{title}</p>
    {description && <p className="text-xs mt-1 text-slate-400 text-center max-w-xs">{description}</p>}
  </div>
);

export default StaffPageShell;
