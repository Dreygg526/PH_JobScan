import Anthropic from "@anthropic-ai/sdk";

// One Claude client per server process. Default to the latest capable model.
const MODEL = "claude-opus-4-8";

function client() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
}

function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

// Models occasionally wrap JSON in prose or fences despite instructions.
export function extractJson<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.search(/[[{]/);
  if (start === -1) throw new Error("No JSON found in model output");
  // Walk to the matching closing bracket.
  const open = body[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  for (let i = start; i < body.length; i++) {
    if (body[i] === open) depth++;
    else if (body[i] === close) {
      depth--;
      if (depth === 0) return JSON.parse(body.slice(start, i + 1)) as T;
    }
  }
  throw new Error("Unterminated JSON in model output");
}

async function ask(system: string, content: Anthropic.MessageParam["content"], maxTokens = 4000) {
  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content }],
  });
  return textOf(msg);
}

export interface ParsedCv {
  target_role: string;
  seniority: string;
  skills: string[];
  summary: string;
  text: string;
}

// Parse a résumé (PDF bytes or plain text) into a structured profile.
export async function parseCv(input: { pdfBase64?: string; text?: string }): Promise<ParsedCv> {
  const system =
    "You read a résumé and return ONLY raw JSON (no prose, no fences) with keys: " +
    "target_role (string headline of the best-fit job title), seniority (junior|mid|senior|lead), " +
    "skills (string[] of the candidate's strongest, searchable skills, max 12), " +
    "summary (2-sentence profile), text (the full plaintext of the résumé). " +
    "Judge only what the résumé supports; never invent experience.";

  const content: Anthropic.MessageParam["content"] = input.pdfBase64
    ? [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: input.pdfBase64 },
        } as unknown as Anthropic.ContentBlockParam,
        { type: "text", text: "Parse this résumé into the JSON described." },
      ]
    : `Résumé text follows. Parse it into the JSON described.\n\n${input.text ?? ""}`;

  const raw = await ask(system, content, 4000);
  return extractJson<ParsedCv>(raw);
}

// Build search queries from the CV profile + the user's free-text brief.
// `intent` is plain language (English or Taglish) describing what they want —
// e.g. "gusto ko remote night shift, open din ako sa VA work". Read it for
// intent (roles, work type, location, schedule, industries) and fold it in.
export async function buildQueries(cv: ParsedCv, intent: string): Promise<string[]> {
  const system =
    "You generate remote-job search queries for THIS candidate. Return ONLY a JSON array of " +
    "6-10 short query strings. Base them on the résumé's roles and skills, and ALSO honor the " +
    "user's brief — it may be in English or Taglish (Filipino), and may ask for work outside the " +
    "résumé (e.g. VA work, night shift, a specific city or industry). Understand its intent and " +
    "reflect it in the queries. Keep queries board-friendly.";
  const raw = await ask(
    system,
    JSON.stringify({
      target_role: cv.target_role,
      skills: cv.skills,
      user_brief: intent || "(none — use the résumé)",
    }),
    1000,
  );
  return extractJson<string[]>(raw);
}

export interface ScoreInput {
  id: string;
  title: string;
  company?: string | null;
  location?: string | null;
  description?: string | null;
}
export interface ScoreResult {
  id: string;
  score: number;
  reasoning: string;
}

// Score a batch of jobs against the CV. Returns one result per input id.
// `intent` is the user's free-text brief (English/Taglish); weigh it alongside
// the résumé so jobs matching what they actually asked for rank higher.
export async function scoreJobs(
  cv: ParsedCv,
  intent: string,
  jobs: ScoreInput[],
): Promise<ScoreResult[]> {
  const system =
    "You score how well each job fits THIS candidate, 0-100. Consider the résumé's role, seniority, " +
    "and skills, AND the user's brief (may be English or Taglish) describing what they want — a job " +
    "that matches their stated preferences should score higher, one that ignores them lower. " +
    "80+ = strong, 70-79 = good fit, below = a stretch. Return ONLY a JSON array of objects: " +
    "{id, score (int), reasoning (one sentence, name the key matching or missing skills)}. " +
    "One object per input id.";
  const payload = {
    candidate: { target_role: cv.target_role, seniority: cv.seniority, skills: cv.skills },
    user_brief: intent || "(none)",
    jobs,
  };
  const raw = await ask(system, JSON.stringify(payload), 4000);
  return extractJson<ScoreResult[]>(raw);
}

// Write a short, tailored cover letter for one strong match.
export async function coverLetter(
  cv: ParsedCv,
  job: { title: string; company?: string | null; description?: string | null },
): Promise<string> {
  const system =
    "Write a concise, specific cover letter (max 180 words) for this candidate and role. " +
    "Ground every claim in the résumé; no clichés, no invented experience. Return plain text only.";
  return ask(
    system,
    JSON.stringify({ candidate: { summary: cv.summary, skills: cv.skills }, job }),
    800,
  );
}
