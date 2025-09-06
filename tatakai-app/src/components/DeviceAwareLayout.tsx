'use client';

import React, { useEffect } from 'react';
import { useDevice } from '@/contexts/DeviceContext';

interface DeviceAwareLayoutProps {
  children: React.ReactNode;
}

export default function DeviceAwareLayout({ children }: DeviceAwareLayoutProps) {
  const { deviceType } = useDevice();

  useEffect(() => {
    // Apply device class to html element
    const htmlElement = document.documentElement;
    
    // Remove existing device classes
    htmlElement.classList.remove('device-mobile', 'device-laptop', 'device-tv');
    
    // Add current device class
    htmlElement.classList.add(`device-${deviceType}`);
    
    // Add body class for easier styling
    document.body.classList.remove('device-mobile', 'device-laptop', 'device-tv');
    document.body.classList.add(`device-${deviceType}`);
    
    return () => {
      // Cleanup on unmount
      htmlElement.classList.remove('device-mobile', 'device-laptop', 'device-tv');
      document.body.classList.remove('device-mobile', 'device-laptop', 'device-tv');
    };
  }, [deviceType]);

  return <>{children}</>;
}