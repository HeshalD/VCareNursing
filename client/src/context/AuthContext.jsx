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
          const token = localStorage.getItem('token');
          apiClient.setToken(token); // Sync token with singleton
          const decodedUser = getUserFromToken();

          // If token payload doesn't include email, try fetching enriched user data
          if (decodedUser && !decodedUser.email) {
            try {
              const full = await apiClient.getUnifiedOverview();
              // prefer API response shape if available, otherwise fallback to decoded token
              setUser(full?.data || full || decodedUser);
            } catch (err) {
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
      console.log('AuthContext - User data stored:', mergedUserData);
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
