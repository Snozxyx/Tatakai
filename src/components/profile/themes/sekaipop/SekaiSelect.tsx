import { useRef, useState } from 'react';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

/** Uses Radix keyboard/focus handling, with SekaiPop chrome and a scoped portal. */
export function SekaiSelect({ value, onChange, options, label, disabled = false }: {
  value: string; onChange: (value: string) => void;
  options: { value: string; label: string }[]; label: string; disabled?: boolean;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  return <Select.Root value={value} onValueChange={onChange} disabled={disabled} onOpenChange={open => {
    if (open) setContainer(trigger.current?.closest<HTMLElement>('.sp-profile') ?? null);
  }}>
    <Select.Trigger ref={trigger} className="sp-select-trigger" aria-label={label}><Select.Value /><Select.Icon><ChevronDown size={15} /></Select.Icon></Select.Trigger>
    <Select.Portal container={container}><Select.Content className="sp-select-menu" position="popper" sideOffset={7} collisionPadding={12}>
      <Select.ScrollUpButton className="sp-select-scroll"><ChevronUp size={14} /></Select.ScrollUpButton>
      <Select.Viewport><Select.Group>{options.map(option => <Select.Item className="sp-select-option" key={option.value} value={option.value}><Select.ItemText>{option.label}</Select.ItemText><Select.ItemIndicator><Check size={14} /></Select.ItemIndicator></Select.Item>)}</Select.Group></Select.Viewport>
      <Select.ScrollDownButton className="sp-select-scroll"><ChevronDown size={14} /></Select.ScrollDownButton>
    </Select.Content></Select.Portal>
  </Select.Root>;
}
