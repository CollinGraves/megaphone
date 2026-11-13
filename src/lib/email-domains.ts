/**
 * Email-domain classification. A business domain is the key that lets North Labs enrich a lead
 * (company size, industry, other contacts), so we classify every sign-up email.
 * Pure module: safe to import from client components.
 */

const FREE_EMAIL_DOMAINS = new Set([
  // Global consumer providers
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "passport.com",
  "yahoo.com", "ymail.com", "rocketmail.com", "aol.com", "aim.com", "icloud.com", "me.com", "mac.com",
  "proton.me", "protonmail.com", "protonmail.ch", "pm.me", "tutanota.com", "tuta.io", "zoho.com", "zohomail.com",
  "gmx.com", "gmx.net", "gmx.de", "mail.com", "email.com", "hey.com", "fastmail.com", "fastmail.fm",
  "yandex.com", "yandex.ru", "mail.ru", "inbox.com", "hushmail.com", "mailfence.com", "posteo.de",
  // Regional variants
  "hotmail.co.uk", "hotmail.fr", "hotmail.de", "hotmail.it", "hotmail.es", "outlook.de", "outlook.fr",
  "live.co.uk", "live.fr", "yahoo.co.uk", "yahoo.fr", "yahoo.de", "yahoo.it", "yahoo.es", "yahoo.ca",
  "yahoo.com.au", "yahoo.co.in", "yahoo.co.jp", "web.de", "t-online.de", "orange.fr", "free.fr", "laposte.net",
  "libero.it", "virgilio.it", "btinternet.com", "sky.com", "virginmedia.com", "ntlworld.com", "bigpond.com",
  "rediffmail.com", "qq.com", "163.com", "126.com", "sina.com", "naver.com", "daum.net", "hanmail.net",
  // US ISPs
  "comcast.net", "verizon.net", "att.net", "sbcglobal.net", "bellsouth.net", "cox.net", "charter.net",
  "earthlink.net", "optonline.net", "frontier.com", "windstream.net", "juno.com", "netzero.net",
]);

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "sharklasers.com", "10minutemail.com",
  "tempmail.com", "temp-mail.org", "throwawaymail.com", "yopmail.com", "trashmail.com", "getnada.com",
  "maildrop.cc", "dispostable.com", "fakeinbox.com", "mintemail.com", "mohmal.com", "emailondeck.com",
  "burnermail.io", "spamgourmet.com", "mailnesia.com", "tempr.email", "discard.email",
]);

/** Domains that are business-like but tell us nothing about an employer (education, personal relays). */
const ACADEMIC_TLD = /\.(edu|ac\.[a-z]{2}|edu\.[a-z]{2})$/;

export type EmailKind = "work" | "personal" | "disposable" | "academic" | "invalid";

export const emailDomain = (email: string) => email.split("@")[1]?.trim().toLowerCase() ?? "";

export function classifyEmail(email: string): EmailKind {
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "invalid";
  const domain = emailDomain(trimmed);
  if (DISPOSABLE_DOMAINS.has(domain)) return "disposable";
  if (FREE_EMAIL_DOMAINS.has(domain)) return "personal";
  if (ACADEMIC_TLD.test(domain)) return "academic";
  return "work";
}

export const isWorkEmail = (email: string) => classifyEmail(email) === "work";

/** The registrable company domain, e.g. "mail.us.acme.co.uk" → "acme.co.uk". */
export function companyDomain(domain: string): string {
  const parts = domain.toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const secondLevel = new Set(["co", "com", "org", "net", "gov", "ac", "edu"]);
  const take = parts.length >= 3 && secondLevel.has(parts[parts.length - 2]) && parts[parts.length - 1].length === 2 ? 3 : 2;
  return parts.slice(-take).join(".");
}

/** Best-effort company name from a domain: "acme-corp.com" → "Acme Corp". Used only to prefill forms. */
export function guessCompanyName(domain: string): string {
  const root = companyDomain(domain).split(".")[0] ?? "";
  return root
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => (w.length <= 3 && w !== "the" ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}
