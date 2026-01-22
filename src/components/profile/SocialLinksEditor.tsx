import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { 
  Share2, Save, ExternalLink,
  Globe, Lock, Eye, EyeOff
} from 'lucide-react';
import { motion } from 'framer-motion';

// Social platform icons as SVG components
const DiscordIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);

const TwitterIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const InstagramIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
  </svg>
);

const MALIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8.273 7.247v8.423l-2.103-.003v-5.216l-2.03 2.404-1.989-2.458-.02 5.285H.001L0 7.247h2.203l1.865 2.545 2.015-2.546 2.19.001zm8.628 2.069l.025 6.335h-2.099l-.025-3.996h-1.073v3.997H11.57V9.316h5.33v.001zM24 7.247v2.064h-1.5v6.358h-2.115V9.311h-1.2V7.247z"/>
  </svg>
);

const AniListIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6.361 2.943L0 21.056h4.942l1.077-3.133H11.4l1.052 3.133H22.9c.71 0 1.1-.392 1.1-1.101V17.53c0-.71-.39-1.101-1.1-1.101h-6.483V4.045c0-.71-.392-1.102-1.101-1.102h-2.422c-.71 0-1.101.392-1.101 1.102v1.064L6.36 2.943zm2.324 11.587l1.569-4.887 1.569 4.887H8.685z"/>
  </svg>
);

const YouTubeIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

const TwitchIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/>
  </svg>
);

export interface SocialLinks {
  discord?: string;
  twitter?: string;
  instagram?: string;
  mal?: string;
  anilist?: string;
  youtube?: string;
  twitch?: string;
}

interface SocialLinksEditorProps {
  currentLinks?: SocialLinks;
  isPublic?: boolean;
  showWatchlist?: boolean;
  showHistory?: boolean;
  trigger?: React.ReactNode;
}

const SOCIAL_PLATFORMS = [
  { key: 'discord', label: 'Discord', icon: DiscordIcon, placeholder: 'discord.gg/invite', color: '#5865F2' },
  { key: 'twitter', label: 'X (Twitter)', icon: TwitterIcon, placeholder: '@username or x.com/username', color: '#000000' },
  { key: 'instagram', label: 'Instagram', icon: InstagramIcon, placeholder: '@username or instagram.com/username', color: '#E4405F' },
  { key: 'mal', label: 'MyAnimeList', icon: MALIcon, placeholder: 'myanimelist.net/profile/username', color: '#2E51A2' },
  { key: 'anilist', label: 'AniList', icon: AniListIcon, placeholder: 'anilist.co/user/username', color: '#02A9FF' },
  { key: 'youtube', label: 'YouTube', icon: YouTubeIcon, placeholder: '@channel or youtube.com/@channel', color: '#FF0000' },
  { key: 'twitch', label: 'Twitch', icon: TwitchIcon, placeholder: 'twitch.tv/username', color: '#9146FF' },
];

