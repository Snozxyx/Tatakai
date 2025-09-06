'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useScreenDetection, DeviceType } from '@/hooks/useScreenDetection';
import DeviceSelectionModal from '@/components/DeviceSelectionModal';

interface DeviceContextType {
  deviceType: DeviceType;
  screenWidth: number;
  screenHeight: number;
  isUserSelected: boolean;
  setDeviceType: (type: DeviceType) => void;
  resetToAutoDetect: () => void;
  showDeviceSelector: () => void;
}

const DeviceContext = createContext<DeviceContextType | undefined>(undefined);

export function useDevice() {
  const context = useContext(DeviceContext);
  if (context === undefined) {
    throw new Error('useDevice must be used within a DeviceProvider');
  }
  return context;
}

interface DeviceProviderProps {
  children: React.ReactNode;
}

const FIRST_VISIT_KEY = 'tatakai-first-visit';

export function DeviceProvider({ children }: DeviceProviderProps) {
  const screenDetection = useScreenDetection();
  const [showModal, setShowModal] = useState(false);
  const [hasCheckedFirstVisit, setHasCheckedFirstVisit] = useState(false);

  // Check for first visit
  useEffect(() => {
    if (hasCheckedFirstVisit) return;

    // Only run on client side
    if (typeof window === 'undefined') return;

    try {
      const hasVisited = localStorage.getItem(FIRST_VISIT_KEY);
      const hasDevicePreference = localStorage.getItem('tatakai-device-preference');
      
      // Show modal if first visit and no device preference
      if (!hasVisited && !hasDevicePreference) {
        // Small delay to ensure screen detection is complete
        setTimeout(() => {
          setShowModal(true);
        }, 500);
      }
      
      // Mark as visited
      if (!hasVisited) {
        localStorage.setItem(FIRST_VISIT_KEY, 'true');
      }
    } catch (error) {
      console.warn('Failed to check first visit:', error);
    }

    setHasCheckedFirstVisit(true);
  }, [hasCheckedFirstVisit]);

  const showDeviceSelector = () => {
    setShowModal(true);
  };

  const handleDeviceSelect = (deviceType: DeviceType) => {
    screenDetection.setDeviceType(deviceType);
    setShowModal(false);
  };

  const contextValue: DeviceContextType = {
    ...screenDetection,
    showDeviceSelector
  };

  return (
    <DeviceContext.Provider value={contextValue}>
      {children}
      <DeviceSelectionModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onDeviceSelect={handleDeviceSelect}
        currentDevice={screenDetection.deviceType}
        autoDetectedDevice={screenDetection.deviceType}
      />
    </DeviceContext.Provider>
  );
}