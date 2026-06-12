import React, { useState } from 'react';
import { 
  Settings, Lock, Bell, Shield, Eye, EyeOff, Save, CheckCircle
} from 'lucide-react';
import StaffSidebar from './StaffSidebar';
import { useAuth } from '../../../context/AuthContext';
import apiClient from '../../../api/api';

const StaffSettings = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: ''
  });
  const [showPass, setShowPass] = useState(false);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      setMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    
    setLoading(true);
    try {
      await apiClient.changeStaffPassword({
        current_password: passwords.current,
        new_password: passwords.new
      });
      setMessage({ type: 'success', text: 'Password updated successfully!' });
      setPasswords({ current: '', new: '', confirm: '' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Failed to update password.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen bg-slate-50 font-sans flex text-slate-900 overflow-hidden">
      <StaffSidebar />

      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-8">
          <header>
            <h1 className="text-3xl font-bold text-slate-800">Settings</h1>
            <p className="text-slate-500">Manage your account preferences and security.</p>
          </header>

          {message.text && (
            <div className={`p-4 rounded-2xl flex items-center gap-3 ${
              message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'
            }`}>
              {message.type === 'success' && <CheckCircle size={20} />}
              <span className="font-medium">{message.text}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Security Section */}
            <section className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
              <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                <Lock className="text-indigo-500" size={20} /> Security
              </h3>
              
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Current Password</label>
                  <div className="relative">
                    <input 
                      type={showPass ? "text" : "password"}
                      className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={passwords.current}
                      onChange={(e) => setPasswords({...passwords, current: e.target.value})}
                      required
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600"
                    >
                      {showPass ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">New Password</label>
                  <input 
                    type="password"
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={passwords.new}
                    onChange={(e) => setPasswords({...passwords, new: e.target.value})}
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Confirm New Password</label>
                  <input 
                    type="password"
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={passwords.confirm}
                    onChange={(e) => setPasswords({...passwords, confirm: e.target.value})}
                    required
                  />
                </div>

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full bg-indigo-600 text-white p-4 rounded-2xl font-bold shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {loading ? 'Updating...' : <><Save size={20} /> Update Password</>}
                </button>
              </form>
            </section>

            {/* Preferences Section */}
            <div className="space-y-8">
              <section className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <Bell className="text-indigo-500" size={20} /> Notifications
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div>
                      <p className="font-bold text-slate-800">Email Alerts</p>
                      <p className="text-xs text-slate-500">Receive shift assignments via email</p>
                    </div>
                    <div className="w-12 h-6 bg-indigo-600 rounded-full relative cursor-pointer">
                      <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div>
                      <p className="font-bold text-slate-800">WhatsApp Updates</p>
                      <p className="text-xs text-slate-500">Get instant booking alerts</p>
                    </div>
                    <div className="w-12 h-6 bg-slate-200 rounded-full relative cursor-pointer">
                      <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full"></div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <Shield className="text-indigo-500" size={20} /> Privacy
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Your profile information is only visible to registered clients and VCare coordinators. 
                  Documents are strictly confidential and used for verification only.
                </p>
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default StaffSettings;