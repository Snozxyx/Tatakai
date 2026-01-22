import { useState } from 'react';
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
  const [copied, setCopied] = useState(false);
  
  const shareUrl = `${window.location.origin}/anime/${animeId}`;
  const shareText = description 
    ? `Check out "${animeName}" - ${description.slice(0, 100)}...`
    : `Check out "${animeName}" on our anime platform!`;
  
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
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
          Copy Link
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleShareTwitter} className="cursor-pointer">
          <Twitter className="w-4 h-4 mr-2" />
          Share on X
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleShareFacebook} className="cursor-pointer">
          <Facebook className="w-4 h-4 mr-2" />
          Share on Facebook
        </DropdownMenuItem>
        {navigator.share && (
          <DropdownMenuItem onClick={handleNativeShare} className="cursor-pointer">
            <Link2 className="w-4 h-4 mr-2" />
            More Options
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
