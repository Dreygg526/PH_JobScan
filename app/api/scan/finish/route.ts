import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scoreBand } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Stage 4: compute stats and mark the scan done.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { scanId } = await req.json();

  const { data: jobs } = await supabase
    .from("jobs")
    .select("source, score")
    .eq("scan_id", scanId);

  const list = jobs ?? [];
  const stats = {
    total: list.length,
    strong: list.filter((j) => scoreBand(j.score) === "strong").length,
    good: list.filter((j) => scoreBand(j.score) === "good").length,
    bySource: list.reduce<Record<string, number>>((acc, j) => {
      acc[j.source] = (acc[j.source] ?? 0) + 1;
      return acc;
    }, {}),
  };

  await supabase
    .from("scans")
    .update({ status: "done", progress: 100, step: "Done", stats, finished_at: new Date().toISOString() })
    .eq("id", scanId);

  return NextResponse.json({ stats });
}
