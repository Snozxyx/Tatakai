import React from 'react';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { cn } from '@/lib/utils';

interface FocusableProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  onEnter?: () => void;
  disabled?: boolean;
}

const Focusable: React.FC<FocusableProps> = ({
  id,
  children,
  className,
  onFocus,
  onBlur,
  onEnter,
  disabled = false,
}) => {
  const { ref, focused } = useFocusable({
    focusKey: id,
    onEnterPress: onEnter,
    onFocus,
    onBlur,
    focusable: !disabled
  });

  return (
    <div
      ref={ref}
      className={cn(
        'tv-focusable',
        focused && 'tv-focused',
        disabled && 'opacity-50 pointer-events-none',
        className
      )}
      tabIndex={disabled ? -1 : 0}
    >
      {children}
    </div>
  );
};

export default Focusable;