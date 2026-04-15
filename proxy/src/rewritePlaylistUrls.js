function rewritePlaylistUrls(playlistText, baseUrl, options = {}) {
  const base = new URL(baseUrl);
  const referer = typeof options.referer === 'string' ? options.referer : '';
  const userAgent = typeof options.userAgent === 'string' ? options.userAgent : '';
  const type = typeof options.type === 'string' ? options.type : 'video';
  const proxyPassword = typeof options.proxyPassword === 'string' ? options.proxyPassword : '';
  
  const rewriteUrl = (targetUrl) => {
    try {
      const resolvedUrl = new URL(targetUrl, base).href;
      const params = new URLSearchParams({ url: resolvedUrl });
      if (type) params.set('type', type);
      if (referer) params.set('referer', referer);
      if (userAgent) params.set('userAgent', userAgent);
      if (proxyPassword) params.set('password', proxyPassword);
      return `/api/v1/streamingProxy?${params.toString()}`;
    } catch (e) {
      console.warn('Failed to resolve URL:', targetUrl);
      return targetUrl; 
    }
  };

  return playlistText
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed === "") return line;

      if (trimmed.startsWith("#")) {
        return trimmed.replace(/URI="([^"]+)"/g, (match, p1) => {
          return `URI="${rewriteUrl(p1)}"`;
        });
      }
      return rewriteUrl(trimmed);
    })
    .join("\n");
}

module.exports = { rewritePlaylistUrls };