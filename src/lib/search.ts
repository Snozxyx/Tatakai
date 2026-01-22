/**
 * Enhanced search utilities with fuzzy matching
 */

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1, // deletion
          dp[i][j - 1] + 1, // insertion
          dp[i - 1][j - 1] + 1 // substitution
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculate similarity score (0-1) between two strings
 */
function similarityScore(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  return 1 - distance / maxLen;
}

/**
 * Fuzzy search - find best matches from a list
 */
export function fuzzySearch<T>(
  query: string,
  items: T[],
  getText: (item: T) => string,
  threshold = 0.6
): Array<{ item: T; score: number }> {
  if (!query.trim()) return items.map((item) => ({ item, score: 1 }));

  const queryLower = query.toLowerCase();
  const results: Array<{ item: T; score: number }> = [];

  for (const item of items) {
    const text = getText(item).toLowerCase();
    
    // Exact match
    if (text === queryLower) {
      results.push({ item, score: 1 });
      continue;
    }

    // Starts with
    if (text.startsWith(queryLower)) {
      results.push({ item, score: 0.9 });
      continue;
    }

    // Contains
    if (text.includes(queryLower)) {
      results.push({ item, score: 0.8 });
      continue;
    }

    // Fuzzy match
    const score = similarityScore(queryLower, text);
    if (score >= threshold) {
      results.push({ item, score });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Tokenize search query for better matching
 */
export function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

/**
 * Check if item matches all tokens (AND search)
 */
export function matchesAllTokens(text: string, tokens: string[]): boolean {
  const textLower = text.toLowerCase();
  return tokens.every((token) => textLower.includes(token));
}

/**
 * Check if item matches any token (OR search)
 */
export function matchesAnyToken(text: string, tokens: string[]): boolean {
  const textLower = text.toLowerCase();
  return tokens.some((token) => textLower.includes(token));
}

/**
 * Advanced search with filters
 */
export interface SearchFilters {
  genres?: string[];
  tags?: string[];
  type?: string;
  year?: number;
  rating?: { min?: number; max?: number };
  status?: string;
  sortBy?: 'relevance' | 'rating' | 'year' | 'name' | 'popularity';
  sortOrder?: 'asc' | 'desc';
}

export function applySearchFilters<T>(
  items: T[],
  filters: SearchFilters,
  getItemData: (item: T) => {
    name: string;
    genres?: string[];
    tags?: string[];
    type?: string;
    year?: number;
    rating?: number;
    status?: string;
    popularity?: number;
  }
): T[] {
  let filtered = [...items];

  // Filter by genres
  if (filters.genres && filters.genres.length > 0) {
    filtered = filtered.filter((item) => {
      const data = getItemData(item);
      return filters.genres!.some((genre) =>
        data.genres?.some((g) => g.toLowerCase() === genre.toLowerCase())
      );
    });
  }

  // Filter by tags
  if (filters.tags && filters.tags.length > 0) {
    filtered = filtered.filter((item) => {
      const data = getItemData(item);
      return filters.tags!.some((tag) =>
        data.tags?.some((t) => t.toLowerCase() === tag.toLowerCase())
      );
    });
  }

  // Filter by type
  if (filters.type) {
    filtered = filtered.filter(
      (item) => getItemData(item).type?.toLowerCase() === filters.type!.toLowerCase()
    );
  }

  // Filter by year
  if (filters.year) {
    filtered = filtered.filter((item) => getItemData(item).year === filters.year);
  }

  // Filter by rating
  if (filters.rating) {
    filtered = filtered.filter((item) => {
      const rating = getItemData(item).rating;
      if (!rating) return false;
      if (filters.rating!.min !== undefined && rating < filters.rating!.min) return false;
      if (filters.rating!.max !== undefined && rating > filters.rating!.max) return false;
      return true;
    });
  }

  // Filter by status
  if (filters.status) {
    filtered = filtered.filter(
      (item) => getItemData(item).status?.toLowerCase() === filters.status!.toLowerCase()
    );
  }

  // Sort
  const sortBy = filters.sortBy || 'relevance';
  const sortOrder = filters.sortOrder || 'desc';

  filtered.sort((a, b) => {
    const aData = getItemData(a);
    const bData = getItemData(b);

    let comparison = 0;

    switch (sortBy) {
      case 'rating':
        comparison = (aData.rating || 0) - (bData.rating || 0);
        break;
      case 'year':
        comparison = (aData.year || 0) - (bData.year || 0);
        break;
      case 'name':
        comparison = (aData.name || '').localeCompare(bData.name || '');
        break;
      case 'popularity':
        comparison = (aData.popularity || 0) - (bData.popularity || 0);
        break;
      default:
        return 0;
    }

    return sortOrder === 'asc' ? comparison : -comparison;
  });

  return filtered;
}
