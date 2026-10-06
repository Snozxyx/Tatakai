<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0"
  xmlns:html="http://www.w3.org/TR/REC-html40"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/">
    <html lang="en">
      <head>
        <title>
          <xsl:choose>
            <xsl:when test="sitemap:sitemapindex | sitemapindex">Tatakai — XML Sitemap Index</xsl:when>
            <xsl:otherwise>Tatakai — XML Sitemap</xsl:otherwise>
          </xsl:choose>
        </title>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style type="text/css">
          :root {
            --bg-body: #070a12;
            --bg-card: #0f172a;
            --bg-row-alt: #131d35;
            --bg-row-hover: #1e293b;
            --border: #1e293b;
            --border-highlight: #334155;
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --text-muted: #64748b;
            --accent: #818cf8;
            --accent-glow: rgba(99, 102, 241, 0.15);
            --badge-bg: rgba(129, 140, 248, 0.12);
            --badge-border: rgba(129, 140, 248, 0.3);
            --badge-text: #c7d2fe;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            background-color: var(--bg-body);
            color: var(--text-primary);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            font-size: 14px;
            line-height: 1.5;
            padding: 32px 16px;
            min-height: 100vh;
          }
          .container {
            max-width: 1100px;
            margin: 0 auto;
          }
          .header {
            background: linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 28px 32px;
            margin-bottom: 24px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(8px);
          }
          .brand {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 12px;
          }
          .brand-logo {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            background: linear-gradient(135deg, #6366f1, #a855f7);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            font-size: 18px;
            color: #ffffff;
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
          }
          .brand-name {
            font-size: 20px;
            font-weight: 700;
            letter-spacing: -0.02em;
            color: var(--text-primary);
          }
          .title {
            font-size: 26px;
            font-weight: 800;
            letter-spacing: -0.025em;
            margin-bottom: 8px;
            background: linear-gradient(120deg, #ffffff 60%, var(--accent));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }
          .description {
            color: var(--text-secondary);
            font-size: 14px;
            max-width: 720px;
            margin-bottom: 16px;
          }
          .description a {
            color: var(--accent);
            text-decoration: none;
          }
          .description a:hover {
            text-decoration: underline;
          }
          .meta-bar {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 16px;
            padding-top: 16px;
            border-top: 1px solid var(--border);
          }
          .badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 12px;
            border-radius: 9999px;
            background: var(--badge-bg);
            border: 1px solid var(--badge-border);
            color: var(--badge-text);
            font-weight: 600;
            font-size: 12px;
          }
          .breadcrumb {
            font-size: 13px;
            color: var(--text-secondary);
          }
          .breadcrumb a {
            color: var(--accent);
            text-decoration: none;
            font-weight: 600;
          }
          .breadcrumb a:hover {
            text-decoration: underline;
          }
          .card {
            background-color: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
          }
          .table-wrapper {
            overflow-x: auto;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
          }
          th {
            background-color: #0b1120;
            color: var(--text-secondary);
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            padding: 14px 20px;
            border-bottom: 1px solid var(--border);
            white-space: nowrap;
          }
          td {
            padding: 14px 20px;
            border-bottom: 1px solid var(--border);
            color: var(--text-primary);
            font-size: 13.5px;
            vertical-align: middle;
          }
          tr:last-child td {
            border-bottom: none;
          }
          tr:nth-child(even) {
            background-color: rgba(19, 29, 53, 0.3);
          }
          tr:hover td {
            background-color: var(--bg-row-hover);
          }
          .col-index {
            width: 50px;
            color: var(--text-muted);
            font-variant-numeric: tabular-nums;
          }
          .col-loc a {
            color: var(--accent);
            text-decoration: none;
            word-break: break-all;
            font-weight: 500;
            transition: color 0.15s ease;
          }
          .col-loc a:hover {
            color: #c7d2fe;
            text-decoration: underline;
          }
          .col-date {
            color: var(--text-secondary);
            font-variant-numeric: tabular-nums;
            white-space: nowrap;
          }
          .col-tag {
            white-space: nowrap;
          }
          .col-tag span {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 6px;
            font-size: 11.5px;
            background: rgba(100, 116, 139, 0.15);
            color: var(--text-secondary);
            border: 1px solid rgba(100, 116, 139, 0.25);
          }
          .footer {
            margin-top: 32px;
            text-align: center;
            color: var(--text-muted);
            font-size: 12.5px;
          }
          .footer a {
            color: var(--text-secondary);
            text-decoration: none;
          }
          .footer a:hover {
            color: var(--accent);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="brand">
              <div class="brand-logo">T</div>
              <div class="brand-name">Tatakai</div>
            </div>

            <xsl:choose>
              <xsl:when test="sitemap:sitemapindex | sitemapindex">
                <h1 class="title">XML Sitemap Index</h1>
                <p class="description">
                  This sitemap index lists all sub-sitemaps dynamically generated for
                  <a href="https://tatakai.me">tatakai.me</a>.
                  Search engines like Google and Bing crawl these files to discover and index anime, manga, and community content.
                </p>
                <div class="meta-bar">
                  <div class="badge">
                    <span>Sub-sitemaps:</span>
                    <strong style="color: #ffffff;"><xsl:value-of select="count(sitemap:sitemapindex/sitemap:sitemap | sitemapindex/sitemap)"/></strong>
                  </div>
                </div>
              </xsl:when>
              <xsl:otherwise>
                <h1 class="title">XML Sitemap</h1>
                <p class="description">
                  This XML sitemap lists URLs available for crawling on
                  <a href="https://tatakai.me">tatakai.me</a>.
                </p>
                <div class="meta-bar">
                  <div class="breadcrumb">
                    <span>Index: </span>
                    <a href="/sitemap.xml">&#8592; Back to sitemap.xml index</a>
                  </div>
                  <div class="badge">
                    <span>URLs:</span>
                    <strong style="color: #ffffff;"><xsl:value-of select="count(sitemap:urlset/sitemap:url | urlset/url)"/></strong>
                  </div>
                </div>
              </xsl:otherwise>
            </xsl:choose>
          </div>

          <div class="card">
            <div class="table-wrapper">
              <xsl:choose>
                <xsl:when test="sitemap:sitemapindex | sitemapindex">
                  <table>
                    <thead>
                      <tr>
                        <th class="col-index">#</th>
                        <th>Sitemap URL</th>
                        <th class="col-date">Last Modified</th>
                      </tr>
                    </thead>
                    <tbody>
                      <xsl:for-each select="sitemap:sitemapindex/sitemap:sitemap | sitemapindex/sitemap">
                        <tr>
                          <td class="col-index"><xsl:value-of select="position()"/></td>
                          <td class="col-loc">
                            <a>
                              <xsl:attribute name="href">
                                <xsl:value-of select="sitemap:loc | loc"/>
                              </xsl:attribute>
                              <xsl:value-of select="sitemap:loc | loc"/>
                            </a>
                          </td>
                          <td class="col-date">
                            <xsl:value-of select="sitemap:lastmod | lastmod"/>
                          </td>
                        </tr>
                      </xsl:for-each>
                    </tbody>
                  </table>
                </xsl:when>
                <xsl:otherwise>
                  <table>
                    <thead>
                      <tr>
                        <th class="col-index">#</th>
                        <th>URL</th>
                        <th class="col-tag">Change Freq</th>
                        <th class="col-tag">Priority</th>
                        <th class="col-date">Last Modified</th>
                      </tr>
                    </thead>
                    <tbody>
                      <xsl:for-each select="sitemap:urlset/sitemap:url | urlset/url">
                        <tr>
                          <td class="col-index"><xsl:value-of select="position()"/></td>
                          <td class="col-loc">
                            <a>
                              <xsl:attribute name="href">
                                <xsl:value-of select="sitemap:loc | loc"/>
                              </xsl:attribute>
                              <xsl:value-of select="sitemap:loc | loc"/>
                            </a>
                          </td>
                          <td class="col-tag">
                            <xsl:if test="sitemap:changefreq | changefreq">
                              <span><xsl:value-of select="sitemap:changefreq | changefreq"/></span>
                            </xsl:if>
                          </td>
                          <td class="col-tag">
                            <xsl:if test="sitemap:priority | priority">
                              <span><xsl:value-of select="sitemap:priority | priority"/></span>
                            </xsl:if>
                          </td>
                          <td class="col-date">
                            <xsl:value-of select="sitemap:lastmod | lastmod"/>
                          </td>
                        </tr>
                      </xsl:for-each>
                    </tbody>
                  </table>
                </xsl:otherwise>
              </xsl:choose>
            </div>
          </div>

          <div class="footer">
            <p>Generated dynamically for <a href="https://tatakai.me">Tatakai</a> &bull; Otaku Anime &amp; Manga Community</p>
          </div>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
