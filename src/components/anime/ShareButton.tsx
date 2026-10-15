import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import uiI18n from '@/lib/uiI18n';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Share2, Copy, Check, Twitter, Facebook, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

interface ShareButtonProps {
  animeId: string;
  animeName: string;
  animePoster: string;
  description?: string;
}

export function ShareButton({ animeId, animeName, animePoster, description }: ShareButtonProps) {
  useUiTranslation();
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  
  const shareUrl = `${window.location.origin}/anime/${animeId}`;
  const shareText = description 
    ? uiI18n.t('app.check_out_i18n_value_0_i18n_value_1_224f927e', { value0: animeName, value1: description.slice(0, 100) })
    : uiI18n.t('app.check_out_i18n_value_0_on_our_anime_platform_7900bb80', { value0: animeName });
  
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success(t('discover.linkCopied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('discover.copyLinkFailed'));
    }
  };
  
  const handleShareTwitter = () => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(twitterUrl, '_blank', 'width=600,height=400');
  };
  
  const handleShareFacebook = () => {
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`;
    window.open(fbUrl, '_blank', 'width=600,height=400');
  };
  
  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: animeName,
          text: shareText,
          url: shareUrl,
        });
      } catch (error) {
        // User cancelled share
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="h-14 w-14 rounded-full">
          <Share2 className="w-5 h-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={handleCopyLink} className="cursor-pointer">
          {copied ? (
            <Check className="w-4 h-4 mr-2 text-green-500" />
          ) : (
            <Copy className="w-4 h-4 mr-2" />
          )}
          {t('discover.copyLink')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleShareTwitter} className="cursor-pointer">
          <Twitter className="w-4 h-4 mr-2" />
          {t('discover.shareOnX')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleShareFacebook} className="cursor-pointer">
          <Facebook className="w-4 h-4 mr-2" />
          {t('discover.shareOnFacebook')}
        </DropdownMenuItem>
        {navigator.share && (
          <DropdownMenuItem onClick={handleNativeShare} className="cursor-pointer">
            <Link2 className="w-4 h-4 mr-2" />
            {t('discover.moreOptions')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
