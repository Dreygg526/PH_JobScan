"use client";

import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SOURCES, MAX_AGE_DAYS, scoreBand, type Cv, type Job, type Scan, type SourceId, type ScanStats } from "@/lib/types";
import JobCard from "@/components/JobCard";
import {
  IconSearch, IconDoc, IconPlus, IconCheck, IconChart, IconBookmark,
  IconInfo, IconRefresh, IconSun, IconMoon, IconLogout, IconSave, IconClock,
} from "@/components/icons";

type View = "setup" | "running" | "results" | "history" | "saved";
type SrcState = { status: "wait" | "live" | "done"; found: number };

async function postJSON(url: string, body: unknown) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export default function DashboardApp({ initialCvs, email }: { initialCvs: Cv[]; email: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [cvs, setCvs] = useState<Cv[]>(initialCvs);
  const [selectedId, setSelectedId] = useState<string | null>(initialCvs[0]?.id ?? null);
  const [intent, setIntent] = useState("");
  const [enabled, setEnabled] = useState<Record<SourceId, boolean>>({
    indeed: true, jobsph: true, onlinejobsph: true,
  });

  const [view, setView] = useState<View>("setup");
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState("");
  const [srcState, setSrcState] = useState<Record<string, SrcState>>({});
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<ScanStats>({});
  const [filter, setFilter] = useState<string>("all");
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scans, setScans] = useState<Scan[]>([]);
  const [savedJobs, setSavedJobs] = useState<Job[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = cvs.find((c) => c.id === selectedId) ?? null;

  function toast(msg: string) {
    const id = Date.now();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }

  // ---------- CV library ----------
  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/cv/upload", { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Upload failed");
      setCvs((c) => [data.cv, ...c]);
      setSelectedId(data.cv.id);
      toast(data.parseError ? "Uploaded (parsing skipped — check your AI key)" : `Added ${data.cv.label}`);
    } catch (err: any) {
      toast(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function refetchJobs(scanId: string) {
    const { data } = await supabase
      .from("jobs")
      .select("*")
      .eq("scan_id", scanId)
      .order("score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: true });
    setJobs((data ?? []) as Job[]);
  }

  // ---------- history + saved views ----------
  async function openHistory() {
    setView("history");
    setLoadingList(true);
    const { data } = await supabase
      .from("scans")
      .select("*")
      .order("created_at", { ascending: false });
    setScans((data ?? []) as Scan[]);
    setLoadingList(false);
  }

  async function openSaved() {
    setView("saved");
    setLoadingList(true);
    const { data } = await supabase
      .from("jobs")
      .select("*")
      .eq("saved", true)
      .order("score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    setSavedJobs((data ?? []) as Job[]);
    setLoadingList(false);
  }

  // Open a past scan's results in the main results view.
  async function openScan(scan: Scan) {
    setLoadingList(true);
    const { data } = await supabase
      .from("jobs")
      .select("*")
      .eq("scan_id", scan.id)
      .order("score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: true });
    setJobs((data ?? []) as Job[]);
    setStats(scan.stats ?? {});
    setFilter("all");
    if (cvs.some((c) => c.id === scan.cv_id)) setSelectedId(scan.cv_id);
    setLoadingList(false);
    setView("results");
  }

  // Bookmark / un-bookmark a job; keeps both the results list and the
  // saved list in sync, and persists to Supabase (RLS scopes it to the user).
  async function toggleSave(job: Job) {
    const next = !job.saved;
    setJobs((js) => js.map((j) => (j.id === job.id ? { ...j, saved: next } : j)));
    setSavedJobs((js) =>
      next
        ? js.some((j) => j.id === job.id) ? js : [{ ...job, saved: true }, ...js]
        : js.filter((j) => j.id !== job.id),
    );
    const { error } = await supabase.from("jobs").update({ saved: next }).eq("id", job.id);
    if (error) {
      toast("Couldn't update saved jobs");
      // roll back
      setJobs((js) => js.map((j) => (j.id === job.id ? { ...j, saved: !next } : j)));
    } else {
      toast(next ? "Saved" : "Removed from saved");
    }
  }

  // ---------- the scan pipeline ----------
  async function runScan() {
    if (!selected || scanning) return;
    setScanning(true);
    setView("running");
    setJobs([]);
    setProgress(10);
    setStep("Building search queries");
    const sources = SOURCES.filter((s) => enabled[s.id]).map((s) => s.id);
    setSrcState(Object.fromEntries(sources.map((s) => [s, { status: "wait", found: 0 }])));

    try {
      const started = await postJSON("/api/scan/start", {
        cvId: selected.id, intent, sources,
      });
      if (started.error) throw new Error(started.error);
      const scanId: string = started.scan.id;

      for (let i = 0; i < sources.length; i++) {
        const s = sources[i];
        setSrcState((st) => ({ ...st, [s]: { ...st[s], status: "live" } }));
        setStep(`Reading listings from ${SOURCES.find((x) => x.id === s)!.name}`);
        const r = await postJSON("/api/scan/scrape", { scanId, source: s });
        setSrcState((st) => ({ ...st, [s]: { status: "done", found: r.count ?? 0 } }));
        setProgress(20 + Math.round(((i + 1) / sources.length) * 45));
        await refetchJobs(scanId);
      }

      setStep("Scoring matches against your CV");
      for (let guard = 0; guard < 80; guard++) {
        const r = await postJSON("/api/scan/score", { scanId });
        await refetchJobs(scanId);
        setProgress((p) => Math.min(95, p + 3));
        if (r.done || r.error) break;
      }

      const fin = await postJSON("/api/scan/finish", { scanId });
      setStats(fin.stats ?? {});
      setProgress(100);
      await refetchJobs(scanId);

      // reflect the fresh scan on the CV card
      setCvs((c) =>
        c.map((cv) =>
          cv.id === selected.id ? { ...cv } : cv,
        ),
      );
      setFilter("all");
      setView("results");
    } catch (err: any) {
      toast(err.message || "Scan failed");
      setView("setup");
    } finally {
      setScanning(false);
    }
  }

  // ---------- theme ----------
  function toggleTheme() {
    const root = document.documentElement;
    const cur =
      root.getAttribute("data-theme") ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch {}
  }

  const liveCount = jobs.length;
  const filtered = jobs.filter((j) => {
    if (filter === "all") return true;
    if (filter === "strong") return scoreBand(j.score) === "strong";
    if (filter === "good") return scoreBand(j.score) === "good";
    return j.source === filter;
  });

  return (
    <div className="shell">
      {/* ---------------- RAIL ---------------- */}
      <aside className="rail">
        <div className="rail-brand">
          <span className="logo"><IconSearch /></span>
          <span className="brand-name">Job<span>Scan</span></span>
        </div>
        {/* Wrapped so mobile can lay these out as a horizontal chip row instead
            of hiding everything past the first item. */}
        <nav className="rail-nav">
          <button
            className={`nav-item${["setup", "running", "results"].includes(view) ? " on" : ""}`}
            onClick={() => setView("setup")}
          ><IconSearch /> New scan</button>
          <button className={`nav-item${view === "history" ? " on" : ""}`} onClick={openHistory}><IconChart /> Scan history</button>
          <button className={`nav-item${view === "saved" ? " on" : ""}`} onClick={openSaved}><IconBookmark /> Saved jobs</button>
        </nav>

        <div className="rail-label">
          Your CVs <span style={{ fontFamily: "var(--mono)", color: "var(--ink-3)" }}>{cvs.length}</span>
        </div>
        <div className="cv-list">
          {cvs.map((cv) => (
            <button
              key={cv.id}
              className={`cv-card${cv.id === selectedId ? " sel" : ""}`}
              onClick={() => { setSelectedId(cv.id); toast(`Selected ${cv.label}`); }}
            >
              <span className="cv-check"><IconCheck /></span>
              <div className="cv-top">
                <span className="cv-ic"><IconDoc /></span>
                <div>
                  <div className="cv-name">{cv.label}</div>
                  <div className="cv-meta">{cv.target_role || "Not parsed yet"}</div>
                </div>
              </div>
              {cv.skills?.length ? (
                <div className="cv-stats"><span><b>{cv.skills.length}</b> skills</span></div>
              ) : null}
            </button>
          ))}
          {cvs.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--ink-3)", padding: "8px 6px" }}>
              No CVs yet — upload one to start.
            </div>
          )}
        </div>
        <button
          className="nav-item rail-upload"
          style={{ marginTop: 8, border: "1px dashed var(--line)", justifyContent: "center", color: "var(--blue)" }}
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <span className="spinner" style={{ borderTopColor: "var(--blue)", borderColor: "var(--line)" }} /> : <IconPlus />}
          {uploading ? "Uploading…" : "Upload CV"}
        </button>
        <input ref={fileRef} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" hidden onChange={onUpload} />

        <div className="rail-foot">
          <div className="user-chip">
            <div className="avatar">{email[0]?.toUpperCase()}</div>
            <div style={{ minWidth: 0 }}>
              <div className="nm">Signed in</div>
              <div className="em">{email}</div>
            </div>
            <form action="/auth/signout" method="post" style={{ marginLeft: "auto" }}>
              <button className="icon-btn" title="Sign out" type="submit"><IconLogout /></button>
            </form>
          </div>
        </div>
      </aside>

      {/* ---------------- MAIN ---------------- */}
      <div className="main">
        <div className="topbar">
          <h2>{
            view === "results" ? "Results"
            : view === "running" ? "Scanning…"
            : view === "history" ? "Scan history"
            : view === "saved" ? "Saved jobs"
            : "New scan"
          }</h2>
          {selected && !["history", "saved"].includes(view) && <span className="crumb">· using {selected.label}</span>}
          <div className="top-actions">
            <button className="icon-btn" title="Toggle theme" onClick={toggleTheme}>
              <IconSun />
            </button>
            {/* The rail footer (account + sign out) is collapsed on mobile, so the
                sign out lives here instead of being unreachable. */}
            <form action="/auth/signout" method="post" className="only-mobile">
              <button className="icon-btn" title={`Sign out — ${email}`} aria-label={`Sign out — ${email}`} type="submit">
                <IconLogout />
              </button>
            </form>
          </div>
        </div>

        <div className="panel-scroll">
          {view === "setup" && (
            <SetupPanel
              selected={selected}
              intent={intent}
              setIntent={setIntent}
              enabled={enabled}
              toggleSource={(id) => setEnabled((e) => ({ ...e, [id]: !e[id] }))}
              onScan={runScan}
              scanning={scanning}
              onUploadClick={() => fileRef.current?.click()}
            />
          )}

          {view === "running" && (
            <RunningPanel
              step={step}
              progress={progress}
              count={liveCount}
              sources={SOURCES.filter((s) => enabled[s.id])}
              srcState={srcState}
              jobs={jobs}
              role={selected?.target_role || "matching"}
            />
          )}

          {view === "results" && (
            <ResultsPanel
              jobs={filtered}
              total={jobs.length}
              stats={stats}
              filter={filter}
              setFilter={setFilter}
              cvLabel={selected?.label ?? ""}
              onKeep={() => setView("setup")}
              onRescan={runScan}
              onToggleSave={toggleSave}
            />
          )}

          {view === "history" && (
            <HistoryPanel
              scans={scans}
              cvs={cvs}
              loading={loadingList}
              onOpen={openScan}
              onNewScan={() => setView("setup")}
            />
          )}

          {view === "saved" && (
            <SavedPanel
              jobs={savedJobs}
              loading={loadingList}
              onToggleSave={toggleSave}
              onNewScan={() => setView("setup")}
            />
          )}
        </div>
      </div>

      <div className="toast-wrap">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            <IconCheck className="" /> {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= SETUP ================= */
function SetupPanel(props: {
  selected: Cv | null;
  intent: string;
  setIntent: (v: string) => void;
  enabled: Record<SourceId, boolean>;
  toggleSource: (id: SourceId) => void;
  onScan: () => void;
  scanning: boolean;
  onUploadClick: () => void;
}) {
  const { selected } = props;
  if (!selected) {
    return (
      <div className="empty">
        <IconDoc />
        <h3>Upload a CV to begin</h3>
        <p>Add a résumé to your library, then scan Philippine job boards for scored matches.</p>
        <button className="btn btn-cta" style={{ marginTop: 16 }} onClick={props.onUploadClick}>
          <IconPlus /> Upload CV
        </button>
      </div>
    );
  }
  return (
    <div className="grid2">
      <div className="card">
        <h3>Scan with this CV</h3>
        <p className="hint">JobScan reads the résumé, derives target roles and skills, then searches remote listings.</p>
        <div className="active-cv">
          <span className="big-ic"><IconDoc /></span>
          <div>
            <div className="nm">{selected.label}</div>
            <div className="mt">{selected.target_role || "Not parsed yet"}{selected.seniority ? ` · ${selected.seniority}` : ""}</div>
          </div>
        </div>

        <div className="tags-title">
          Tell JobScan what you want <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>— optional, plain English or Taglish</span>
        </div>
        <textarea
          className="intent-box"
          rows={4}
          placeholder="e.g. Gusto ko remote at night shift, open din ako sa VA or customer support work. Prefer startups, at least ₱40k."
          value={props.intent}
          onChange={(e) => props.setIntent(e.target.value)}
        />
        <div className="derived-note">
          <IconInfo />
          <span>
            JobScan reads this like a request — it understands your intent and folds it into both the search and the scoring.
            {selected.skills?.length ? (
              <> From your CV it&apos;ll also search: <span style={{ color: "var(--ink-2)" }}>{selected.skills.slice(0, 6).join(", ")}</span></>
            ) : null}
          </span>
        </div>
      </div>

      <div className="scan-side">
        <div className="card">
          <h3>Sources</h3>
          <p className="hint">Toggle where we look.</p>
          {SOURCES.map((s) => (
            <div className="src-item" key={s.id}>
              <span className="src-logo" style={{ background: s.color }}>{s.name[0]}</span>
              <div><div className="src-name">{s.name}</div><div className="src-desc">{s.desc}</div></div>
              <button
                className={`switch${props.enabled[s.id] ? "" : " off"}`}
                aria-label={`toggle ${s.name}`}
                onClick={() => props.toggleSource(s.id)}
              />
            </div>
          ))}
        </div>

        <div>
          <button className="btn btn-cta big-scan" onClick={props.onScan} disabled={props.scanning}>
            <IconSearch /> Scan the internet
          </button>
          <p className="scan-foot">Reads {SOURCES.filter((s) => props.enabled[s.id]).length} sources · last {MAX_AGE_DAYS} days only · scores every match against your CV</p>
        </div>
      </div>
    </div>
  );
}

/* ================= RUNNING ================= */
function RunningPanel(props: {
  step: string;
  progress: number;
  count: number;
  sources: { id: SourceId; name: string; color: string }[];
  srcState: Record<string, SrcState>;
  jobs: Job[];
  role: string;
}) {
  return (
    <>
      <div className="run-head">
        <div className="radar"><div className="ring" /><div className="sweep" /><div className="core" /></div>
        <div className="rt">
          <h3>Scanning for {props.role} roles…</h3>
          <p>{props.step}</p>
        </div>
        <div className="run-count"><div className="n">{props.count}</div><div className="l">jobs found</div></div>
      </div>
      <div className="progress"><div className="bar" style={{ width: `${props.progress}%` }} /></div>
      <div className="run-sources">
        {props.sources.map((s) => {
          const st = props.srcState[s.id] ?? { status: "wait", found: 0 };
          const label = st.status === "done" ? "Done" : st.status === "live" ? "Scraping" : "Queued";
          return (
            <div className="run-src" key={s.id}>
              <div className="run-src-top">
                <span className="src-logo" style={{ background: s.color, width: 26, height: 26, fontSize: 11 }}>{s.name[0]}</span>
                <span className="src-name">{s.name}</span>
                <span className={`st ${st.status}`}>{label}</span>
              </div>
              <div className="found">found <b>{st.found}</b></div>
            </div>
          );
        })}
      </div>
      <div className="stream-title"><span className="dot" /> Live results</div>
      <div className="jobs">
        {props.jobs.map((j) => <JobCard key={j.id} job={j} />)}
        {props.jobs.length === 0 && (
          <div style={{ color: "var(--ink-3)", fontSize: 13, padding: "10px 2px" }}>Searching…</div>
        )}
      </div>
    </>
  );
}

/* ================= RESULTS ================= */
function ResultsPanel(props: {
  jobs: Job[];
  total: number;
  stats: ScanStats;
  filter: string;
  setFilter: (f: string) => void;
  cvLabel: string;
  onKeep: () => void;
  onRescan: () => void;
  onToggleSave: (job: Job) => void;
}) {
  const { stats } = props;
  const bySource = stats.bySource ?? {};
  return (
    <>
      <div className="rescan-banner">
        <IconCheck className="lead" />
        <div className="txt">
          <b>Scan complete.</b> {stats.total ?? 0} matches · saved to <b>{props.cvLabel}</b>.
          Not scanning again? Your CV stays in the library, ready to reuse.
        </div>
        <div className="r-act">
          <button className="btn btn-ghost btn-sm" onClick={props.onKeep}>Keep &amp; close</button>
          <button className="btn btn-cta btn-sm" onClick={props.onRescan}><IconRefresh /> Rescan</button>
        </div>
      </div>

      <div className="res-head">
        <div className="stat-row">
          <div className="stat"><div className="n">{stats.total ?? 0}</div><div className="l">total matches</div></div>
          <div className="stat"><div className="n g">{stats.strong ?? 0}</div><div className="l">strong (80+)</div></div>
          <div className="stat"><div className="n b">{stats.good ?? 0}</div><div className="l">good fit</div></div>
          <div className="stat"><div className="n">{Object.keys(bySource).length}</div><div className="l">sources</div></div>
        </div>
      </div>

      <div className="filters">
        <button className={`fbtn${props.filter === "all" ? " on" : ""}`} onClick={() => props.setFilter("all")}>All <span className="c">{props.total}</span></button>
        <button className={`fbtn${props.filter === "strong" ? " on" : ""}`} onClick={() => props.setFilter("strong")}>Strong <span className="c">{stats.strong ?? 0}</span></button>
        <button className={`fbtn${props.filter === "good" ? " on" : ""}`} onClick={() => props.setFilter("good")}>Good <span className="c">{stats.good ?? 0}</span></button>
        {SOURCES.filter((s) => bySource[s.id]).map((s) => (
          <button key={s.id} className={`fbtn${props.filter === s.id ? " on" : ""}`} onClick={() => props.setFilter(s.id)}>
            {s.name} <span className="c">{bySource[s.id]}</span>
          </button>
        ))}
      </div>

      <div className="jobs">
        {props.jobs.map((j) => <JobCard key={j.id} job={j} onToggleSave={props.onToggleSave} />)}
        {props.jobs.length === 0 && (
          <div className="empty"><IconSearch /><h3>No matches here</h3><p>Try another filter, or rescan with different keywords.</p></div>
        )}
      </div>
    </>
  );
}

/* ================= SCAN HISTORY ================= */
function HistoryPanel(props: {
  scans: Scan[];
  cvs: Cv[];
  loading: boolean;
  onOpen: (scan: Scan) => void;
  onNewScan: () => void;
}) {
  if (props.loading) {
    return <div className="empty"><span className="spinner" /><p style={{ marginTop: 12 }}>Loading your scans…</p></div>;
  }
  if (props.scans.length === 0) {
    return (
      <div className="empty">
        <IconClock />
        <h3>No scans yet</h3>
        <p>Run a scan and it&apos;ll show up here — reopen any past run to revisit its matches.</p>
        <button className="btn btn-cta" style={{ marginTop: 16 }} onClick={props.onNewScan}>
          <IconSearch /> New scan
        </button>
      </div>
    );
  }
  return (
    <div className="hist-list">
      {props.scans.map((s) => {
        const cv = props.cvs.find((c) => c.id === s.cv_id);
        const st = s.stats ?? {};
        const when = new Date(s.created_at).toLocaleString(undefined, {
          month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
        });
        const statusCls = s.status === "done" ? "ok" : s.status === "failed" ? "bad" : "live";
        return (
          <button key={s.id} className="hist-row" onClick={() => props.onOpen(s)}>
            <span className="hist-ic"><IconChart /></span>
            <div className="hist-main">
              <div className="hist-top">
                <span className="hist-cv">{cv?.label ?? "CV"}</span>
                <span className={`hist-status ${statusCls}`}>{s.status}</span>
              </div>
              <div className="hist-meta">
                <span><IconClock /> {when}</span>
                {s.sources?.length ? <span>{s.sources.length} sources</span> : null}
                {s.intent ? <span className="hist-brief">“{s.intent.length > 60 ? s.intent.slice(0, 60) + "…" : s.intent}”</span> : null}
              </div>
            </div>
            <div className="hist-stats">
              <div className="hs"><b>{st.total ?? 0}</b><span>matches</span></div>
              <div className="hs"><b className="g">{st.strong ?? 0}</b><span>strong</span></div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ================= SAVED JOBS ================= */
function SavedPanel(props: {
  jobs: Job[];
  loading: boolean;
  onToggleSave: (job: Job) => void;
  onNewScan: () => void;
}) {
  if (props.loading) {
    return <div className="empty"><span className="spinner" /><p style={{ marginTop: 12 }}>Loading saved jobs…</p></div>;
  }
  if (props.jobs.length === 0) {
    return (
      <div className="empty">
        <IconSave />
        <h3>No saved jobs yet</h3>
        <p>Tap the bookmark on any match to keep it here — it stays across scans.</p>
        <button className="btn btn-cta" style={{ marginTop: 16 }} onClick={props.onNewScan}>
          <IconSearch /> New scan
        </button>
      </div>
    );
  }
  return (
    <>
      <div className="res-head">
        <div className="stat-row">
          <div className="stat"><div className="n">{props.jobs.length}</div><div className="l">saved jobs</div></div>
        </div>
      </div>
      <div className="jobs">
        {props.jobs.map((j) => <JobCard key={j.id} job={j} onToggleSave={props.onToggleSave} />)}
      </div>
    </>
  );
}
