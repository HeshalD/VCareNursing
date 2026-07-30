import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient from '../api/api';

const AdminAuthContext = createContext();

const parseRoles = (rawRole) => {
  if (Array.isArray(rawRole)) return rawRole;
  if (typeof rawRole === 'string') return rawRole.replace(/[{}]/g, '').split(',').map((r) => r.trim()).filter(Boolean);
  return [];
};

export const useAdminAuth = () => {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
};

export const AdminAuthProvider = ({ children }) => {
  const [adminToken, setAdminToken] = useState(null);
  const [adminUser, setAdminUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [permissions, setPermissions] = useState(new Set());
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

  const loadPermissions = useCallback(async (token) => {
    setPermissionsLoaded(false);
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setIsSuperAdmin(parseRoles(payload.role).includes('SUPER_ADMIN'));
      const res = await apiClient.getMyPermissions();
      setPermissions(new Set(res.permissions || []));
    } catch (error) {
      console.error('Error loading admin permissions:', error);
      setPermissions(new Set());
    } finally {
      setPermissionsLoaded(true);
    }
  }, []);

  useEffect(() => {
    // Check for existing admin session on mount
    const token = localStorage.getItem('adminToken');
    const user = localStorage.getItem('adminUser');

    if (token && user) {
      try {
        const parsedUser = JSON.parse(user);
        setAdminToken(token);
        setAdminUser(parsedUser);
        loadPermissions(token);
      } catch (error) {
        console.error('Error parsing admin user data:', error);
        // Clear corrupted data
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
      }
    }
    setIsLoading(false);
  }, [loadPermissions]);

  const adminLogin = (token, user) => {
    setAdminToken(token);
    setAdminUser(user);
    localStorage.setItem('adminToken', token);
    localStorage.setItem('adminUser', JSON.stringify(user));
    loadPermissions(token);
  };

  const adminLogout = () => {
    setAdminToken(null);
    setAdminUser(null);
    setPermissions(new Set());
    setIsSuperAdmin(false);
    setPermissionsLoaded(false);
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
  };

  const hasPermission = (key) => {
    if (!key) return true;
    return isSuperAdmin || permissions.has(key);
  };

  const value = {
    adminToken,
    adminUser,
    isLoading,
    adminLogin,
    adminLogout,
    isAuthenticated: !!adminToken,
    permissions,
    isSuperAdmin,
    permissionsLoaded,
    hasPermission,
  };

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
};
