import React, { forwardRef, HTMLAttributes } from 'react';

interface FocusableProps extends HTMLAttributes<HTMLElement> {
  tag?: keyof React.JSX.IntrinsicElements;
  children: React.ReactNode;
  onEnterPress?: () => void;
  onFocus?: () => void;
  disabled?: boolean;
}

const Focusable = forwardRef<HTMLElement, FocusableProps>(
  ({ tag = 'div', children, onEnterPress, onFocus, disabled, className = '', ...props }, ref) => {
    const Component = tag as any;

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && onEnterPress && !disabled) {
        e.preventDefault();
        onEnterPress();
      }
    };

    const handleFocus = () => {
      if (onFocus && !disabled) {
        onFocus();
      }
    };

    const handleClick = (e: React.MouseEvent) => {
      if (onEnterPress && !disabled) {
        onEnterPress();
      }
      if (props.onClick) {
        props.onClick(e);
      }
    };

    return (
      <Component
        ref={ref}
        className={`focusable ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onClick={handleClick}
        disabled={disabled}
        {...props}
      >
        {children}
      </Component>
    );
  }
);

Focusable.displayName = 'Focusable';

export default Focusable;