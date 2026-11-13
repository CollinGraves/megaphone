import { describe, expect, it } from "vitest";
import { canonicalizeUrl, parseFeed, parseHtmlMeta, parseSitemap, stripHtml, truncate } from "./parse";

describe("parseFeed", () => {
  it("parses RSS 2.0 items with CDATA and inline markup in titles", () => {
    const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>
      <item><title><a href="/x">Nvidia &amp; partners ship AI</a></title><link>https://ex.com/a?utm_source=rss</link>
      <description><![CDATA[<p>Hello <b>world</b></p>]]></description><pubDate>Wed, 11 Nov 2026 00:45:26 +0100</pubDate><dc:creator>Jane</dc:creator></item>
      <item><title>No link</title></item>
    </channel></rss>`;
    const items = parseFeed(xml);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ url: "https://ex.com/a", title: "Nvidia & partners ship AI", excerpt: "Hello world", author: "Jane" });
    expect(items[0].publishedAt?.toISOString()).toBe("2026-11-10T23:45:26.000Z");
  });

  it("parses Atom entries and picks the alternate link", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>v1.2 released</title>
      <link rel="self" href="https://api.ex.com/1"/><link rel="alternate" href="https://ex.com/releases/1"/>
      <updated>2026-11-01T10:00:00Z</updated><summary>Fixes</summary></entry></feed>`;
    expect(parseFeed(xml)[0]).toMatchObject({ url: "https://ex.com/releases/1", title: "v1.2 released", excerpt: "Fixes" });
  });

  it("parses RDF (RSS 1.0) feeds such as arXiv", () => {
    const xml = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <item><title>A paper</title><link>https://arxiv.org/abs/1</link><dc:date>2026-11-12</dc:date></item></rdf:RDF>`;
    expect(parseFeed(xml)[0]).toMatchObject({ url: "https://arxiv.org/abs/1", title: "A paper" });
  });
});

describe("helpers", () => {
  it("canonicalizes tracking params, fragments and trailing slashes", () => {
    expect(canonicalizeUrl("https://Ex.com/post/?utm_medium=x&id=3#top")).toBe("https://ex.com/post?id=3");
  });
  it("strips html and truncates on word boundaries", () => {
    expect(stripHtml("<p>A&nbsp;<em>b</em></p>")).toBe("A b");
    expect(truncate("one two three four", 9)).toBe("one two…");
  });
  it("parses sitemaps and sitemap indexes", () => {
    expect(parseSitemap(`<urlset><url><loc>https://ex.com/news/a</loc><lastmod>2026-11-01</lastmod></url></urlset>`).urls[0].url).toBe(
      "https://ex.com/news/a",
    );
    expect(parseSitemap(`<sitemapindex><sitemap><loc>https://ex.com/s1.xml</loc></sitemap></sitemapindex>`).sitemaps).toEqual([
      "https://ex.com/s1.xml",
    ]);
  });
  it("reads og meta from html", () => {
    const meta = parseHtmlMeta(
      `<head><title>Fallback</title><meta property="og:title" content="Real title"><meta name="description" content="Desc"><meta property="article:published_time" content="2026-11-02T00:00:00Z"></head>`,
    );
    expect(meta).toMatchObject({ title: "Real title", description: "Desc" });
    expect(meta.publishedAt?.toISOString()).toBe("2026-11-02T00:00:00.000Z");
  });
});
