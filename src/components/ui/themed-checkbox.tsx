import * as React from 'react';
import { Checkbox } from './checkbox';

/** Preserve input handlers/form values while using the app's themed checkbox. */
export const ThemedCheckbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function ThemedCheckbox(
  { checked, defaultChecked, onChange, type: _type, name, value, disabled, className, ...props }, forwardedRef,
) {
  const [internal, setInternal] = React.useState(!!defaultChecked);
  const input = React.useRef<HTMLInputElement | null>(null);
  const selected = checked ?? internal;
  return <>
    <input type="checkbox" hidden aria-hidden="true" tabIndex={-1} name={name} value={value} checked={selected} disabled={disabled}
      ref={node => { input.current = node; if (typeof forwardedRef === 'function') forwardedRef(node); else if (forwardedRef) forwardedRef.current = node; }}
      onChange={event => { setInternal(event.target.checked); onChange?.(event); }} />
    <Checkbox {...props as unknown as React.ComponentPropsWithoutRef<typeof Checkbox>} className={className} checked={selected} disabled={disabled} onCheckedChange={next => {
      const target = input.current;
      if (!target) return;
      target.checked = next === true; setInternal(target.checked);
      const event = new Event('change', { bubbles: true });
      onChange?.({ target, currentTarget: target, nativeEvent: event, type: 'change', bubbles: true, cancelable: false, defaultPrevented: false, eventPhase: 3, isTrusted: false, timeStamp: event.timeStamp,
        preventDefault: () => event.preventDefault(), stopPropagation: () => event.stopPropagation(), isDefaultPrevented: () => event.defaultPrevented, isPropagationStopped: () => false, persist: () => {} } as React.ChangeEvent<HTMLInputElement>);
    }} />
  </>;
});
