import React, { useState, useEffect } from "react";
import {
  LayoutDashboard, User, DollarSign, Settings, LogOut, Briefcase,
  Home, Bell, Clock, TrendingUp, ChevronRight
} from 'lucide-react';
import { Link } from "react-router-dom";
import apiClient from "../../../api/api";
import { useAuth } from "../../../context/AuthContext";
import StaffSidebar from './StaffSidebar';

const Earnings = () => {
  const [wallet, setWallet] = useState(null);
  const [staffData, setStaffData] = useState(null);
  const [advances, setAdvances] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [amount, setAmount] = useState("");
  const [dataLoading, setDataLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    const fetchData = async () => {
      // Wait for auth
      if (authLoading) return;

      const userId = user?.user_id || user?.id;
      const staffId = user?.staff_id;

      if (!userId) {
        setDataLoading(false);
        return;
      }

      try {
        const [walletResponse, staffResponse, advancesResponse] = await Promise.all([
          apiClient.getMyWallet(),
          staffId ? apiClient.getStaffByID(staffId) : apiClient.getStaffByUserID(userId),
          apiClient.getMyAdvances()
        ]);
        
        setWallet(walletResponse.data);
        setStaffData(staffResponse.data);
        setAdvances(advancesResponse.data || []);
      } catch (err) {
        console.error("Earnings - Data fetch failed:", err);
        setError("Failed to load earnings data.");
      } finally {
        setDataLoading(false);
      }
    };

    fetchData();
  }, [user, authLoading]);

  const handleRequestAdvance = async () => {
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      setError("Please enter a valid amount.");
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      await apiClient.requestAdvance({ amount_requested: parseFloat(amount) });
      setSuccessMsg("Advance request submitted successfully.");
      setShowModal(false);
      setAmount("");

      // Refresh data
      const [walletRes, advancesRes] = await Promise.all([
        apiClient.getMyWallet(),
        apiClient.getMyAdvances()
      ]);
      setWallet(walletRes.data);
      setAdvances(advancesRes.data);
    } catch (err) {
      console.error("Advance request error:", err);
      setError(err.message || "Failed to submit advance request.");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || dataLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center text-slate-600 font-medium">Loading earnings...</div>
      </div>
    );
  }

  const displayName = staffData?.full_name || user?.name || 'Staff Member';
  const profilePicture = staffData?.profile_picture_url;

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex text-slate-900">
      <StaffSidebar staffProfileId={staffData?.staff_profile_id} />

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-8 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Earnings & Wallet</h1>
              <p className="text-slate-500 text-sm">Manage your income and advances.</p>
            </div>

            <div className="flex items-center gap-4">
              <Link to="/" className="text-indigo-600 hover:text-indigo-800 text-sm font-medium flex items-center gap-1">
                <Home className="w-4 h-4" /> Home
              </Link>
              <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
                {profilePicture ? (
                  <img src={profilePicture} alt="Profile" className="w-9 h-9 rounded-full object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center">
                    <User className="w-5 h-5 text-indigo-600" />
                  </div>
                )}
                <div className="hidden sm:block">
                  <p className="text-sm font-bold text-slate-900">{displayName}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="p-8 max-w-6xl mx-auto space-y-8">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-indigo-600 rounded-3xl p-8 text-white shadow-xl shadow-indigo-100 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-bl-full -z-0"></div>
              <div className="relative z-10">
                <p className="text-indigo-100 font-medium mb-1">Available Balance</p>
                <h2 className="text-4xl font-bold mb-4">LKR {parseFloat(wallet?.balance || 0).toLocaleString()}</h2>
                <div className="flex items-center gap-2 text-xs bg-white/20 w-fit px-3 py-1 rounded-full border border-white/30 backdrop-blur-sm">
                  Threshold: LKR {parseFloat(wallet?.advance_threshold_amount || 15000).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-4">
                <TrendingUp size={24} />
              </div>
              <p className="text-slate-500 font-medium mb-1">Total Earned</p>
              <h2 className="text-3xl font-bold">LKR 45,200</h2>
              <p className="text-xs text-emerald-600 mt-2 font-bold">+15% from last month</p>
            </div>

            <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm flex flex-col justify-center">
              <button
                onClick={() => setShowModal(true)}
                disabled={parseFloat(wallet?.balance) < parseFloat(wallet?.advance_threshold_amount)}
                className={`w-full py-4 rounded-2xl font-bold transition-all shadow-lg flex items-center justify-center gap-2 ${parseFloat(wallet?.balance) >= parseFloat(wallet?.advance_threshold_amount)
                    ? 'bg-indigo-600 text-white shadow-indigo-100 hover:bg-indigo-700 hover:-translate-y-1'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                  }`}
              >
                Request Advance <ChevronRight size={18} />
              </button>
              {parseFloat(wallet?.balance) < parseFloat(wallet?.advance_threshold_amount) && (
                <p className="text-[10px] text-slate-400 mt-3 text-center uppercase tracking-wider font-bold">
                  Balance must be &gt; LKR {parseFloat(wallet?.advance_threshold_amount).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          {/* Advance History */}
          <section className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Clock className="text-indigo-500" size={20} /> Advance History
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-50">
                    <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Date</th>
                    <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Amount</th>
                    <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {advances.length > 0 ? (
                    advances.map((adv) => (
                      <tr key={adv.advance_id} className="group hover:bg-slate-50/50 transition-colors">
                        <td className="py-5 text-sm text-slate-600 font-medium">
                          {new Date(adv.requested_at).toLocaleDateString()}
                        </td>
                        <td className="py-5 text-sm text-slate-900 font-bold">
                          LKR {parseFloat(adv.amount_requested).toLocaleString()}
                        </td>
                        <td className="py-5 text-center">
                          <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${adv.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' :
                              adv.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                                'bg-amber-100 text-amber-700'
                            }`}>
                            {adv.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="3" className="py-12 text-center text-slate-400 italic">No history found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>

      {/* Advance Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl">
            <h3 className="text-2xl font-bold text-slate-900 mb-2">Request Advance</h3>
            <p className="text-slate-500 text-sm mb-6">Enter the amount you'd like to request from your available balance.</p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Amount (LKR)</label>
                <input
                  type="number"
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xl font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRequestAdvance}
                  disabled={submitting}
                  className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Earnings;