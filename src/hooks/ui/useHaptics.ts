import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

export function useHaptics() {
  const isNative = Capacitor.isNativePlatform();

  const impact = async (style: 'light' | 'medium' | 'heavy' = 'medium') => {
    if (!isNative) return;
    
    try {
      const styleMap: Record<string, ImpactStyle> = {
        light: ImpactStyle.Light,
        medium: ImpactStyle.Medium,
        heavy: ImpactStyle.Heavy,
      };
      await Haptics.impact({ style: styleMap[style] });
    } catch (e) {
      console.warn('Haptics not available:', e);
    }
  };

  const notification = async (type: 'success' | 'warning' | 'error' = 'success') => {
    if (!isNative) return;
    
    try {
      const typeMap: Record<string, NotificationType> = {
        success: NotificationType.Success,
        warning: NotificationType.Warning,
        error: NotificationType.Error,
      };
      await Haptics.notification({ type: typeMap[type] });
    } catch (e) {
      console.warn('Haptics not available:', e);
    }
  };

  const vibrate = async (duration: number = 300) => {
    if (!isNative) return;
    
    try {
      await Haptics.vibrate({ duration });
    } catch (e) {
      console.warn('Haptics not available:', e);
    }
  };

  const selectionStart = async () => {
    if (!isNative) return;
    
    try {
      await Haptics.selectionStart();
    } catch (e) {
      console.warn('Haptics not available:', e);
    }
  };

  const selectionChanged = async () => {
    if (!isNative) return;
    
    try {
      await Haptics.selectionChanged();
    } catch (e) {
      console.warn('Haptics not available:', e);
    }
  };

  const selectionEnd = async () => {
    if (!isNative) return;
    
    try {
      await Haptics.selectionEnd();
    } catch (e) {
      console.warn('Haptics not available:', e);
    }
  };

  return {
    impact,
    notification,
    vibrate,
    selectionStart,
    selectionChanged,
    selectionEnd,
    isNative,
  };
}
