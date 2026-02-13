import { useState, useEffect } from 'react';
import { X, Download, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsNativeApp } from '@/hooks/useIsNativeApp';
import { Capacitor } from '@capacitor/core';

export function AppDownloadBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const isNative = useIsNativeApp();
  const isMobile = Capacitor.isNativePlatform();

  useEffect(() => {
    // Don't show if already using native app
    if (isNative || isMobile) {
      return;
    }

    // Show banner after 500ms (faster)
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 500);

    return () => clearTimeout(timer);
  }, [isNative, isMobile]);

  const handleDismiss = () => {
    setIsVisible(false);
  };

  const handleDownload = () => {
    window.open('https://github.com/YOUR_GITHUB_USERNAME/Tatakai/releases/latest', '_blank');
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed right-4 bottom-20 z-40 w-72 animate-in slide-in-from-right duration-700">
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-background/95 backdrop-blur-xl shadow-2xl">
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5 pointer-events-none" />
        
        <div className="relative p-4">
          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="absolute top-2 right-2 p-1 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>

          {/* Content */}
          <div className="flex items-start gap-3 mb-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Smartphone className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 pt-0.5">
              <h3 className="font-semibold text-sm mb-1">
                Get the Tatakai App
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Download for offline viewing, faster performance, and desktop notifications
              </p>
            </div>
          </div>

          {/* Download buttons */}
          <div className="space-y-2">
            <Button
              onClick={handleDownload}
              className="w-full justify-start gap-2 h-9 text-sm"
              variant="secondary"
            >
              <Download className="w-4 h-4" />
              Download for Windows
            </Button>
            <Button
              onClick={handleDownload}
              className="w-full justify-start gap-2 h-9 text-sm"
              variant="ghost"
            >
              <Download className="w-4 h-4" />
              macOS & Linux
            </Button>
          </div>

          {/* Android badge */}
          <div className="mt-3 pt-3 border-t border-border/50">
            <Button
              onClick={handleDownload}
              className="w-full justify-start gap-2 h-9 text-sm"
              variant="ghost"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.523 15.341c-.527 0-.954.427-.954.954s.427.954.954.954.954-.427.954-.954-.427-.954-.954-.954zm-11.046 0c-.527 0-.954.427-.954.954s.427.954.954.954.954-.427.954-.954-.427-.954-.954-.954zm11.405-6.634l1.716-2.972c.094-.162.038-.369-.124-.463-.162-.094-.369-.038-.463.124l-1.737 3.008c-1.391-.64-2.952-1.002-4.596-1.002s-3.205.362-4.596 1.002L6.345 6.396c-.094-.162-.301-.218-.463-.124-.162.094-.218.301-.124.463l1.716 2.972C3.645 11.369 1.5 14.762 1.5 18.682h21c0-3.92-2.145-7.313-5.974-8.975h.356z"/>
              </svg>
              Android APK
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
