import { XMLParser } from "fast-xml-parser";

export type FeedItem = {
  url: string;
  title: string;
  excerpt: string | null;
  author: string | null;
  publishedAt: Date | null;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  cdataPropName: "#cdata",
  processEntities: true,
  htmlEntities: true,
  trimValues: true,
});

const asArray = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** Pull plain text out of whatever shape fast-xml-parser produced. */
function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("#cdata" in o) return text(o["#cdata"]);
    if ("#text" in o) return text(o["#text"]);
    if ("name" in o) return text(o.name);
    // Inline markup inside a text node (e.g. <title><a href="…">Headline</a></title>)
    return Object.entries(o)
      .filter(([k]) => !k.startsWith("@_"))
      .map(([, child]) => text(child))
      .join(" ")
      .trim();
  }
  return "";
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(s: string, max: number) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).trimEnd() + "…";
}

function parseDate(v: unknown): Date | null {
  const s = text(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Strip tracking params and fragments so the same article from two feeds dedupes by URL. */
export function canonicalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|ref$|ref_src$|source$|fbclid$|gclid$|mc_cid$|mc_eid$|guccounter)/i.test(key)) u.searchParams.delete(key);
    }
    u.hostname = u.hostname.toLowerCase();
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString();
  } catch {
    return raw.trim();
  }
}

function atomLink(link: unknown): string {
  const links = asArray(link as Record<string, string> | Record<string, string>[]);
  const alt = links.find((l) => typeof l === "object" && (!l["@_rel"] || l["@_rel"] === "alternate"));
  const chosen = alt ?? links[0];
  if (typeof chosen === "string") return chosen;
  return chosen?.["@_href"] ?? "";
}

/** Parses RSS 2.0, RSS 1.0 (RDF, e.g. arXiv) and Atom. */
export function parseFeed(xml: string): FeedItem[] {
  const doc = parser.parse(xml);
  const items: FeedItem[] = [];

  const rssItems = asArray(doc?.rss?.channel?.item);
  const rdfItems = asArray(doc?.["rdf:RDF"]?.item);
  for (const it of [...rssItems, ...rdfItems]) {
    const url = text(it.link) || (typeof it.guid === "string" ? it.guid : text(it.guid));
    const title = stripHtml(text(it.title));
    if (!url || !title || !/^https?:/i.test(url)) continue;
    const desc = text(it["content:encoded"]) || text(it.description);
    items.push({
      url: canonicalizeUrl(url),
      title,
      excerpt: desc ? truncate(stripHtml(desc), 600) : null,
      author: text(it["dc:creator"]) || text(it.author) || null,
      publishedAt: parseDate(it.pubDate) ?? parseDate(it["dc:date"]),
    });
  }

  for (const entry of asArray(doc?.feed?.entry)) {
    const url = atomLink(entry.link);
    const title = stripHtml(text(entry.title));
    if (!url || !title) continue;
    const desc = text(entry.summary) || text(entry.content);
    items.push({
      url: canonicalizeUrl(url),
      title,
      excerpt: desc ? truncate(stripHtml(desc), 600) : null,
      author: text(asArray(entry.author)[0]) || null,
      publishedAt: parseDate(entry.published) ?? parseDate(entry.updated),
    });
  }

  return items;
}

export type SitemapEntry = { url: string; lastModified: Date | null };

export function parseSitemap(xml: string): { urls: SitemapEntry[]; sitemaps: string[] } {
  const doc = parser.parse(xml);
  const urls = asArray(doc?.urlset?.url)
    .map((u: Record<string, unknown>) => ({ url: text(u.loc), lastModified: parseDate(u.lastmod) }))
    .filter((u) => u.url);
  const sitemaps = asArray(doc?.sitemapindex?.sitemap)
    .map((s: Record<string, unknown>) => text(s.loc))
    .filter(Boolean);
  return { urls, sitemaps };
}

/** Extract title/description/published date from an article page's <head>. */
export function parseHtmlMeta(html: string): { title: string | null; description: string | null; publishedAt: Date | null } {
  const head = html.slice(0, 200_000);
  const meta = (name: string) => {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`,
      "i",
    );
    const m = head.match(re);
    return m ? stripHtml(m[1] ?? m[2] ?? "") || null : null;
  };
  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const published = meta("article:published_time") ?? meta("og:published_time") ?? meta("date");
  const date = published ? new Date(published) : null;
  return {
    title: meta("og:title") ?? (titleTag ? stripHtml(titleTag) : null),
    description: meta("og:description") ?? meta("description"),
    publishedAt: date && !Number.isNaN(date.getTime()) ? date : null,
  };
}
