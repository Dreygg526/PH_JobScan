import { scoreBand, type Job } from "@/lib/types";
import { IconExt, IconPin, IconSave } from "@/components/icons";

const COLORS = ["#00c4cc", "#7c3aed", "#e8590c", "#0a66c2", "#059669", "#2563eb", "#db2777"];
function colorFor(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}
function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const BAND_LABEL = { strong: "Strong", good: "Good fit", weak: "Stretch" } as const;
const BAND_S = { strong: "s-strong", good: "s-good", weak: "s-weak" } as const;
const BAND_L = { strong: "lbl-strong", good: "lbl-good", weak: "lbl-weak" } as const;

export default function JobCard({
  job,
  onToggleSave,
}: {
  job: Job;
  onToggleSave?: (job: Job) => void;
}) {
  const band = scoreBand(job.score);
  const co = job.company ?? job.source;
  const clr = colorFor(co);
  const score = job.score ?? 0;
  const circ = 2 * Math.PI * 26;
  const off = circ * (1 - score / 100);

  return (
    <div className="job">
      <div className="co-logo" style={{ background: clr }}>{initials(co)}</div>
      <div className="job-body">
        <div className="job-title">
          {job.url ? (
            <a href={job.url} target="_blank" rel="noopener noreferrer">
              {job.title} <span className="ext"><IconExt /></span>
            </a>
          ) : (
            job.title
          )}
          {onToggleSave && (
            <button
              className={`save-btn${job.saved ? " on" : ""}`}
              title={job.saved ? "Remove from saved" : "Save job"}
              aria-label={job.saved ? "Remove from saved" : "Save job"}
              aria-pressed={job.saved}
              onClick={() => onToggleSave(job)}
            >
              <IconSave filled={job.saved} />
            </button>
          )}
        </div>
        {job.company && <div className="job-co">{job.company}</div>}
        <div className="job-tags">
          {job.location && <span className="chip"><IconPin />{job.location}</span>}
          <span className="chip src">{job.source}</span>
        </div>
        {job.reasoning && <div className="why">{job.reasoning}</div>}
      </div>
      <div className="score-col">
        {job.score == null ? (
          <>
            <div className="ring">
              <svg width="62" height="62">
                <circle cx="31" cy="31" r="26" fill="none" stroke="var(--line)" strokeWidth="6" />
              </svg>
              <div className="val" style={{ color: "var(--ink-3)", fontSize: 12 }}>…</div>
            </div>
            <span className="score-label" style={{ background: "var(--line-2)", color: "var(--ink-3)" }}>Scoring</span>
          </>
        ) : (
          <>
            <div className="ring">
              <svg width="62" height="62">
                <circle cx="31" cy="31" r="26" fill="none" stroke="var(--line)" strokeWidth="6" />
                <circle cx="31" cy="31" r="26" fill="none" className={BAND_S[band]} stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off} />
              </svg>
              <div className={`val ${BAND_S[band]}`}>{score}</div>
            </div>
            <span className={`score-label ${BAND_L[band]}`}>{BAND_LABEL[band]}</span>
          </>
        )}
      </div>
    </div>
  );
}
