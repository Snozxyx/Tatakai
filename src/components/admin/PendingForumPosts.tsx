import { useState } from 'react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { usePendingForumPosts, useApproveForumPost, useRejectForumPost } from '@/hooks/useForum';
import { formatDistanceToNow } from 'date-fns';
import { Search, CheckCircle, XCircle, Image as ImageIcon, Eye, User, AlertTriangle } from 'lucide-react';
import { getProxiedImageUrl } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

export function PendingForumPosts() {
  const [searchTerm, setSearchTerm] = useState('');
  const { data: posts, isLoading } = usePendingForumPosts();
  const approvePost = useApproveForumPost();
  const rejectPost = useRejectForumPost();
  const { toast } = useToast();

  const handleApprove = async (postId: string) => {
    try {
      await approvePost.mutateAsync({ postId });
      toast({ title: 'Post approved successfully' });
    } catch (error) {
      toast({ title: 'Failed to approve post', variant: 'destructive' });
    }
  };

  const handleReject = async (postId: string) => {
    try {
      await rejectPost.mutateAsync({ postId });
      toast({ title: 'Post rejected and deleted' });
    } catch (error) {
      toast({ title: 'Failed to reject post', variant: 'destructive' });
    }
  };

  const filteredPosts = posts?.filter((post) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      post.title.toLowerCase().includes(searchLower) ||
      post.content.toLowerCase().includes(searchLower) ||
      post.profiles?.username?.toLowerCase().includes(searchLower) ||
      post.profiles?.display_name?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Pending Forum Posts</h2>
          <p className="text-sm text-gray-400 mt-1">
            Review and approve forum posts with images
          </p>
        </div>
        <Badge variant="secondary" className="text-lg px-4 py-2">
          {filteredPosts?.length || 0} Pending
        </Badge>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <Input
          placeholder="Search by title, content, or user..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-400"
        />
      </div>

      {isLoading ? (
        <GlassPanel className="p-8 text-center">
          <p className="text-gray-400">Loading pending posts...</p>
        </GlassPanel>
      ) : filteredPosts && filteredPosts.length > 0 ? (
        <div className="grid gap-6">
          {filteredPosts.map((post) => (
            <GlassPanel key={post.id} className="p-6">
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10">
                      {post.profiles?.avatar_url ? (
                        <AvatarImage
                          src={getProxiedImageUrl(post.profiles.avatar_url)}
                          alt={post.profiles.display_name || post.profiles.username}
                        />
                      ) : null}
                      <AvatarFallback>
                        <User className="w-5 h-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-white">
                        {post.profiles?.display_name || post.profiles?.username || 'Unknown User'}
                      </p>
                      <p className="text-sm text-gray-400">
                        @{post.profiles?.username || 'unknown'} •{' '}
                        {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {post.flair && (
                      <Badge variant="outline">{post.flair}</Badge>
                    )}
                    {post.is_spoiler && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Spoiler
                      </Badge>
                    )}
                    {post.image_url && (
                      <Badge variant="secondary" className="gap-1">
                        <ImageIcon className="w-3 h-3" />
                        Image
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">{post.title}</h3>
                  <p className="text-gray-300 whitespace-pre-wrap">{post.content}</p>
                </div>

                {/* Image */}
                {post.image_url && (
                  <div className="rounded-lg overflow-hidden border border-white/10">
                    <img
                      src={post.image_url}
                      alt="Post image"
                      className="w-full max-h-96 object-contain bg-black/20"
                    />
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-3 pt-4 border-t border-white/10">
                  <Button
                    onClick={() => handleApprove(post.id)}
                    disabled={approvePost.isPending}
                    className="gap-2 bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Approve
                  </Button>
                  <Button
                    onClick={() => handleReject(post.id)}
                    disabled={rejectPost.isPending}
                    variant="destructive"
                    className="gap-2"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject
                  </Button>
                  <Button
                    onClick={() => window.open(`/community/forum/${post.id}`, '_blank')}
                    variant="outline"
                    className="gap-2 ml-auto"
                  >
                    <Eye className="w-4 h-4" />
                    Preview
                  </Button>
                </div>
              </div>
            </GlassPanel>
          ))}
        </div>
      ) : (
        <GlassPanel className="p-8 text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <p className="text-gray-400">
            {searchTerm ? 'No pending posts match your search' : 'All caught up! No posts pending approval.'}
          </p>
        </GlassPanel>
      )}
    </div>
  );
}
