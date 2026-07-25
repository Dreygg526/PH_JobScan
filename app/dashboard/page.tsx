import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardApp from "@/components/DashboardApp";
import type { Cv } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: cvs } = await supabase
    .from("cvs")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <DashboardApp
      initialCvs={(cvs ?? []) as Cv[]}
      email={user.email ?? "you@jobscan"}
    />
  );
}
