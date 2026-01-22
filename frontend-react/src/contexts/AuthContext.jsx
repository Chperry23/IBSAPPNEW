import { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const AuthContext = createContext(null);

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
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is logged in from localStorage
    const checkAuth = async () => {
      try {
        const savedUser = localStorage.getItem('cabinet-pm-user');
        if (savedUser) {
          // Verify session is still valid by checking with backend
          const response = await fetch('/api/auth/check');
          if (response.ok) {
            const data = await response.json();
            if (data.authenticated) {
              setUser(JSON.parse(savedUser));
            } else {
              localStorage.removeItem('cabinet-pm-user');
            }
          } else {
            // Session expired, clear storage
            localStorage.removeItem('cabinet-pm-user');
          }
        }
      } catch (error) {
        console.error('Auth check error:', error);
        // If check fails, assume logged out
        localStorage.removeItem('cabinet-pm-user');
      } finally {
        setLoading(false);
      }
    };
    
    checkAuth();
  }, []);

  const login = async (username, password) => {
    try {
      const result = await api.login(username, password);
      if (result.success) {
        const userData = { username };
        setUser(userData);
        // Persist to localStorage
        localStorage.setItem('cabinet-pm-user', JSON.stringify(userData));
        navigate('/dashboard');
        return { success: true };
      }
      return { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  };

  const register = async (userData) => {
    try {
      const result = await api.register(userData);
      if (result.success) {
        const user = { username: userData.username };
        setUser(user);
        // Persist to localStorage
        localStorage.setItem('cabinet-pm-user', JSON.stringify(user));
        navigate('/dashboard');
        return { success: true };
      }
      return { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  };

  const logout = async () => {
    try {
      await api.logout();
      setUser(null);
      localStorage.removeItem('cabinet-pm-user');
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
      setUser(null);
      localStorage.removeItem('cabinet-pm-user');
      navigate('/');
    }
  };

  const value = {
    user,
    loading,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
