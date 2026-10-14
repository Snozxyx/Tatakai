// Sitemap serving invariants — see scripts/seo/sitemap-utils.mjs.
//
// Regression coverage for the Search Console "Sitemap is HTML" failure: any
// `/sitemap*.xml` (or `/sitemap.xsl`) URL must resolve to XML with an XML
// content type, never to the SPA fallback (`index.html`, `text/html`).
import { describe, test, expect } from 'bun:test';
import {
  SITEMAP_RE,
  canonicalSitemapPath,
  looksXml,
  degradedSitemapBody,
  sitemapContentType,
} from '../scripts/seo/sitemap-utils.mjs';

const SITE = 'https://tatakai.me';

describe('canonicalSitemapPath', () => {
  test('matches every child the sitemap index advertises', () => {
    for (const p of [
      '/sitemap.xml',
      '/sitemap-static.xml',
      '/sitemap-anime-1.xml',
      '/sitemap-manga-1.xml',
      '/sitemap-profiles.xml',
      '/sitemap-tierlists.xml',
      '/sitemap-playlists.xml',
      '/sitemap-posts.xml',
      '/sitemap.xsl',
    ]) {
      expect(canonicalSitemapPath(p)).toBe(p);
      expect(SITEMAP_RE.test(p)).toBe(true);
    }
  });

  test('tolerates a trailing slash by canonicalizing (never SPA fallback)', () => {
    expect(canonicalSitemapPath('/sitemap-anime-1.xml/')).toBe('/sitemap-anime-1.xml');
    expect(canonicalSitemapPath('/sitemap.xml/')).toBe('/sitemap.xml');
    expect(canonicalSitemapPath('/sitemap-tierlists.xml/')).toBe('/sitemap-tierlists.xml');
  });

  test('leaves non-sitemap SPA routes alone', () => {
    for (const p of ['/', '/anime/anilist-1', '/sitemap', '/sitemap.xml.bak', '/sitemapxml']) {
      expect(canonicalSitemapPath(p)).toBe(null);
      expect(SITEMAP_RE.test(p)).toBe(false);
    }
  });
});

describe('looksXml — upstream error-page guard', () => {
  test('accepts real sitemap payloads', () => {
    expect(looksXml('<?xml version="1.0"?>\n<urlset')).toBe(true);
    expect(looksXml('<sitemapindex xmlns')).toBe(true);
    expect(looksXml('  <?xml version="1.0"?>\n<urlset')).toBe(true);
    expect(looksXml('<xsl:stylesheet version="1.0"')).toBe(true);
  });

  test('rejects the HTML/JSON bodies that used to leak through as "Sitemap is HTML"', () => {
    expect(looksXml('<!DOCTYPE html><html')).toBe(false);
    expect(looksXml('<html><head></head><body></body></html>')).toBe(false);
    expect(looksXml('{"success":false,"error":"x"}')).toBe(false);
    expect(looksXml('')).toBe(false);
  });
});

describe('degradedSitemapBody — last resort is still valid XML', () => {
  test('index fallback is a parseable sitemapindex pointing at the static child', () => {
    const body = degradedSitemapBody('/sitemap.xml', SITE);
    expect(looksXml(body)).toBe(true);
    expect(body).toContain('<sitemapindex');
    expect(body).toContain(`${SITE}/sitemap-static.xml`);
  });

  test('child fallback is a parseable (empty) urlset', () => {
    for (const p of ['/sitemap-anime-1.xml', '/sitemap-playlists.xml', '/sitemap-posts.xml']) {
      const body = degradedSitemapBody(p, SITE);
      expect(looksXml(body)).toBe(true);
      expect(body).toContain('<urlset');
    }
  });
});

describe('sitemapContentType', () => {
  test('serves XML as application/xml and the stylesheet as text/xsl', () => {
    expect(sitemapContentType('/sitemap.xml')).toBe('application/xml; charset=utf-8');
    expect(sitemapContentType('/sitemap-anime-1.xml')).toBe('application/xml; charset=utf-8');
    expect(sitemapContentType('/sitemap.xsl')).toBe('text/xsl; charset=utf-8');
  });

  test('never advertises text/html for a sitemap URL', () => {
    for (const p of ['/sitemap.xml', '/sitemap-anime-1.xml', '/sitemap.xsl']) {
      expect(sitemapContentType(p)).not.toContain('text/html');
    }
  });
});
