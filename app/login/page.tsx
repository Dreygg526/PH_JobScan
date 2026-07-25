"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { IconSearch, IconLayers, IconLock, IconActivity } from "@/components/icons";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      }
      router.push("/dashboard");
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setErr(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setErr(error.message);
  }

  return (
    <div className="auth-wrap">
      <div className="auth-pitch">
        <div className="brandmark">
          <span className="logo"><IconSearch /></span>
          <span className="brand-name">Job<span>Scan</span></span>
        </div>
        <span className="pill">Your data stays yours</span>
        <h1>Point your CV at the internet. Get scored matches back.</h1>
        <p>
          Upload a résumé, add any wild-card keywords, hit scan. JobScan reads the listings so you
          don&apos;t have to — and ranks every one against your actual experience.
        </p>
        <div className="sources-row">
          <span className="src-chip">Indeed</span>
          <span className="src-chip">Jobs.ph</span>
          <span className="src-chip">OnlineJobs.ph</span>
        </div>
        <ul className="pitch-list">
          <li><span className="tick"><IconLayers /></span> Keep a library of CVs — scan with whichever one fits the role.</li>
          <li><span className="tick"><IconLock /></span> Every account is isolated — nobody sees your résumés but you.</li>
          <li><span className="tick"><IconActivity /></span> Results stream in live as each source is scraped.</li>
        </ul>
      </div>

      <div className="auth-form">
        <h2>{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
        <p className="sub">
          {mode === "signin" ? "Sign in to your JobScan workspace." : "Start scanning in under a minute."}
        </p>

        {err && <div className="form-err">{err}</div>}

        <button className="btn btn-ghost btn-block" style={{ marginBottom: 18 }} onClick={google} type="button">
          <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden><path fill="#4285F4" d="M22.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h6c-.3 1.4-1.1 2.6-2.3 3.4v2.8h3.7c2.2-2 3.4-5 3.4-8.1z" /><path fill="#34A853" d="M12 23c3.1 0 5.7-1 7.6-2.8l-3.7-2.8c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v2.9C3.7 20.6 7.5 23 12 23z" /><path fill="#FBBC05" d="M5.6 13.8c-.2-.7-.4-1.4-.4-2.3s.1-1.6.4-2.3V6.3H1.8C1 7.9.6 9.7.6 11.5s.4 3.6 1.2 5.2l3.8-2.9z" /><path fill="#EA4335" d="M12 4.9c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 1.4 15.1.5 12 .5 7.5.5 3.7 2.9 1.8 6.3l3.8 2.9C6.5 6.5 9 4.9 12 4.9z" /></svg>
          Continue with Google
        </button>
        <div className="divider">or</div>

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="em">Email</label>
            <input id="em" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="pw">Password</label>
            <input id="pw" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-block" disabled={busy} type="submit">
            {busy ? <span className="spinner" /> : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="auth-foot">
          {mode === "signin" ? (
            <>New here?{" "}<a href="#" onClick={(e) => { e.preventDefault(); setMode("signup"); setErr(null); }}>Create an account</a></>
          ) : (
            <>Already have an account?{" "}<a href="#" onClick={(e) => { e.preventDefault(); setMode("signin"); setErr(null); }}>Sign in</a></>
          )}
        </p>
      </div>
    </div>
  );
}
