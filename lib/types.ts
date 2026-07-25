// Shared types mirroring the Supabase schema.

export type ScanStatus = "running" | "done" | "failed";

export type SourceId = "indeed" | "jobsph" | "onlinejobsph";

// Only listings this fresh (in days) are kept; older ones are dropped at scrape.
export const MAX_AGE_DAYS = 5;

export const SOURCES: { id: SourceId; name: string; desc: string; color: string }[] = [
  { id: "indeed", name: "Indeed", desc: "PH remote listings", color: "#2557a7" },
  { id: "jobsph", name: "Jobs.ph", desc: "Local job board", color: "#0a66c2" },
  { id: "onlinejobsph", name: "OnlineJobs.ph", desc: "Remote-first roles", color: "#e8590c" },
];

export interface Cv {
  id: string;
  user_id: string;
  label: string;
  storage_path: string;
  parsed_text: string | null;
  target_role: string | null;
  seniority: string | null;
  summary: string | null;
  skills: string[];
  profile: Record<string, unknown>;
  created_at: string;
}

export interface ScanStats {
  total?: number;
  strong?: number;
  good?: number;
  bySource?: Record<string, number>;
}

export interface Scan {
  id: string;
  user_id: string;
  cv_id: string;
  status: ScanStatus;
  keywords: string[];
  intent: string | null;
  sources: string[];
  queries: string[];
  progress: number;
  step: string | null;
  stats: ScanStats;
  created_at: string;
  finished_at: string | null;
}

export interface Job {
  id: string;
  scan_id: string;
  user_id: string;
  source: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string | null;
  description: string | null;
  score: number | null;
  reasoning: string | null;
  cover_letter: string | null;
  saved: boolean;
  created_at: string;
}

// Score bands drive the semantic colours in the UI.
export function scoreBand(score: number | null): "strong" | "good" | "weak" {
  if (score == null) return "weak";
  if (score >= 80) return "strong";
  if (score >= 70) return "good";
  return "weak";
}
