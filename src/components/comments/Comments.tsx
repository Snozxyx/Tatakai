/**
 * The one comment thread used across every surface (anime, manga, playlists,
 * tier lists, forum posts). The implementation lives alongside the anime video
 * components for historical reasons; this is the canonical import path.
 *
 *   <Comments entityType="manga" entityId={mangaId} entityName={title} />
 */
export { Comments, type CommentsProps } from '@/components/video/EpisodeComments';
