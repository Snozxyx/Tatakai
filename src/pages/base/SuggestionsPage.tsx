import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { useAuth } from '@/contexts/AuthContext';
import { useUserSuggestions, useCreateSuggestion } from '@/hooks/useSuggestions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SimpleCaptcha } from '@/components/ui/SimpleCaptcha';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Lightbulb, Send, Loader2, Upload, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

const STATUS_COLORS = {
  pending: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/20',
  reviewing: 'bg-blue-500/20 text-blue-500 border-blue-500/20',
  approved: 'bg-green-500/20 text-green-500 border-green-500/20',
  rejected: 'bg-red-500/20 text-red-500 border-red-500/20',
  implemented: 'bg-purple-500/20 text-purple-500 border-purple-500/20',
};

export default function SuggestionsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'feature' | 'bug' | 'improvement' | 'content' | 'other'>('feature');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [captchaValid, setCaptchaValid] = useState(false);
  
  const { data: suggestions = [], isLoading } = useUserSuggestions();
  const createSuggestion = useCreateSuggestion();

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image must be less than 5MB');
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
      toast.error('Failed to upload image');
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      toast.error('Please fill in all fields');
      return;
    }
    
    if (!captchaValid) {
      toast.error('Please complete the captcha');
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
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Sign In Required</h1>
          <p className="text-muted-foreground mb-4">Please sign in to submit suggestions</p>
          <Button onClick={() => navigate('/auth')}>Sign In</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Background />
      <Sidebar />

      <main className="relative z-10 pl-6 md:pl-32 pr-6 py-6 max-w-[1400px] mx-auto pb-24 md:pb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>

        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2 flex items-center gap-3">
            <Lightbulb className="w-8 h-8 text-primary" />
            Suggestions
          </h1>
          <p className="text-muted-foreground">
            Help us improve Tatakai by sharing your ideas and feedback
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Submit Form */}
          <Card>
            <CardHeader>
              <CardTitle>Submit a Suggestion</CardTitle>
              <CardDescription>
                Share your ideas for new features, improvements, or report bugs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Title *</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Brief title for your suggestion"
                    required
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Category *</label>
                  <Select value={category} onValueChange={(value: any) => setCategory(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="feature">Feature Request</SelectItem>
                      <SelectItem value="bug">Bug Report</SelectItem>
                      <SelectItem value="improvement">Improvement</SelectItem>
                      <SelectItem value="content">Content Request</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Description *</label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe your suggestion in detail..."
                    rows={6}
                    required
                  />
                </div>

                {/* Image Upload */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Attach Image (optional)</label>
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
                          Click to upload an image (max 5MB)
                        </p>
                      </label>
                    </div>
                  ) : (
                    <div className="relative rounded-lg overflow-hidden border border-muted">
                      <img src={imagePreview} alt="Preview" className="w-full max-h-48 object-contain bg-muted/20" />
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
                <SimpleCaptcha onValidate={setCaptchaValid} />

                <Button
                  type="submit"
                  disabled={createSuggestion.isPending || isUploading || !captchaValid}
                  className="w-full gap-2"
                >
                  {createSuggestion.isPending || isUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {isUploading ? 'Uploading...' : 'Submit Suggestion'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Your Suggestions */}
          <div>
            <h2 className="text-2xl font-bold mb-4">Your Suggestions</h2>
            {isLoading ? (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
                <p className="text-muted-foreground">Loading suggestions...</p>
              </div>
            ) : suggestions.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Lightbulb className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>You haven't submitted any suggestions yet</p>
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
                          <img src={suggestion.image_url} alt="Suggestion attachment" className="w-full max-h-48 object-contain rounded-lg border border-muted/20" />
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-xs mt-3">
                        <Badge variant="outline">{suggestion.category}</Badge>
                        <Badge variant="outline">{suggestion.priority}</Badge>
                      </div>
                      {suggestion.admin_notes && (
                        <div className="mt-4 p-3 rounded-lg bg-muted/50 border border-border/50">
                          <p className="text-xs font-medium mb-1">Admin Response:</p>
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
