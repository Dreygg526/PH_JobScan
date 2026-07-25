import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseCv } from "@/lib/claude";

export const runtime = "nodejs";
export const maxDuration = 120;

// Upload a CV: store the file in the private bucket, parse it with Claude,
// and create a `cvs` row scoped to the logged-in user (RLS enforces ownership).
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const label = (form.get("label") as string) || "";
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const name = file.name || "cv";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const isPdf = file.type === "application/pdf" || ext === "pdf";
  const isTxt = file.type.startsWith("text/") || ext === "txt" || ext === "md";
  if (!isPdf && !isTxt) {
    return NextResponse.json(
      { error: "Please upload a PDF or plain-text résumé (.pdf, .txt)." },
      { status: 400 },
    );
  }
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "File is larger than 8 MB." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const path = `${user.id}/${crypto.randomUUID()}.${ext || (isPdf ? "pdf" : "txt")}`;

  const { error: upErr } = await supabase.storage
    .from("cvs")
    .upload(path, bytes, { contentType: file.type || (isPdf ? "application/pdf" : "text/plain") });
  if (upErr) {
    return NextResponse.json({ error: `Storage: ${upErr.message}` }, { status: 500 });
  }

  // Parse with Claude. If parsing fails (e.g. missing key), keep the file but
  // record no profile — the UI will flag the CV as needing a re-parse.
  let parsed: Awaited<ReturnType<typeof parseCv>> | null = null;
  let parseError: string | null = null;
  try {
    parsed = isPdf
      ? await parseCv({ pdfBase64: bytes.toString("base64") })
      : await parseCv({ text: bytes.toString("utf8") });
  } catch (e: any) {
    parseError = e?.message ?? "Parse failed";
  }

  const { data: row, error: insErr } = await supabase
    .from("cvs")
    .insert({
      user_id: user.id,
      label: label || name.replace(/\.[^.]+$/, ""),
      storage_path: path,
      parsed_text: parsed?.text ?? (isTxt ? bytes.toString("utf8") : null),
      target_role: parsed?.target_role ?? null,
      seniority: parsed?.seniority ?? null,
      summary: parsed?.summary ?? null,
      skills: parsed?.skills ?? [],
      profile: parsed
        ? { target_role: parsed.target_role, seniority: parsed.seniority, skills: parsed.skills, summary: parsed.summary }
        : {},
    })
    .select("*")
    .single();

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  return NextResponse.json({ cv: row, parseError });
}
