import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PostDrafts } from '@/components/community/PostDrafts';
import { PostPreview } from '@/components/community/PostPreview';
import { GeneralCommunityLanguageWarning } from '@/components/community/GeneralCommunityLanguageWarning';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCreateForumPost } from '@/hooks/community/useForum';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, Send, AlertTriangle, MessageCircle, HelpCircle, Star, FileText, Newspaper, Laugh, Palette, Lightbulb, Tv, Image as ImageIcon, X, Upload } from 'lucide-react';
import { useToast } from '@/hooks/ui/use-toast';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { uploadUserMedia } from '@/lib/userMedia';
import { imageFileFromTransfer, dragHasFiles } from '@/lib/imageIntake';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function ForumNewPostPage() {
  useUiTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const createPost = useCreateForumPost();

  const [title, setTitle] = useState('');
  const [preview, setPreview] = useState(false);
  const [draftId, setDraftId] = useState('');
  const draftPublishRef = useRef<(() => void) | null>(null);
  const [content, setContent] = useState('');
  const [flair, setFlair] = useState<string>('');
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Redirect if not logged in
  if (!user) {
    navigate('/auth');
    return null;
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) acceptImageFile(file);
  };

  const acceptImageFile = (file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({ get title() { return uiI18n.t('app.please_select_an_image_file_b1d184e9'); }, variant: 'destructive' });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({ get title() { return uiI18n.t('app.image_must_be_less_than_5mb_7b2cdf22'); }, variant: 'destructive' });
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
    const { url } = await uploadUserMedia(file, user!.id, 'forum_image');
    return url;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !content.trim()) {
      toast({ get title() { return uiI18n.t('app.please_fill_in_all_required_fields_47aab3e1'); }, variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);

    try {
      let imageUrl: string | undefined = imagePreview && !imageFile ? imagePreview : undefined;

      if (!imageFile && imagePreview?.startsWith('data:')) {
        setUploadingImage(true);
        const blob = await (await fetch(imagePreview)).blob();
        imageUrl = await uploadImage(new File([blob], 'draft-image', { type: blob.type }));
      }
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

      draftPublishRef.current?.();
      if (imageUrl) {
        toast({
          get title() { return uiI18n.t('app.post_submitted_for_approval_4ce5da04'); },
          get description() { return uiI18n.t('app.posts_with_images_require_admin_approval_before__5d603138'); }
        });
        navigate('/community');
      } else {
        toast({ get title() { return uiI18n.t('app.post_created_successfully_6b635b6c'); } });
        navigate(`/community/forum/${post.id}`);
      }
    } catch (error) {
      console.error('Failed to create post:', error);
      toast({
        get title() { return uiI18n.t('app.failed_to_create_post_3350fd70'); },
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
      setUploadingImage(false);
    }
  };

  const flairOptions = [
    { value: 'Discussion', get label() { return uiI18n.t('app.discussion_8fb937b6'); }, icon: MessageCircle },
    { value: 'Question', get label() { return uiI18n.t('app.question_002ff598'); }, icon: HelpCircle },
    { value: 'Recommendation', get label() { return uiI18n.t('app.recommendation_6422fcc9'); }, icon: Star },
    { value: 'Review', get label() { return uiI18n.t('app.review_e29a79fe'); }, icon: FileText },
    { value: 'News', get label() { return uiI18n.t('app.news_34c808d0'); }, icon: Newspaper },
    { value: 'Meme', get label() { return uiI18n.t('app.meme_13cc8e2d'); }, icon: Laugh },
    { value: 'Fanart', get label() { return uiI18n.t('app.fanart_004ade9d'); }, icon: Palette },
    { value: 'Theory', get label() { return uiI18n.t('app.theory_5b1e898f'); }, icon: Lightbulb },
    { value: 'Episode Discussion', get label() { return uiI18n.t('app.episode_discussion_249b4ba5'); }, icon: Tv },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />

      <main className="relative z-10 pl-0 md:pl-20 lg:pl-24 w-full">
        <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">
          {/* Back button */}
          <Button variant="ghost" onClick={() => navigate('/community')} className="mb-6 gap-2">
            <ArrowLeft className="w-4 h-4" />
            {uiI18n.t('app.back_to_community_58498a50')}
          </Button>

          {/* Form */}
          <GlassPanel className="p-6 md:p-8">
            <h1 className="text-3xl font-bold mb-6">{uiI18n.t('app.create_a_post_b4596254')}</h1>

            <form onSubmit={(event) => { event.preventDefault(); setPreview(true); }} className="space-y-6">
              {/* Flair */}
              <div className="space-y-2">
                <Label htmlFor="flair">{uiI18n.t('app.flair_optional_ccaaa5f9')}</Label>
                <Select value={flair} onValueChange={setFlair}>
                  <SelectTrigger id="flair" className="bg-muted/30">
                    <SelectValue placeholder={uiI18n.t('app.select_a_flair_optional_216c5cb6')} />
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
                  {uiI18n.t('app.title_768e0c1c')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={uiI18n.t('app.what_s_your_post_about_1c563898')}
                  className="bg-muted/30"
                  maxLength={300}
                  required
                />
                <p className="text-xs text-muted-foreground">{title.length}/300 characters</p>
              </div>

              {/* Content */}
              <div className="space-y-2">
                <Label htmlFor="content">
                  {uiI18n.t('app.content_4f9be057')} <span className="text-destructive">*</span>
                </Label>
                <GeneralCommunityLanguageWarning content={`${title}\n${content}`} />
                <Textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={uiI18n.t('app.share_your_thoughts_ask_a_question_or_start_a_di_2d3e5d56')}
                  className="min-h-[300px] bg-muted/30"
                  maxLength={10000}
                  required
                />
                <p className="text-xs text-muted-foreground">{content.length}/10,000 characters</p>
              </div>

              {/* Image Upload */}
              <div className="space-y-2">
                <Label htmlFor="image">{uiI18n.t('app.image_optional_b9e38d9e')}</Label>
                {imagePreview ? (
                  <div className="relative group">
                    <img
                      src={imagePreview}
                      alt={uiI18n.t('app.preview_f1fbb2b4')}
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
                    onDragOver={(e) => {
                      if (!dragHasFiles(e.dataTransfer)) return;
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={(e) => {
                      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                      setDragActive(false);
                    }}
                    onDrop={(e) => {
                      if (!dragHasFiles(e.dataTransfer)) return;
                      e.preventDefault();
                      setDragActive(false);
                      const file = imageFileFromTransfer(e.dataTransfer);
                      if (file) acceptImageFile(file);
                    }}
                    className={cn(
                      'flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer transition-colors',
                      dragActive ? 'border-primary/60 bg-primary/10' : 'border-white/20 hover:bg-white/5',
                    )}
                  >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-10 h-10 mb-3 text-muted-foreground" />
                      <p className="mb-2 text-sm text-muted-foreground">
                        <span className="font-semibold">{uiI18n.t('app.click_to_upload_c77c363d')}</span> {uiI18n.t('app.or_drag_and_drop_c0471bb3')}
                      </p>
                      <p className="text-xs text-muted-foreground">{uiI18n.t('app.png_jpg_gif_up_to_5mb_5aed03df')}</p>
                      <p className="text-xs text-orange-500 mt-2">{uiI18n.t('app.posts_with_images_require_admin_approval_108eacff')}</p>
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
                      {uiI18n.t('app.mark_as_spoiler_4b3b21c8')}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {uiI18n.t('app.hide_content_that_might_spoil_the_experience_for_b10678a6')}
                    </p>
                  </div>
                </div>
                <Switch id="spoiler" checked={isSpoiler} onCheckedChange={setIsSpoiler} />
              </div>

              {/* Actions */}
              <div className="flex gap-4 pt-4">
                <Button
                  type="button"
                  onClick={() => setPreview(true)}
                  disabled={isSubmitting || uploadingImage}
                  className="gap-2"
                >
                  <Send className="w-4 h-4" />
                  {uploadingImage ? uiI18n.t('app.uploading_image_5a7826fa') : isSubmitting ? 'Posting...' : uiI18n.t('app.post_7858ac3f')}
                </Button>
                <Button type="button" variant="ghost" onClick={() => navigate('/community')}>
                  {uiI18n.t('app.cancel_77dfd213')}
                </Button>
              </div>
              <Dialog open={preview} onOpenChange={setPreview}>
                <DialogContent>
                  <DialogHeader><DialogTitle>Review your post</DialogTitle><DialogDescription>Preview your post, save a draft, or publish when ready.</DialogDescription></DialogHeader>
              <PostDrafts userId={user.id} scope="forum" title={title} disabled={isSubmitting || uploadingImage} publishRef={draftPublishRef} selectedId={draftId} onSelectedIdChange={setDraftId}
                value={{ title, content, flair, isSpoiler, imagePreview }} onRestore={(draft) => {
                  setTitle(draft.title); setContent(draft.content); setFlair(draft.flair); setIsSpoiler(draft.isSpoiler);
                  setImageFile(null); setImagePreview(draft.imagePreview); setPreview(false);
                }} />
              <PostPreview title={title} content={content} rich={false} spoiler={isSpoiler} images={imagePreview ? [imagePreview] : []} attachments={flair ? [flair] : []} />

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => setPreview(false)}>Keep editing</Button>
                    <Button type="button" disabled={isSubmitting || uploadingImage || !title.trim() || !content.trim()} onClick={handleSubmit}>{isSubmitting ? 'Posting...' : 'Publish post'}</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </form>
          </GlassPanel>

          {/* Guidelines */}
          <GlassPanel className="mt-6 p-6">
            <h3 className="font-bold mb-3">{uiI18n.t('app.community_guidelines_75343669')}</h3>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li>{uiI18n.t('app.be_respectful_and_kind_to_others_6767c1ed')}</li>
              <li>{uiI18n.t('app.no_spam_self_promotion_or_advertisements_20c5912e')}</li>
              <li>{uiI18n.t('app.mark_spoilers_appropriately_ac75dca6')}</li>
              <li>{uiI18n.t('app.stay_on_topic_and_contribute_meaningfully_a5e19fe4')}</li>
              <li>{uiI18n.t('app.no_illegal_content_or_piracy_links_73113341')}</li>
              <li>{uiI18n.t('app.posts_with_images_require_admin_approval_before__ef72ed50')}</li>
            </ul>
          </GlassPanel>
        </div>
      </main>

      <MobileNav />
    </div>
  );
}


