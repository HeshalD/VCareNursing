import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import apiClient from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';

// Wraps every staff-dashboard route. The backend answers the caller's own status
// lookup with portal_access_disabled when an admin has revoked their dashboard access,
// so a page refresh (which re-mounts this guard) sends them to the revoked page.
const StaffPortalGuard = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState('checking'); // checking | ok | disabled

  const hasUser = !!user;

  useEffect(() => {
    if (authLoading || !hasUser) return;
    let cancelled = false;
    apiClient.getMyStaffPortalStatus()
      .then((res) => { if (!cancelled) setState(res?.data?.portal_access_disabled ? 'disabled' : 'ok'); })
      .catch((err) => {
        if (cancelled) return;
        // Any other failure is left to the page itself to report.
        setState(err?.code === 'STAFF_PORTAL_DISABLED' ? 'disabled' : 'ok');
      });
    return () => { cancelled = true; };
  }, [authLoading, hasUser]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/login" replace />;

  if (state === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  if (state === 'disabled') return <Navigate to="/staff-access-revoked" replace />;

  return children;
};

export default StaffPortalGuard;
