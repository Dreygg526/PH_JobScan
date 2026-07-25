import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// OAuth (Google) redirect lands here with a code to exchange for a session.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Behind Vercel's proxy `request.url` carries the internal host, so redirecting
  // to `origin` can land on a different host than the one the session cookie was
  // set for — which reads as "signed in, then bounced back to /login".
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const base = forwardedHost ? `${forwardedProto}://${forwardedHost}` : origin;

  // Supabase reports a rejected/mis-configured redirect here rather than by
  // sending a code.
  const oauthError = searchParams.get("error_description") ?? searchParams.get("error");
  if (oauthError) {
    return NextResponse.redirect(`${base}/login?error=${encodeURIComponent(oauthError)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${base}/login?error=${encodeURIComponent("No auth code returned.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // Swallowing this is what made the failure look like a silent bounce.
    return NextResponse.redirect(`${base}/login?error=${encodeURIComponent(error.message)}`);
  }

  return NextResponse.redirect(`${base}/dashboard`);
}
