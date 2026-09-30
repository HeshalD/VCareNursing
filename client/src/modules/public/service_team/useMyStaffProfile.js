import { useEffect, useState } from 'react';
import apiClient from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';

// Resolves the logged-in staff member's profile (same lookup the dashboard and bookings pages use).
export default function useMyStaffProfile() {
  const { user, loading: authLoading } = useAuth();
  const [staff, setStaff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    const userId = user?.user_id || user?.id;
    if (!userId) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = user?.staff_id
          ? await apiClient.getStaffByID(user.staff_id)
          : await apiClient.getStaffByUserID(userId);
        setStaff(res.data || null);
      } catch (err) {
        console.error('Error loading staff profile:', err);
        setError('Could not load your staff profile.');
      } finally {
        setLoading(false);
      }
    })();
  }, [user, authLoading]);

  return { staff, loading, error };
}
