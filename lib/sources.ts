import { MAX_AGE_DAYS, type SourceId } from "./types";
import { searchJobs, type RawResult } from "./firecrawl";

// Only surface fresh listings. Boards don't return a structured post date, so we
// (1) bias the search to the past week via Google's time filter, then
// (2) parse relative-age phrases from the snippet and drop anything older.
const SEARCH_TBS = "qdr:w"; // past week — the tightest standard Google window

// Domain each source id maps to for a site-constrained search.
const DOMAIN: Record<SourceId, string> = {
  indeed: "ph.indeed.com",
  jobsph: "jobs.ph",
  onlinejobsph: "onlinejobs.ph",
};

// Guess a company name out of a snippet/title when the board doesn't give one.
function guessCompany(r: RawResult): string | null {
  const dash = r.title.split(/[-–—|]/);
  if (dash.length > 1) return dash[dash.length - 1].trim() || null;
  return null;
}

// Pull an approximate age (in days) out of a listing's text. Boards phrase it
// many ways: "3 days ago", "Posted today", "Active 2 weeks ago", "30+ days ago".
// Returns null when no age is stated (we keep those — the search already
// constrained to the past week).
export function parseAgeDays(text: string): number | null {
  const t = text.toLowerCase();
  if (/\b(just posted|posted today|active today|posted just now|hiring now)\b/.test(t)) return 0;
  if (/\byesterday\b/.test(t)) return 1;

  // "N+ days ago" / "N days ago" / "N hours ago" / "N weeks ago" / "N months ago"
  const m = t.match(/\b(?:posted|active|updated|reposted)?\s*(\d+)\s*\+?\s*(hour|hr|day|week|month)s?\s*ago\b/);
  if (m) {
    const n = parseInt(m[1], 10);
    const unit = m[2];
    if (unit.startsWith("hour") || unit === "hr") return 0;
    if (unit.startsWith("day")) return n;
    if (unit.startsWith("week")) return n * 7;
    if (unit.startsWith("month")) return n * 30;
  }
  // Bare "30+ days" (Indeed's catch-all for old posts)
  const d = t.match(/\b(\d+)\s*\+?\s*days?\b/);
  if (d) return parseInt(d[1], 10);
  return null;
}

export interface ScrapedJob {
  source: SourceId;
  title: string;
  company: string | null;
  location: string;
  url: string;
  description: string;
}

// Run every query against one source and de-dupe by URL. Only fresh listings
// survive: the search is constrained to the past week, and any result whose
// stated age exceeds MAX_AGE_DAYS is dropped. Undated results are kept (the
// week-constrained search already bounds them).
export async function scrapeSource(source: SourceId, queries: string[]): Promise<ScrapedJob[]> {
  const domain = DOMAIN[source];
  const seen = new Set<string>();
  const out: ScrapedJob[] = [];

  for (const query of queries) {
    const results = await searchJobs(query, domain, 6, SEARCH_TBS);
    for (const r of results) {
      if (seen.has(r.url)) continue;
      seen.add(r.url);

      const age = parseAgeDays(`${r.title} ${r.description}`);
      if (age !== null && age > MAX_AGE_DAYS) continue; // stale — skip

      out.push({
        source,
        title: r.title.split(/[-–—|]/)[0].trim() || r.title,
        company: guessCompany(r),
        location: "Remote · PH",
        url: r.url,
        description: r.description,
      });
    }
  }
  return out;
}
