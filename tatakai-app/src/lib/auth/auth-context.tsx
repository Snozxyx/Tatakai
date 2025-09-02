'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import BackendAPI, { type User, type AuthResponse } from './backend-api';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthResponse>;
  register: (userData: {
    username: string;
    email: string;
    password: string;
    displayName?: string;
  }) => Promise<AuthResponse>;
  logout: () => void;
  updateProfile: (profileData: Partial<User['profile']>) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user is authenticated on mount
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      refreshUser();
    } else {
      setIsLoading(false);
    }
  }, []);

  const refreshUser = async () => {
    try {
      setIsLoading(true);
      const response = await BackendAPI.getCurrentUser();
      if (response.success && response.data) {
        setUser(response.data.user);
      } else {
        // Token might be invalid, clear it
        localStorage.removeItem('auth_token');
        setUser(null);
      }
    } catch (error) {
      console.error('Failed to refresh user:', error);
      localStorage.removeItem('auth_token');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<AuthResponse> => {
    try {
      const response = await BackendAPI.login({ email, password });
      
      if (response.success && response.data) {
        localStorage.setItem('auth_token', response.data.token);
        setUser(response.data.user);
      }
      
      return response;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const register = async (userData: {
    username: string;
    email: string;
    password: string;
    displayName?: string;
  }): Promise<AuthResponse> => {
    try {
      const response = await BackendAPI.register(userData);
      
      if (response.success && response.data) {
        localStorage.setItem('auth_token', response.data.token);
        setUser(response.data.user);
      }
      
      return response;
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    setUser(null);
  };

  const updateProfile = async (profileData: Partial<User['profile']>) => {
    try {
      const response = await BackendAPI.updateProfile(profileData);
      if (response.success && response.data) {
        setUser(response.data.user);
      }
    } catch (error) {
      console.error('Update profile error:', error);
      throw error;
    }
  };

  const value = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    updateProfile,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};