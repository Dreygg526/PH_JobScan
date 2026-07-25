import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scoreJobs, type ParsedCv } from "@/lib/claude";

export const runtime = "nodejs";
export const maxDuration = 300;

const BATCH = 8;

// Stage 3 (called repeatedly): score the next batch of unscored jobs.
// One failed batch skips rather than sinking the scan. Returns done=true when
// no unscored jobs remain, so the browser knows to stop looping.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { scanId } = await req.json();

  const { data: scan } = await supabase.from("scans").select("*").eq("id", scanId).single();
  if (!scan) return NextResponse.json({ error: "Scan not found" }, { status: 404 });

  const { data: cv } = await supabase.from("cvs").select("*").eq("id", scan.cv_id).single();
  if (!cv) return NextResponse.json({ error: "CV not found" }, { status: 404 });

  const profile: ParsedCv = {
    target_role: cv.target_role ?? "",
    seniority: cv.seniority ?? "",
    skills: cv.skills ?? [],
    summary: cv.summary ?? "",
    text: cv.parsed_text ?? "",
  };

  const { data: batch } = await supabase
    .from("jobs")
    .select("id, title, company, location, description")
    .eq("scan_id", scanId)
    .is("score", null)
    .limit(BATCH);

  if (!batch || batch.length === 0) {
    await supabase.from("scans").update({ progress: 90, step: "Scoring complete" }).eq("id", scanId);
    return NextResponse.json({ done: true, scored: 0 });
  }

  try {
    const results = await scoreJobs(profile, scan.intent ?? "", batch as any);
    const byId = new Map(results.map((r) => [r.id, r]));
    for (const job of batch) {
      const r = byId.get(job.id);
      await supabase
        .from("jobs")
        .update({
          score: Math.max(0, Math.min(100, Math.round(r?.score ?? 50))),
          reasoning: r?.reasoning ?? "Scored against your résumé.",
        })
        .eq("id", job.id);
    }
  } catch (e: any) {
    console.error("score batch failed:", e);
    // Give this batch a neutral score so it doesn't loop forever.
    for (const job of batch) {
      await supabase.from("jobs").update({ score: 50, reasoning: "Could not score this batch." }).eq("id", job.id);
    }
  }

  await supabase.from("scans").update({ step: "Scoring matches against your CV" }).eq("id", scanId);
  return NextResponse.json({ done: false, scored: batch.length });
}
