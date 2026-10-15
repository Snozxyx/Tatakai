import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { useAuth } from '@/contexts/AuthContext';
import { useUserSuggestions, useCreateSuggestion } from '@/hooks/api/useSuggestions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SimpleCaptcha } from '@/components/ui/SimpleCaptcha';
import { TurnstileWidget, type TurnstileWidgetHandle } from '@/components/security/TurnstileWidget';
import { isTurnstileEnabled, verifyTurnstileToken } from '@/lib/security/turnstile';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Lightbulb, Send, Loader2, Upload, X } from 'lucide-react';
import { formatDistanceToNow } from '@/lib/localeFormat';
import { toast } from 'sonner';
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';

const STATUS_COLORS = {
  pending: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/20',
  reviewing: 'bg-blue-500/20 text-blue-500 border-blue-500/20',
  approved: 'bg-green-500/20 text-green-500 border-green-500/20',
  rejected: 'bg-red-500/20 text-red-500 border-red-500/20',
  implemented: 'bg-purple-500/20 text-purple-500 border-purple-500/20',
};

export default function SuggestionsPage() {
  useUiTranslation();
  const navigate = useNavigate();
  const isDesktopApp = useIsDesktopApp();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'feature' | 'bug' | 'improvement' | 'content' | 'other'>('feature');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [captchaValid, setCaptchaValid] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  const turnstileEnabled = isTurnstileEnabled();
  
  const { data: suggestions = [], isLoading } = useUserSuggestions();
  const createSuggestion = useCreateSuggestion();

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(uiI18n.t('app.image_must_be_less_than_5mb_7b2cdf22'));
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile || !user) return null;

    try {
      setIsUploading(true);
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `suggestions/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, imageFile);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(uiI18n.t('app.failed_to_upload_image_e641eacd'));
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      toast.error(uiI18n.t('app.please_fill_in_all_fields_503ab476'));
      return;
    }

    if (turnstileEnabled) {
      if (!captchaToken) {
        toast.error(uiI18n.t('app.please_complete_the_verification_challenge_7dbc0a97'));
        return;
      }
      const ok = await verifyTurnstileToken(captchaToken);
      if (!ok) {
        toast.error(uiI18n.t('app.verification_failed_please_try_again_79a2796b'));
        turnstileRef.current?.reset();
        setCaptchaToken(null);
        return;
      }
    } else if (!captchaValid) {
      toast.error(uiI18n.t('app.please_complete_the_captcha_78103c35'));
      return;
    }

    let imageUrl: string | null = null;
    if (imageFile) {
      imageUrl = await uploadImage();
    }

    await createSuggestion.mutateAsync({
      title,
      description,
      category,
      ...(imageUrl && { image_url: imageUrl }),
    });

    setTitle('');
    setDescription('');
    setCategory('feature');
    removeImage();
    turnstileRef.current?.reset();
    setCaptchaToken(null);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">{uiI18n.t('app.sign_in_required_05e76e79')}</h1>
          <p className="text-muted-foreground mb-4">{uiI18n.t('app.please_sign_in_to_submit_suggestions_d0e7b5cd')}</p>
          <Button onClick={() => navigate('/auth')}>{uiI18n.t('app.sign_in_f8492cc1')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Background />
      <Sidebar />

      <main className={`relative z-10 ${isDesktopApp ? 'pl-6' : 'pl-6 md:pl-32'} pr-6 py-6 max-w-[1400px] mx-auto pb-24 md:pb-6`}>
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>{uiI18n.t('app.back_b52b36b7')}</span>
        </button>

        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2 flex items-center gap-3">
            <Lightbulb className="w-8 h-8 text-primary" />
            {uiI18n.t('app.suggestions_861edba0')}
          </h1>
          <p className="text-muted-foreground">
            {uiI18n.t('app.help_us_improve_tatakai_by_sharing_your_ideas_an_f840ab33')}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Submit Form */}
          <Card>
            <CardHeader>
              <CardTitle>{uiI18n.t('app.submit_a_suggestion_02b1eafd')}</CardTitle>
              <CardDescription>
                {uiI18n.t('app.share_your_ideas_for_new_features_improvements_o_4de69d4a')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">{uiI18n.t('app.title_9616975c')}</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={uiI18n.t('app.brief_title_for_your_suggestion_e432b521')}
                    required
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">{uiI18n.t('app.category_b1e976a0')}</label>
                  <Select value={category} onValueChange={(value: any) => setCategory(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="feature">{uiI18n.t('app.feature_request_8bc6f616')}</SelectItem>
                      <SelectItem value="bug">{uiI18n.t('app.bug_report_4fc8025d')}</SelectItem>
                      <SelectItem value="improvement">{uiI18n.t('app.improvement_06a59587')}</SelectItem>
                      <SelectItem value="content">{uiI18n.t('app.content_request_c3cd5577')}</SelectItem>
                      <SelectItem value="other">{uiI18n.t('app.other_6e6a6f20')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">{uiI18n.t('app.description_b5bba38a')}</label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={uiI18n.t('app.describe_your_suggestion_in_detail_94ca6d2a')}
                    rows={6}
                    required
                  />
                </div>

                {/* Image Upload */}
                <div>
                  <label className="text-sm font-medium mb-2 block">{uiI18n.t('app.attach_image_optional_030a20c1')}</label>
                  {!imagePreview ? (
                    <div className="border-2 border-dashed border-muted rounded-lg p-6 text-center hover:border-primary transition-colors cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageSelect}
                        className="hidden"
                        id="image-upload"
                      />
                      <label htmlFor="image-upload" className="cursor-pointer">
                        <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          {uiI18n.t('app.click_to_upload_an_image_max_5mb_c80194ec')}
                        </p>
                      </label>
                    </div>
                  ) : (
                    <div className="relative rounded-lg overflow-hidden border border-muted">
                      <img src={imagePreview} alt={uiI18n.t('app.preview_f1fbb2b4')} className="w-full max-h-48 object-contain bg-muted/20" />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={removeImage}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Captcha */}
                {turnstileEnabled ? (
                  <TurnstileWidget
                    ref={turnstileRef}
                    action="suggestion"
                    onToken={setCaptchaToken}
                    onExpire={() => setCaptchaToken(null)}
                    onError={() => setCaptchaToken(null)}
                  />
                ) : (
                  <SimpleCaptcha onValidate={setCaptchaValid} />
                )}

                <Button
                  type="submit"
                  disabled={
                    createSuggestion.isPending ||
                    isUploading ||
                    (turnstileEnabled ? !captchaToken : !captchaValid)
                  }
                  className="w-full gap-2"
                >
                  {createSuggestion.isPending || isUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {isUploading ? 'Uploading...' : uiI18n.t('app.submit_suggestion_2116138d')}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Your Suggestions */}
          <div>
            <h2 className="text-2xl font-bold mb-4">{uiI18n.t('app.your_suggestions_b778d33c')}</h2>
            {isLoading ? (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
                <p className="text-muted-foreground">{uiI18n.t('app.loading_suggestions_7645f718')}</p>
              </div>
            ) : suggestions.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Lightbulb className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{uiI18n.t('app.you_haven_t_submitted_any_suggestions_yet_865fb78f')}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {suggestions.map((suggestion) => (
                  <Card key={suggestion.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{suggestion.title}</CardTitle>
                          <CardDescription className="mt-1">
                            {formatDistanceToNow(new Date(suggestion.created_at), { addSuffix: true })}
                          </CardDescription>
                        </div>
                        <Badge className={STATUS_COLORS[suggestion.status]}>
                          {suggestion.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-2">{suggestion.description}</p>

                      {/* Image attachment (if provided) */}
                      {suggestion.image_url && (
                        <div className="mt-4">
                          <img src={suggestion.image_url} alt={uiI18n.t('app.suggestion_attachment_b1363cf8')} className="w-full max-h-48 object-contain rounded-lg border border-muted/20" />
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-xs mt-3">
                        <Badge variant="outline">{suggestion.category}</Badge>
                        <Badge variant="outline">{suggestion.priority}</Badge>
                      </div>
                      {suggestion.admin_notes && (
                        <div className="mt-4 p-3 rounded-lg bg-muted/50 border border-border/50">
                          <p className="text-xs font-medium mb-1">{uiI18n.t('app.admin_response_3fdb0f4d')}</p>
                          <p className="text-sm">{suggestion.admin_notes}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <MobileNav />
    </div>
  );
}
