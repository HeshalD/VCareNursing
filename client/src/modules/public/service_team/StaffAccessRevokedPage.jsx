import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';

// Shown when an admin has revoked a staff member's dashboard access.
// StaffPortalGuard redirects here after detecting STAFF_PORTAL_DISABLED.
const StaffAccessRevokedPage = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-sm p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <ShieldOff className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900 mb-2">Your access has been revoked</h1>
        <p className="text-sm text-slate-500 mb-6">
          An administrator has revoked your access to the staff dashboard. If you believe this is a mistake,
          please contact the VCare admin team.
        </p>
        <div className="flex items-center justify-center gap-2">
          <Link to="/" className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">
            Go to home
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};

export default StaffAccessRevokedPage;
