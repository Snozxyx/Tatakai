import * as React from 'react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from './select';
import { cn } from '@/lib/utils';

type Props = React.SelectHTMLAttributes<HTMLSelectElement>;
const encode = (value: string) => `option:${value}`;

function optionText(children: React.ReactNode): string {
  return React.Children.toArray(children).map(child => React.isValidElement(child)
    ? optionText((child.props as { children?: React.ReactNode }).children) : String(child)).join('');
}

/** Native-select call-site compatibility with Tatakai's keyboard-accessible popup. */
export const ThemedSelect = React.forwardRef<HTMLSelectElement, Props>(function ThemedSelect(
  { children, value, defaultValue, onChange, className, disabled, name, required, id, ...props }, forwardedRef,
) {
  const nativeRef = React.useRef<HTMLSelectElement | null>(null);
  const [internalValue, setInternalValue] = React.useState<string | undefined>(() => defaultValue === undefined ? undefined : String(defaultValue));
  const options: { value: string; label: React.ReactNode; disabled: boolean; group?: string }[] = [];
  function collect(nodes: React.ReactNode, group?: string, groupDisabled = false) {
    React.Children.forEach(nodes, child => {
      if (!React.isValidElement(child)) return;
      const item = child.props as React.OptionHTMLAttributes<HTMLOptionElement> & { label?: string };
      if (child.type === 'option') options.push({ value: String(item.value ?? optionText(item.children)), label: item.children, disabled: groupDisabled || !!item.disabled, group });
      else collect(item.children, child.type === 'optgroup' ? item.label : group, groupDisabled || !!item.disabled);
    });
  }
  collect(children);
  const selected = String(value ?? internalValue ?? options[0]?.value ?? '');
  const groups = [...new Set(options.map(option => option.group))];
  // Keep a real select as the event target for existing handlers and form values.
  // It is hidden from focus/accessibility; the themed trigger owns interaction.
  return <>
    <select ref={node => { nativeRef.current = node; if (typeof forwardedRef === 'function') forwardedRef(node); else if (forwardedRef) forwardedRef.current = node; }}
      hidden aria-hidden="true" tabIndex={-1} name={name} form={props.form} value={selected} disabled={disabled} onChange={event => { setInternalValue(event.target.value); onChange?.(event); }}>{children}</select>
    <Select value={encode(selected)} disabled={disabled} required={required} onValueChange={next => {
      const nextValue = next.slice('option:'.length);
      setInternalValue(nextValue);
      const target = nativeRef.current;
      if (!target) return;
      target.value = nextValue;
      const event = new Event('change', { bubbles: true });
      onChange?.({ target, currentTarget: target, nativeEvent: event, type: 'change', bubbles: true, cancelable: false, defaultPrevented: false,
        eventPhase: 3, isTrusted: false, timeStamp: event.timeStamp, preventDefault: () => event.preventDefault(), stopPropagation: () => event.stopPropagation(),
        isDefaultPrevented: () => event.defaultPrevented, isPropagationStopped: () => false, persist: () => {} } as React.ChangeEvent<HTMLSelectElement>);
    }}>
      <SelectTrigger {...props as unknown as React.ComponentPropsWithoutRef<typeof SelectTrigger>} id={id} className={cn('w-auto min-w-0', className)}><SelectValue /></SelectTrigger>
      <SelectContent>{groups.map((group, index) => <SelectGroup key={group ?? index}>
        {group && <SelectLabel>{group}</SelectLabel>}
        {options.filter(option => option.group === group).map(option => <SelectItem key={option.value} value={encode(option.value)} disabled={option.disabled}>{option.label}</SelectItem>)}
      </SelectGroup>)}</SelectContent>
    </Select>
  </>;
});