export function SocialLinksEditor({ 
  currentLinks = {}, 
  isPublic = false, 
  showWatchlist = true,
  showHistory = true,
  trigger 
}: SocialLinksEditorProps) {
  const { user, refreshProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<SocialLinks>(currentLinks);
  const [privacy, setPrivacy] = useState({
    isPublic,
    showWatchlist,
    showHistory,
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setLinks(currentLinks);
    setPrivacy({ isPublic, showWatchlist, showHistory });
  }, [currentLinks, isPublic, showWatchlist, showHistory]);

  const handleSave = async () => {
    if (!user) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          social_links: links,
          is_public: privacy.isPublic,
          show_watchlist: privacy.showWatchlist,
          show_history: privacy.showHistory,
        })
        .eq('user_id', user.id);

      if (error) throw error;

      await refreshProfile();
      toast.success('Profile settings saved!');
      setOpen(false);
    } catch (error: any) {
      toast.error(`Failed to save: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const updateLink = (key: string, value: string) => {
    setLinks(prev => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <Share2 className="w-4 h-4" />
            Edit Social Links
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-primary" />
            Profile Settings & Social Links
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Privacy Settings */}
          <div className="space-y-4 p-4 rounded-xl bg-muted/30 border border-white/5">
            <h3 className="font-semibold flex items-center gap-2">
              {privacy.isPublic ? (
                <Globe className="w-4 h-4 text-green-500" />
              ) : (
                <Lock className="w-4 h-4 text-amber-500" />
              )}
              Privacy Settings
            </h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-medium">Public Profile</Label>
                  <p className="text-xs text-muted-foreground">Allow others to view your profile via @username</p>
                </div>
                <Switch
                  checked={privacy.isPublic}
                  onCheckedChange={(checked) => setPrivacy(p => ({ ...p, isPublic: checked }))}
                />
              </div>
              
              {privacy.isPublic && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-3 pl-4 border-l-2 border-primary/30"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="font-medium flex items-center gap-2">
                        <Eye className="w-3 h-3" />
                        Show Watchlist
                      </Label>
                      <p className="text-xs text-muted-foreground">Display your anime watchlist publicly</p>
                    </div>
                    <Switch
                      checked={privacy.showWatchlist}
                      onCheckedChange={(checked) => setPrivacy(p => ({ ...p, showWatchlist: checked }))}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="font-medium flex items-center gap-2">
                        <Eye className="w-3 h-3" />
                        Show Watch History
                      </Label>
                      <p className="text-xs text-muted-foreground">Display your watch history publicly</p>
                    </div>
                    <Switch
                      checked={privacy.showHistory}
                      onCheckedChange={(checked) => setPrivacy(p => ({ ...p, showHistory: checked }))}
                    />
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          {/* Social Links */}
          <div className="space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Share2 className="w-4 h-4 text-primary" />
              Social Links
            </h3>
            <p className="text-sm text-muted-foreground">
              Add your social profiles to connect with other anime fans.
            </p>

            <div className="space-y-3">
              {SOCIAL_PLATFORMS.map((platform) => {
                const Icon = platform.icon;
                return (
                  <div key={platform.key} className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${platform.color}20`, color: platform.color }}
                    >
                      <Icon />
                    </div>
                    <Input
                      value={(links as any)[platform.key] || ''}
                      onChange={(e) => updateLink(platform.key, e.target.value)}
                      placeholder={platform.placeholder}
                      className="flex-1 bg-background/50"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <Button onClick={handleSave} disabled={isSaving} className="w-full gap-2">
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Component to display social links on a profile
export function SocialLinksDisplay({ links }: { links?: SocialLinks }) {
  if (!links) return null;

  const activeLinks = SOCIAL_PLATFORMS.filter(p => (links as any)[p.key]);
  if (activeLinks.length === 0) return null;

  const formatLink = (platform: typeof SOCIAL_PLATFORMS[0], value: string) => {
    // Try to create a proper URL from the value
    if (value.startsWith('http')) return value;
    
    switch (platform.key) {
      case 'discord':
        if (value.includes('discord.gg')) return `https://discord.gg/${value}`;
        return null; // Discord usernames aren't linkable
      case 'twitter':
        if (value.startsWith('@')) value = value.slice(1);
        return `https://x.com/${value}`;
      case 'instagram':
        if (value.startsWith('@')) value = value.slice(1);
        return `https://instagram.com/${value}`;
      case 'mal':
        if (value.includes('myanimelist.net')) return `https://${value}`;
        return `https://myanimelist.net/profile/${value}`;
      case 'anilist':
        if (value.includes('anilist.co')) return `https://${value}`;
        return `https://anilist.co/user/${value}`;
      case 'youtube':
        if (value.startsWith('@')) return `https://youtube.com/${value}`;
        if (value.includes('youtube.com')) return `https://${value}`;
        return `https://youtube.com/@${value}`;
      case 'twitch':
        if (value.includes('twitch.tv')) return `https://${value}`;
        return `https://twitch.tv/${value}`;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {activeLinks.map((platform) => {
        const Icon = platform.icon;
        const value = (links as any)[platform.key];
        const url = formatLink(platform, value);

        return url ? (
          <a
            key={platform.key}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-110 hover:shadow-lg"
            style={{ 
              backgroundColor: `${platform.color}20`, 
              color: platform.color,
            }}
            title={platform.label}
          >
            <Icon />
          </a>
        ) : (
          <div
            key={platform.key}
            className="w-10 h-10 rounded-lg flex items-center justify-center cursor-default"
            style={{ 
              backgroundColor: `${platform.color}20`, 
              color: platform.color,
            }}
            title={`${platform.label}: ${value}`}
          >
            <Icon />
          </div>
        );
      })}
    </div>
  );
}
