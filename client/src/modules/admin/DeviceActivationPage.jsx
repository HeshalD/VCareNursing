import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '../../api/api';

const DeviceActivationPage = () => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    activation_code: '',
    password: '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.activation_code.trim() || !formData.password) {
      setError('Please fill in all fields');
      return;
    }

    try {
      setIsLoading(true);

      let deviceId = localStorage.getItem('admin_device_id');
      if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem('admin_device_id', deviceId);
      }

      await apiClient.activateDevice({
        activation_code: formData.activation_code.trim(),
        device_id: deviceId,
        password: formData.password,
      });

      setSuccess(true);
      setTimeout(() => navigate('/admin'), 2000);
    } catch (err) {
      setError(err.message || 'Device activation failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-4 sm:p-8">
      <div className="w-full max-w-md space-y-8 bg-white p-6 sm:p-8 rounded-xl shadow-lg border border-slate-200">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <ShieldCheck className="w-8 h-8 text-blue-600" />
            <h2 className="text-2xl font-bold text-slate-900">Activate This Device</h2>
          </div>
          <p className="text-slate-600 text-sm">
            Enter the activation code your SUPER_ADMIN gave you and your account password to authorize this device.
          </p>
        </div>

        {success ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm"
          >
            Device activated. Redirecting to login...
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 block">Activation Code</label>
              <input
                type="text"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all uppercase tracking-widest"
                placeholder="e.g. AB23CD45"
                value={formData.activation_code}
                onChange={(e) => setFormData({ ...formData, activation_code: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 block">Account Password</label>
              <div className="relative group">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3.5 pl-4 pr-12 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-lg shadow-lg shadow-blue-600/20 transition-all duration-200 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Activating...
                </>
              ) : (
                'Activate Device'
              )}
            </button>

            <p className="text-center text-sm text-slate-600">
              <Link to="/admin" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
                ← Back to Admin Login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

export default DeviceActivationPage;
