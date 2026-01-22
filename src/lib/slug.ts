// Small helper to generate short slugs for shareable playlists
export function generateShortSlug(length = 8) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < length; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}
