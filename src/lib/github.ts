// GitHub Releases + repo stats integration for Tatakai download/landing pages.
// Client-side, unauthenticated (60 req/hr per IP) with sessionStorage caching.
import { useEffect, useState } from "react";

export const GITHUB_OWNER = "snozxyx";
export const GITHUB_REPO = "tatakai";
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
export const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases`;

export type PlatformKey = "windows" | "macos" | "linux" | "android";

export interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
  download_count: number;
  content_type: string;
}

export interface GitHubRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
  assets: GitHubReleaseAsset[];
}

export interface GitHubRepoStats {
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  subscribers_count: number;
  watchers_count: number;
}

const TTL = 30 * 60 * 1000; // 30 min

async function ghFetch<T>(url: string, cacheKey: string, force = false): Promise<T | null> {
  try {
    if (!force && typeof sessionStorage !== "undefined") {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        const { t, d } = JSON.parse(raw);
        if (Date.now() - t < TTL) return d as T;
      }
    }
    const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as T;
    try {
      sessionStorage?.setItem(cacheKey, JSON.stringify({ t: Date.now(), d: data }));
    } catch {
      /* quota / private mode — non-fatal */
    }
    return data;
  } catch {
    return null;
  }
}

export const fetchRepoStats = () =>
  ghFetch<GitHubRepoStats>(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`, "gh:tatakai:repo");

export const fetchLatestRelease = () =>
  ghFetch<GitHubRelease>(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
    "gh:tatakai:latest",
  );

export const fetchAllReleases = (force = false) =>
  ghFetch<GitHubRelease[]>(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=20`,
    "gh:tatakai:releases",
    force,
  );
export function platformForAsset(fileName: string): PlatformKey | null {
  const n = fileName.toLowerCase();
  if (/\.(exe|msi)$/.test(n) || /win(dows|32|64)?|setup|portable/.test(n)) return "windows";
  if (/\.(dmg|pkg)$/.test(n) || /mac(os)?|darwin|osx|apple|universal/.test(n)) return "macos";
  if (/\.(appimage|deb|rpm|snap|flatpak)$/.test(n) || /linux/.test(n)) return "linux";
  if (/\.(apk|aab)$/.test(n) || /android/.test(n)) return "android";
  return null;
}

export function platformKeyForName(name: string): PlatformKey | null {
  switch (name.toLowerCase()) {
    case "windows":
      return "windows";
    case "macos":
      return "macos";
    case "linux":
      return "linux";
    case "android":
      return "android";
    default:
      return null;
  }
}

export function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return (mb / 1024).toFixed(1) + " GB";
  if (mb >= 1) return Math.round(mb) + " MB";
  return Math.max(1, Math.round(bytes / 1024)) + " KB";
}

export function firstLine(body: string | null | undefined, max = 140): string | undefined {
  if (!body) return undefined;
  const line = body
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find((s) => s && !s.startsWith("#"));
  if (!line) return undefined;
  const clean = line.replace(/^[-*]\s*/, "").replace(/[*_`>#]/g, "").trim();
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}
export function useGitHubRepo(): GitHubRepoStats | null {
  const [stats, setStats] = useState<GitHubRepoStats | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchRepoStats().then((d) => !cancelled && setStats(d));
    return () => {
      cancelled = true;
    };
  }, []);
  return stats;
}

export function useLatestRelease(): GitHubRelease | null {
  const [rel, setRel] = useState<GitHubRelease | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchLatestRelease().then((d) => !cancelled && setRel(d));
    return () => {
      cancelled = true;
    };
  }, []);
  return rel;
}

export function useAllReleases(): GitHubRelease[] | null {
  const [rels, setRels] = useState<GitHubRelease[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchAllReleases().then((d) => !cancelled && setRels(d));
    return () => {
      cancelled = true;
    };
  }, []);
  return rels;
}
