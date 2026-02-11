import React from 'react';
import { Check, X, FileText, Download, Eye, ShieldAlert } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';

const WorkerVerification = () => {
  return (
    <AdminLayout
      title="Worker Verification"
      subtitle="Verify identity documents and qualifications of new workers."
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">

        {/* Verification Request Card */}
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-6 flex-1">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <img src={`https://i.pravatar.cc/150?u=${i + 10}`} alt="Worker" className="w-12 h-12 rounded-xl object-cover" />
                  <div>
                    <h3 className="font-bold text-slate-900">Nimali Perera</h3>
                    <p className="text-sm text-slate-500">Registered Nurse</p>
                  </div>
                </div>
                <span className="bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full text-xs font-bold border border-amber-100">
                  Pending
                </span>
              </div>

              <div className="space-y-3 mb-6">
                <div className="p-3 bg-slate-50 rounded-lg flex items-center justify-between group cursor-pointer hover:bg-blue-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-slate-400 group-hover:text-blue-500" />
                    <div>
                      <p className="font-medium text-sm text-slate-700 group-hover:text-blue-700">NIC Copy (Front/Back)</p>
                      <p className="text-xs text-slate-400">PDF • 2.4 MB</p>
                    </div>
                  </div>
                  <Eye className="w-4 h-4 text-slate-400 group-hover:text-blue-500" />
                </div>

                <div className="p-3 bg-slate-50 rounded-lg flex items-center justify-between group cursor-pointer hover:bg-blue-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-slate-400 group-hover:text-blue-500" />
                    <div>
                      <p className="font-medium text-sm text-slate-700 group-hover:text-blue-700">Nursing Certificate</p>
                      <p className="text-xs text-slate-400">JPG • 1.1 MB</p>
                    </div>
                  </div>
                  <Eye className="w-4 h-4 text-slate-400 group-hover:text-blue-500" />
                </div>
                <div className="p-3 bg-slate-50 rounded-lg flex items-center justify-between group cursor-pointer hover:bg-blue-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-slate-400 group-hover:text-blue-500" />
                    <div>
                      <p className="font-medium text-sm text-slate-700 group-hover:text-blue-700">Police Report</p>
                      <p className="text-xs text-slate-400">PDF • 5.0 MB</p>
                    </div>
                  </div>
                  <Eye className="w-4 h-4 text-slate-400 group-hover:text-blue-500" />
                </div>
              </div>

              <div className="bg-red-50 p-3 rounded-lg flex gap-3 text-red-700 text-sm mb-4">
                <ShieldAlert className="w-5 h-5 flex-shrink-0" />
                <p>Automated check flagged a minor discrepancy in name spelling. Please verify manually.</p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 grid grid-cols-2 gap-3">
              <button className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all">
                <X className="w-4 h-4" /> Reject
              </button>
              <button className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white font-bold rounded-xl hover:bg-green-500 shadow-lg shadow-green-600/20 transition-all">
                <Check className="w-4 h-4" /> Approve
              </button>
            </div>
          </div>
        ))}

      </div>
    </AdminLayout>
  );
};

export default WorkerVerification;
