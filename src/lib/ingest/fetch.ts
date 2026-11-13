import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { articles, type Source } from "@/db/schema";
import { pMap } from "@/lib/concurrency";
import { appUrl } from "@/lib/env";
import { canonicalizeUrl, parseFeed, parseHtmlMeta, parseSitemap, truncate, type FeedItem } from "./parse";

const MAX_AGE_DAYS = 14;
const USER_AGENT = () => `AI-Radar/1.0 (+${appUrl()})`;

async function fetchText(url: string, timeoutMs = 15_000): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT(),
      accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

const isRecent = (d: Date | null, now = Date.now()) =>
  !d || now - d.getTime() <= MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

/** Fetch the latest items from a source. Returns only items not already stored. */
export async function fetchSourceItems(source: Source): Promise<FeedItem[]> {
  const items = source.type === "sitemap" ? await fetchSitemapItems(source) : await fetchFeedItems(source);
  if (items.length === 0) return [];
  const existing = await db
    .select({ url: articles.url })
    .from(articles)
    .where(
      inArray(
        articles.url,
        items.map((i) => i.url),
      ),
    );
  const seen = new Set(existing.map((e) => e.url));
  return items.filter((i) => !seen.has(i.url));
}

async function fetchFeedItems(source: Source): Promise<FeedItem[]> {
  const xml = await fetchText(source.feedUrl);
  const items = parseFeed(xml)
    .filter((i) => isRecent(i.publishedAt))
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
  const unique = new Map(items.map((i) => [i.url, i]));
  return [...unique.values()].slice(0, source.maxItemsPerFetch);
}

/**
 * For publishers without RSS (e.g. some vendor newsrooms): read the sitemap, keep recent URLs
 * under `pathFilter`, then fetch each new page's <head> for title/description/date.
 */
async function fetchSitemapItems(source: Source): Promise<FeedItem[]> {
  const root = parseSitemap(await fetchText(source.feedUrl));
  let entries = root.urls;
  if (root.sitemaps.length) {
    const children = root.sitemaps.slice(0, 8);
    const nested = await pMap(children, 3, async (url) => {
      try {
        return parseSitemap(await fetchText(url)).urls;
      } catch {
        return [];
      }
    });
    entries = entries.concat(nested.flat());
  }
  const filter = source.pathFilter;
  const candidates = entries
    .filter((e) => (filter ? new URL(e.url, source.feedUrl).pathname.includes(filter) : true))
    .filter((e) => {
      // Skip the section index page itself (e.g. /news/)
      const path = new URL(e.url, source.feedUrl).pathname.replace(/\/$/, "");
      return !filter || path !== filter.replace(/\/$/, "");
    })
    .filter((e) => e.lastModified && isRecent(e.lastModified))
    .sort((a, b) => (b.lastModified?.getTime() ?? 0) - (a.lastModified?.getTime() ?? 0))
    .slice(0, source.maxItemsPerFetch)
    .map((e) => ({ ...e, url: canonicalizeUrl(e.url) }));
  if (candidates.length === 0) return [];

  const existing = await db
    .select({ url: articles.url })
    .from(articles)
    .where(
      inArray(
        articles.url,
        candidates.map((c) => c.url),
      ),
    );
  const seen = new Set(existing.map((e) => e.url));
  const fresh = candidates.filter((c) => !seen.has(c.url));

  const pages = await pMap(fresh, 3, async (entry): Promise<FeedItem | null> => {
    try {
      const meta = parseHtmlMeta(await fetchText(entry.url, 10_000));
      if (!meta.title) return null;
      const publishedAt = meta.publishedAt ?? entry.lastModified;
      if (!isRecent(publishedAt)) return null;
      return {
        url: entry.url,
        title: meta.title.replace(/\s*[|\-–—]\s*[^|\-–—]{2,40}$/, "").trim() || meta.title,
        excerpt: meta.description ? truncate(meta.description, 600) : null,
        author: null,
        publishedAt,
      };
    } catch {
      return null;
    }
  });
  return pages.filter((p): p is FeedItem => p !== null);
}
