import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
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
  const authCheckedRef = useRef(false);

  useEffect(() => {
    // Prevent double execution in React Strict Mode
    if (authCheckedRef.current) return;
    authCheckedRef.current = true;

    // Check authentication status on component mount
    const checkAuth = async () => {
      try {
        if (isAuthenticated()) {
          const token = localStorage.getItem('token');
          apiClient.setToken(token); // Sync token with singleton
          const decodedUser = getUserFromToken();
          
          if (decodedUser) {
            // Set user immediately from JWT token
            setUser(decodedUser);
            
            // Optionally try to enrich user data in background
            try {
              const full = await apiClient.getUnifiedOverview();
              // Only update user if the API response contains actual user data
              if (full?.data && typeof full.data === 'object' && !Array.isArray(full.data)) {
                setUser(full.data);
              }
            } catch (err) {
              // Silently ignore API errors, user is already set from JWT
            }
          } else {
            // Clear invalid token
            localStorage.removeItem('token');
            setUser(null);
          }
        } else {
          // Clear invalid token
          localStorage.removeItem('token');
          setUser(null);
        }
      } catch (error) {
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
    
    // Extract user data from JWT payload to get full_name and other JWT fields
    try {
      const jwtPayload = JSON.parse(atob(token.split('.')[1]));
      // Merge JWT payload with API response data, giving priority to JWT fields
      const mergedUserData = {
        ...userData,
        ...jwtPayload
      };
      setUser(mergedUserData);
    } catch (error) {
      // Fallback to original userData if JWT parsing fails
      setUser(userData);
    }
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
