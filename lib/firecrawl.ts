import FirecrawlApp from "@mendable/firecrawl-js";

// Firecrawl wrapper. Scraping costs credits; scoring doesn't — so we cache raw
// results in the DB and let scoring re-run without re-scraping.
function app() {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not set");
  return new FirecrawlApp({ apiKey });
}

export interface RawResult {
  title: string;
  url: string;
  description: string;
}

// Search the web for a query, optionally constrained to one job board's domain.
// Firecrawl cannot scrape LinkedIn/Reddit and some boards degrade to snippets —
// we handle partial/empty results gracefully and never throw the whole scan.
// `tbs` is Google's time filter (e.g. "qdr:w" = past week) — we bias toward
// fresh listings at search time, then hard-filter by parsed age downstream.
export async function searchJobs(query: string, site?: string, limit = 6, tbs?: string): Promise<RawResult[]> {
  const q = site ? `${query} site:${site}` : query;
  try {
    const res: any = await app().search(q, tbs ? { limit, tbs } : { limit });
    const data: any[] = res?.data ?? res?.web ?? [];
    return data
      .map((r) => ({
        title: String(r.title ?? r.metadata?.title ?? "").trim(),
        url: String(r.url ?? r.link ?? "").trim(),
        description: String(r.description ?? r.snippet ?? r.markdown ?? "").slice(0, 1200).trim(),
      }))
      .filter((r) => r.title && r.url);
  } catch (err) {
    console.error(`Firecrawl search failed for "${q}":`, err);
    return [];
  }
}
