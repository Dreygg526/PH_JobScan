import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildQueries, type ParsedCv } from "@/lib/claude";
import { SOURCES, type SourceId } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// Stage 1: validate the CV, build search queries, create the scan row.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { cvId, intent = "", sources } = await req.json();
  const chosen: SourceId[] =
    Array.isArray(sources) && sources.length ? sources : SOURCES.map((s) => s.id);

  const { data: cv, error } = await supabase
    .from("cvs")
    .select("*")
    .eq("id", cvId)
    .single();
  if (error || !cv) return NextResponse.json({ error: "CV not found" }, { status: 404 });
  if (!cv.parsed_text && !cv.target_role) {
    return NextResponse.json(
      { error: "This CV hasn't been parsed yet — re-upload it once ANTHROPIC_API_KEY is set." },
      { status: 400 },
    );
  }

  const profile: ParsedCv = {
    target_role: cv.target_role ?? "",
    seniority: cv.seniority ?? "",
    skills: cv.skills ?? [],
    summary: cv.summary ?? "",
    text: cv.parsed_text ?? "",
  };

  const brief = typeof intent === "string" ? intent.trim() : "";

  let queries: string[];
  try {
    queries = await buildQueries(profile, brief);
  } catch (e: any) {
    return NextResponse.json({ error: `Query build failed: ${e?.message}` }, { status: 500 });
  }

  const { data: scan, error: insErr } = await supabase
    .from("scans")
    .insert({
      user_id: user.id,
      cv_id: cvId,
      status: "running",
      intent: brief || null,
      sources: chosen,
      queries,
      progress: 10,
      step: "Built search queries",
    })
    .select("*")
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ scan });
}
