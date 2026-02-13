import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { MobileUpdateService } from '@/services/mobileUpdateService';

export function useMobileUpdate() {
  const [isNative, setIsNative] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const native = Capacitor.isNativePlatform();
    setIsNative(native);

    if (native) {
      // Initialize update service
      MobileUpdateService.init();

      // Cleanup on unmount
      return () => {
        MobileUpdateService.destroy();
      };
    }
  }, []);

  const checkForUpdates = async () => {
    if (!isNative) return false;

    setIsChecking(true);
    try {
      const hasUpdate = await MobileUpdateService.manualCheck();
      setUpdateAvailable(hasUpdate);
      return hasUpdate;
    } finally {
      setIsChecking(false);
    }
  };

  return {
    isNative,
    isChecking,
    updateAvailable,
    checkForUpdates
  };
}
