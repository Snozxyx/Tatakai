import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { StatusVideoBackground } from '@/components/layout/StatusVideoBackground';
import { useCreateForumPost } from '@/hooks/useForum';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, Send, AlertTriangle, MessageCircle, HelpCircle, Star, FileText, Newspaper, Laugh, Palette, Lightbulb, Tv, Image as ImageIcon, X, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function ForumNewPostPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const createPost = useCreateForumPost();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [flair, setFlair] = useState<string>('');
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Redirect if not logged in
  if (!user) {
    navigate('/auth');
    return null;
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Please select an image file', variant: 'destructive' });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Image must be less than 5MB', variant: 'destructive' });
      return;
    }

    setImageFile(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const uploadImage = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${user!.id}-${Date.now()}.${fileExt}`;
    const filePath = `forum_images/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('forum')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('forum')
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !content.trim()) {
      toast({ title: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);

    try {
      let imageUrl: string | undefined;

      // Upload image if present
      if (imageFile) {
        setUploadingImage(true);
        imageUrl = await uploadImage(imageFile);
      }

      const post = await createPost.mutateAsync({
        title: title.trim(),
        content: content.trim(),
        flair: flair || undefined,
        is_spoiler: isSpoiler,
        content_type: imageUrl ? 'image' : 'text',
        image_url: imageUrl,
      });

      if (imageUrl) {
        toast({ 
          title: 'Post submitted for approval', 
          description: 'Posts with images require admin approval before they appear publicly.' 
        });
        navigate('/community');
      } else {
        toast({ title: 'Post created successfully!' });
        navigate(`/community/forum/${post.id}`);
      }
    } catch (error) {
      console.error('Failed to create post:', error);
      toast({ 
        title: 'Failed to create post', 
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive' 
      });
    } finally {
      setIsSubmitting(false);
      setUploadingImage(false);
    }
  };

  const flairOptions = [
    { value: 'Discussion', label: 'Discussion', icon: MessageCircle },
    { value: 'Question', label: 'Question', icon: HelpCircle },
    { value: 'Recommendation', label: 'Recommendation', icon: Star },
    { value: 'Review', label: 'Review', icon: FileText },
    { value: 'News', label: 'News', icon: Newspaper },
    { value: 'Meme', label: 'Meme', icon: Laugh },
    { value: 'Fanart', label: 'Fanart', icon: Palette },
    { value: 'Theory', label: 'Theory', icon: Lightbulb },
    { value: 'Episode Discussion', label: 'Episode Discussion', icon: Tv },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <StatusVideoBackground />
      <Sidebar />

      <main className="relative z-10 pl-0 md:pl-20 lg:pl-24 w-full">
        <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">
          {/* Back button */}
          <Button variant="ghost" onClick={() => navigate('/community')} className="mb-6 gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Community
          </Button>

          {/* Form */}
          <GlassPanel className="p-6 md:p-8">
            <h1 className="text-3xl font-bold mb-6">Create a Post</h1>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Flair */}
              <div className="space-y-2">
                <Label htmlFor="flair">Flair (Optional)</Label>
                <Select value={flair} onValueChange={setFlair}>
                  <SelectTrigger id="flair" className="bg-muted/30">
                    <SelectValue placeholder="Select a flair (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {flairOptions.map((option) => {
                      const Icon = option.icon;
                      return (
                        <SelectItem key={option.value} value={option.value}>
                          <span className="flex items-center gap-2">
                            <Icon className="w-4 h-4" />
                            {option.label}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title">
                  Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What's your post about?"
                  className="bg-muted/30"
                  maxLength={300}
                  required
                />
                <p className="text-xs text-muted-foreground">{title.length}/300 characters</p>
              </div>

              {/* Content */}
              <div className="space-y-2">
                <Label htmlFor="content">
                  Content <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Share your thoughts, ask a question, or start a discussion..."
                  className="min-h-[300px] bg-muted/30"
                  maxLength={10000}
                  required
                />
                <p className="text-xs text-muted-foreground">{content.length}/10,000 characters</p>
              </div>

              {/* Image Upload */}
              <div className="space-y-2">
                <Label htmlFor="image">Image (Optional)</Label>
                {imagePreview ? (
                  <div className="relative group">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="w-full max-h-96 object-contain rounded-lg border border-white/10"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={removeImage}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <label
                    htmlFor="image-upload"
                    className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-white/20 rounded-lg cursor-pointer hover:bg-white/5 transition-colors"
                  >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-10 h-10 mb-3 text-muted-foreground" />
                      <p className="mb-2 text-sm text-muted-foreground">
                        <span className="font-semibold">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-xs text-muted-foreground">PNG, JPG, GIF up to 5MB</p>
                      <p className="text-xs text-orange-500 mt-2">⚠ Posts with images require admin approval</p>
                    </div>
                    <input
                      id="image-upload"
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={handleImageSelect}
                    />
                  </label>
                )}
              </div>

              {/* Spoiler toggle */}
              <div className="flex items-center justify-between p-4 bg-muted/20 rounded-lg">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-orange-500" />
                  <div>
                    <Label htmlFor="spoiler" className="cursor-pointer">
                      Mark as Spoiler
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Hide content that might spoil the experience for others
                    </p>
                  </div>
                </div>
                <Switch id="spoiler" checked={isSpoiler} onCheckedChange={setIsSpoiler} />
              </div>

              {/* Actions */}
              <div className="flex gap-4 pt-4">
                <Button 
                  type="submit" 
                  disabled={isSubmitting || uploadingImage || !title.trim() || !content.trim()} 
                  className="gap-2"
                >
                  <Send className="w-4 h-4" />
                  {uploadingImage ? 'Uploading Image...' : isSubmitting ? 'Posting...' : 'Post'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => navigate('/community')}>
                  Cancel
                </Button>
              </div>
            </form>
          </GlassPanel>

          {/* Guidelines */}
          <GlassPanel className="mt-6 p-6">
            <h3 className="font-bold mb-3">Community Guidelines</h3>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li>• Be respectful and kind to others</li>
              <li>• No spam, self-promotion, or advertisements</li>
              <li>• Mark spoilers appropriately</li>
              <li>• Stay on topic and contribute meaningfully</li>
              <li>• No illegal content or piracy links</li>
              <li>• Posts with images require admin approval before appearing publicly</li>
            </ul>
          </GlassPanel>
        </div>
      </main>

      <MobileNav />
    </div>
  );
}
