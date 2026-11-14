import { useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

export interface GalleryFilterOption { id: string; label: string }

export function GalleryFilterMenu({ label, options, selected, onChange, disabled = false }: {
  label: string; options: GalleryFilterOption[]; selected: string[]; onChange: (ids: string[]) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(80);
  const matching = useMemo(() => options.filter(option => option.label.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [options, search]);
  const selection = selected.length === 1 ? options.find(option => option.id === selected[0])?.label : selected.length ? selected.length + ' ' + label.toLowerCase() : null;
  return <div className="gallery-filter-field">
    <span>{label}</span>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-label={'Filter ' + label.toLowerCase()} disabled={disabled} className="gallery-filter-trigger">
          <span>{selection || 'All ' + label.toLowerCase()}</span><ChevronDown size={16} strokeWidth={1.5} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 rounded-xl p-0">
        <Command shouldFilter={false}>
          <CommandInput value={search} onValueChange={value => { setSearch(value); setLimit(80); }} placeholder={'Search ' + label.toLowerCase()} />
          <CommandList className="max-h-64">
            <CommandEmpty>No matches</CommandEmpty>
            <CommandGroup>
              {matching.slice(0, limit).map(option => <CommandItem key={option.id} value={option.id} onSelect={() => onChange(selected.includes(option.id) ? selected.filter(id => id !== option.id) : [...selected, option.id])} className="gap-2 px-3 py-2">
                <Check size={16} strokeWidth={1.5} className={selected.includes(option.id) ? 'text-primary' : 'opacity-0'} />
                <span className="min-w-0 truncate">{option.label}</span>
              </CommandItem>)}
              {matching.length > limit && <CommandItem value="show-more" onSelect={() => setLimit(value => value + 80)} className="justify-center text-muted-foreground">Show more</CommandItem>}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  </div>;
}
