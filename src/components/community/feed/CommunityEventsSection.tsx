import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, MapPin, ExternalLink, Plus, X, Trash2, Clock, Calendar, Image as ImageIcon, Link as LinkIcon, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import {
  useCommunityEvents,
  useCreateCommunityEvent,
  useDeleteCommunityEvent,
  type CommunityEventInput,
} from '@/hooks/community/useCommunityEvents';
import { toast } from 'sonner';

const EMPTY_FORM: CommunityEventInput = {
  title: '',
  description: '',
  starts_at: '',
  ends_at: '',
  location: '',
  link: '',
  image_url: '',
};

// Base input styling for text fields
const inputCls =
  'w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none transition-all focus:border-primary/50 focus:bg-black/40 focus:ring-1 focus:ring-primary/20';

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return {
      month: d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
      day: d.getDate(),
      time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
      weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
    };
  } catch {
    return { month: '---', day: 0, time: '--:--', weekday: '---' };
  }
}

export function CommunityEventsSection() {
  const { isAdmin, isModerator } = useAuth();
  const isStaff = isAdmin || isModerator;
  
  const { data: events = [], isLoading, refetch } = useCommunityEvents();
  const createEvent = useCreateCommunityEvent();
  const deleteEvent = useDeleteCommunityEvent();
  
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CommunityEventInput>(EMPTY_FORM);

  const set = <K extends keyof CommunityEventInput>(k: K, v: CommunityEventInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title?.trim() || !form.starts_at) {
      toast.error('Title and start time are required.');
      return;
    }
    
    try {
      await createEvent.mutateAsync({
        title: form.title.trim(),
        description: form.description?.trim() || null,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        location: form.location?.trim() || null,
        link: form.link?.trim() || null,
        image_url: form.image_url?.trim() || null,
      });
      
      toast.success('Event successfully posted.');
      setForm(EMPTY_FORM);
      setShowForm(false);
      
      // Force a manual refetch just in case react-query invalidation is missed
      refetch?.(); 
    } catch (e: any) {
      toast.error(e?.message || 'Failed to post event.');
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteEvent.mutateAsync(id);
      toast.success('Event removed.');
      refetch?.(); // Manual fallback refetch
    } catch (e: any) {
      toast.error(e?.message || 'Failed to remove event.');
    }
  };

  return (
    <div className="group relative overflow-hidden rounded-[24px] border border-white/[0.08] bg-background/60 backdrop-blur-xl shadow-xl transition-all duration-300 hover:border-white/[0.12]">
      
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute -left-12 -top-12 h-56 w-56 rounded-full bg-primary/10 blur-[90px] transition-all duration-700 group-hover:bg-primary/20" />
      <div className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-fuchsia-500/10 blur-[90px] transition-all duration-700 group-hover:bg-fuchsia-500/20" />

      <div className="relative z-10 flex flex-col p-5 sm:p-6 gap-6">
        
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary shadow-inner">
              <Calendar className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <h2 className="text-base font-bold tracking-tight text-foreground">Event Schedule</h2>
              <p className="text-[13px] text-muted-foreground/80">Streams, watch-alongs, & releases</p>
            </div>
          </div>
          {isStaff && (
            <Button
              onClick={() => setShowForm((v) => !v)}
              className={cn(
                "h-9 gap-2 rounded-full px-4 text-sm font-bold transition-all",
                showForm 
                  ? "bg-white/10 text-white hover:bg-white/20" 
                  : "bg-primary/15 text-primary hover:bg-primary/25 border border-primary/20"
              )}
            >
              {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showForm ? 'Cancel' : 'Add Event'}
            </Button>
          )}
        </div>

        {/* Admin Composer Form */}
        <AnimatePresence>
          {isStaff && showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0, scale: 0.98 }}
              animate={{ opacity: 1, height: 'auto', scale: 1 }}
              exit={{ opacity: 0, height: 0, scale: 0.98 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 shadow-inner">
                
                {/* Title & Description */}
                <div className="space-y-3">
                  <div className="relative group">
                    <Type className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground/60 transition-colors group-focus-within:text-primary" />
                    <input className={cn(inputCls, "pl-10")} placeholder="Event Title *" value={form.title} maxLength={140} onChange={(e) => set('title', e.target.value)} />
                  </div>
                  <textarea className={cn(inputCls, 'min-h-[90px] resize-y')} placeholder="Event Description (optional)" value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} />
                </div>
                
                {/* Date & Time Pickers */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 p-4 rounded-xl bg-black/20 border border-white/5">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-primary/80 ml-1">Start Time *</span>
                    <div className="relative group">
                      <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 transition-colors group-focus-within:text-primary z-10 pointer-events-none" />
                      <input 
                        type="datetime-local" 
                        // [color-scheme:dark] forces the native browser calendar popup to match the dark theme!
                        className={cn(inputCls, "pl-10 w-full [color-scheme:dark] bg-white/[0.02] border-white/10 hover:bg-white/[0.04] cursor-pointer")}
                        value={form.starts_at} 
                        onChange={(e) => set('starts_at', e.target.value)} 
                      />
                    </div>
                  </label>
                  
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">End Time</span>
                    <div className="relative group">
                      <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 transition-colors group-focus-within:text-primary z-10 pointer-events-none" />
                      <input 
                        type="datetime-local" 
                        className={cn(inputCls, "pl-10 w-full [color-scheme:dark] bg-white/[0.02] border-white/10 hover:bg-white/[0.04] cursor-pointer")}
                        value={form.ends_at ?? ''} 
                        onChange={(e) => set('ends_at', e.target.value)} 
                      />
                    </div>
                  </label>
                </div>
                
                {/* Location & Links */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="relative group">
                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 transition-colors group-focus-within:text-primary" />
                    <input className={cn(inputCls, "pl-10")} placeholder="Location (e.g. Discord)" value={form.location ?? ''} onChange={(e) => set('location', e.target.value)} />
                  </div>
                  <div className="relative group">
                    <LinkIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 transition-colors group-focus-within:text-primary" />
                    <input className={cn(inputCls, "pl-10")} placeholder="Link URL" value={form.link ?? ''} onChange={(e) => set('link', e.target.value)} />
                  </div>
                </div>
                
                <div className="relative group">
                  <ImageIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 transition-colors group-focus-within:text-primary" />
                  <input className={cn(inputCls, "pl-10")} placeholder="Cover Image URL" value={form.image_url ?? ''} onChange={(e) => set('image_url', e.target.value)} />
                </div>
                
                {/* Submit Action */}
                <div className="flex justify-end pt-3 border-t border-white/5 mt-1">
                  <Button 
                    onClick={submit} 
                    disabled={createEvent.isPending || !form.title || !form.starts_at} 
                    className="h-10 gap-2 rounded-full px-6 text-sm font-bold shadow-lg active:scale-95 transition-transform"
                  >
                    {createEvent.isPending ? 'Posting…' : 'Post Event'}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Events List */}
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/[0.03] border border-white/[0.05]" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.03] mb-4 ring-1 ring-white/10">
              <CalendarDays className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <h3 className="font-display text-[17px] font-semibold text-foreground">No upcoming events</h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              {isStaff ? 'Schedule your first event using the button above.' : 'Check back soon — the community team posts events here.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            {events.map((ev) => {
              const d = fmtDate(ev.starts_at);
              return (
                <div 
                  key={ev.id} 
                  className="group/ev relative flex flex-col sm:flex-row gap-4 overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.015] p-4 transition-all duration-300 hover:border-white/[0.15] hover:bg-white/[0.03] hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.4)]"
                >
                  {/* Premium Calendar Date Badge */}
                  <div className="flex h-[76px] w-[72px] shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/40 shadow-sm">
                    <div className="flex h-7 w-full items-center justify-center bg-primary/20 text-[11px] font-bold uppercase tracking-widest text-primary">
                      {d.month}
                    </div>
                    <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-white/5 to-transparent text-[28px] font-black tabular-nums tracking-tighter text-white">
                      {d.day}
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="flex min-w-0 flex-1 flex-col justify-center py-0.5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-display text-lg font-bold tracking-tight text-foreground leading-snug">
                        {ev.title}
                      </h3>
                      {isStaff && (
                        <button 
                          onClick={() => remove(ev.id)} 
                          className="shrink-0 rounded-full p-2 text-muted-foreground/50 opacity-0 transition-all hover:bg-rose-500/15 hover:text-rose-400 group-hover/ev:opacity-100 mt-[-4px] mr-[-4px]" 
                          title="Delete Event"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    
                    {ev.description && (
                      <p className="mt-1.5 line-clamp-2 text-sm text-foreground/70 leading-relaxed">
                        {ev.description}
                      </p>
                    )}
                    
                    {/* Metadata Pills */}
                    <div className="mt-3.5 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-white/5 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        <Clock className="h-3.5 w-3.5 text-primary/80" />
                        {d.weekday}, {d.time}
                      </span>
                      
                      {ev.location && (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-white/5 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 text-primary/80" />
                          <span className="truncate max-w-[140px]">{ev.location}</span>
                        </span>
                      )}
                      
                      {ev.link && (
                        <a 
                          href={ev.link} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary transition-colors hover:bg-primary/20 hover:text-primary-foreground"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          View Details
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Thumbnail Image */}
                  {ev.image_url && (
                    <div className="hidden h-[100px] w-[140px] shrink-0 overflow-hidden rounded-xl border border-white/10 sm:block shadow-sm">
                      <img src={ev.image_url} alt={ev.title} className="h-full w-full object-cover transition-transform duration-500 group-hover/ev:scale-105" loading="lazy" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}