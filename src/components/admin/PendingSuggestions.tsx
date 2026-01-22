import { useState } from 'react';
import { useAllSuggestions, useReviewSuggestion, useDeleteSuggestion } from '@/hooks/useSuggestions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Loader2, CheckCircle, XCircle, Trash2, Image as ImageIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function PendingSuggestions() {
  const { data: suggestions, isLoading } = useAllSuggestions();
  const reviewSuggestion = useReviewSuggestion();
  const deleteSuggestion = useDeleteSuggestion();
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null);

  const pendingSuggestions = suggestions?.filter(s => s.status === 'pending') || [];

  const handleReview = async (id: string, status: 'approved' | 'rejected') => {
    await reviewSuggestion.mutateAsync({
      id,
      status,
      adminNotes: adminNotes[id] || '',
    });
    setAdminNotes(prev => ({ ...prev, [id]: '' }));
    setSelectedSuggestion(null);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this suggestion?')) {
      await deleteSuggestion.mutateAsync(id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (pendingSuggestions.length === 0) {
    return (
      <div className="text-center py-12">
        <CheckCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-50" />
        <p className="text-muted-foreground">No pending suggestions</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pendingSuggestions.map((suggestion) => (
        <GlassPanel key={suggestion.id} className="p-6">
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-2">{suggestion.title}</h3>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <Badge variant="outline">{suggestion.category}</Badge>
                  <Badge 
                    variant={suggestion.priority === 'high' ? 'destructive' : suggestion.priority === 'medium' ? 'default' : 'secondary'}
                  >
                    {suggestion.priority} priority
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(suggestion.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(suggestion.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>

            {/* Description */}
            <div className="p-4 rounded-lg bg-muted/30">
              <p className="text-sm whitespace-pre-wrap">{suggestion.description}</p>
            </div>

            {/* Image if available */}
            {suggestion.image_url && (
              <div className="relative rounded-lg overflow-hidden border border-muted">
                <img 
                  src={suggestion.image_url} 
                  alt="Suggestion attachment" 
                  className="w-full max-h-64 object-contain bg-muted/20"
                />
              </div>
            )}

            {/* Admin Response */}
            {selectedSuggestion === suggestion.id ? (
              <div className="space-y-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
                <label className="text-sm font-medium">Admin Response</label>
                <Textarea
                  value={adminNotes[suggestion.id] || ''}
                  onChange={(e) => setAdminNotes(prev => ({ ...prev, [suggestion.id]: e.target.value }))}
                  placeholder="Add your response or notes..."
                  className="min-h-[100px]"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleReview(suggestion.id, 'approved')}
                    disabled={reviewSuggestion.isPending}
                    className="gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleReview(suggestion.id, 'rejected')}
                    disabled={reviewSuggestion.isPending}
                    className="gap-2"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedSuggestion(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedSuggestion(suggestion.id)}
                className="gap-2"
              >
                Review Suggestion
              </Button>
            )}
          </div>
        </GlassPanel>
      ))}
    </div>
  );
}
