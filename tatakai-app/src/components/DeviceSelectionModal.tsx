'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Smartphone, 
  Laptop, 
  Tv, 
  X, 
  Check,
  Monitor
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeviceType } from '@/hooks/useScreenDetection';

interface DeviceSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeviceSelect: (deviceType: DeviceType) => void;
  currentDevice?: DeviceType;
  autoDetectedDevice: DeviceType;
}

const deviceOptions = [
  {
    type: 'mobile' as DeviceType,
    name: 'Mobile',
    description: 'Smartphones and small tablets',
    icon: Smartphone,
    features: ['Touch navigation', 'Compact layout', 'Mobile-optimized']
  },
  {
    type: 'laptop' as DeviceType,
    name: 'Laptop/Desktop',
    description: 'Computers and regular monitors',
    icon: Laptop,
    features: ['Mouse & keyboard', 'Standard layout', 'Full features']
  },
  {
    type: 'tv' as DeviceType,
    name: 'Smart TV',
    description: 'Large displays and TV screens',
    icon: Tv,
    features: ['Remote control', 'Large interface', 'Distance viewing']
  }
];

export default function DeviceSelectionModal({
  isOpen,
  onClose,
  onDeviceSelect,
  currentDevice,
  autoDetectedDevice
}: DeviceSelectionModalProps) {
  const [selectedDevice, setSelectedDevice] = useState<DeviceType>(currentDevice || autoDetectedDevice);

  const handleConfirm = () => {
    onDeviceSelect(selectedDevice);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-card border border-border rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div>
              <h2 className="text-2xl font-bold text-card-foreground">Choose Your Device</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Select your device type for the best viewing experience
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] p-2"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Auto-detected info */}
          <div className="px-6 py-4 bg-muted/30 border-b border-border">
            <div className="flex items-center space-x-2 text-sm">
              <Monitor className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Auto-detected:</span>
              <span className="font-medium text-foreground capitalize">{autoDetectedDevice}</span>
              {typeof window !== 'undefined' && (
                <span className="text-muted-foreground">
                  ({window.innerWidth}×{window.innerHeight}px)
                </span>
              )}
            </div>
          </div>

          {/* Device options */}
          <div className="p-6 space-y-4">
            {deviceOptions.map((option) => {
              const Icon = option.icon;
              const isSelected = selectedDevice === option.type;
              const isAutoDetected = autoDetectedDevice === option.type;

              return (
                <motion.div
                  key={option.type}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-md'
                      : 'border-border hover:border-primary/50 hover:bg-muted/30'
                  }`}
                  onClick={() => setSelectedDevice(option.type)}
                >
                  <div className="flex items-start space-x-4">
                    <div className={`p-3 rounded-lg ${
                      isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-2">
                        <h3 className="font-semibold text-card-foreground">{option.name}</h3>
                        {isAutoDetected && (
                          <span className="px-2 py-1 text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full border border-blue-200 dark:border-blue-800">
                            Recommended
                          </span>
                        )}
                        {isSelected && (
                          <Check className="w-5 h-5 text-primary" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        {option.description}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {option.features.map((feature) => (
                          <span
                            key={feature}
                            className="px-2 py-1 text-xs bg-muted text-muted-foreground rounded-md"
                          >
                            {feature}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-border bg-muted/20">
            <p className="text-xs text-muted-foreground">
              You can change this later in settings
            </p>
            <div className="flex space-x-3">
              <Button
                variant="outline"
                onClick={onClose}
                className="min-h-[44px] px-6"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                className="min-h-[44px] px-6"
              >
                Confirm Selection
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}