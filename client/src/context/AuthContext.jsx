import React, { createContext, useContext, useState, useEffect } from 'react';
import { getUserFromToken, isAuthenticated } from '../utils/auth';
import apiClient from '../api/api';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check authentication status on component mount
    const checkAuth = async () => {
      try {
        if (isAuthenticated()) {
          const decodedUser = getUserFromToken();

          // If token payload doesn't include email, try fetching enriched user data
          if (decodedUser && !decodedUser.email) {
            try {
              const full = await apiClient.getUnifiedOverview();
              // prefer API response shape if available, otherwise fallback to decoded token
              setUser(full?.data || full || decodedUser);
            } catch (err) {
              console.error('Failed to fetch full user profile:', err);
              setUser(decodedUser);
            }
          } else {
            setUser(decodedUser);
          }
        } else {
          // Clear invalid token
          localStorage.removeItem('token');
          setUser(null);
        }
      } catch (error) {
        console.error('Auth check error:', error);
        localStorage.removeItem('token');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = (token, userData) => {
    localStorage.setItem('token', token);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const value = {
    user,
    login,
    logout,
    loading,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
