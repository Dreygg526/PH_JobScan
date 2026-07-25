import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scrapeSource } from "@/lib/sources";
import type { SourceId } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

// Stage 2 (one call per source): scrape a single board and insert raw jobs.
// Kept short so no single request risks the serverless timeout; the browser
// calls this once per source so results stream in board-by-board.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { scanId, source } = (await req.json()) as { scanId: string; source: SourceId };

  const { data: scan, error } = await supabase
    .from("scans")
    .select("*")
    .eq("id", scanId)
    .single();
  if (error || !scan) return NextResponse.json({ error: "Scan not found" }, { status: 404 });

  let count = 0;
  try {
    const jobs = await scrapeSource(source, scan.queries ?? []);
    if (jobs.length) {
      const rows = jobs.map((j) => ({
        scan_id: scanId,
        user_id: user.id,
        source: j.source,
        title: j.title,
        company: j.company,
        location: j.location,
        url: j.url,
        description: j.description,
      }));
      const { error: insErr, count: inserted } = await supabase
        .from("jobs")
        .insert(rows, { count: "exact" });
      if (insErr) throw insErr;
      count = inserted ?? rows.length;
    }
  } catch (e: any) {
    // A failed source must not sink the scan — record and move on.
    console.error(`scrape ${source} failed:`, e);
  }

  const idx = (scan.sources ?? []).indexOf(source);
  const progress = Math.min(70, 20 + Math.round(((idx + 1) / Math.max(1, (scan.sources ?? []).length)) * 50));
  await supabase
    .from("scans")
    .update({ progress, step: `Read listings from ${source}` })
    .eq("id", scanId);

  return NextResponse.json({ count });
}
