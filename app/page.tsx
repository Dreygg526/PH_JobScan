import { redirect } from "next/navigation";

// Middleware sends signed-out users to /login; signed-in users continue here.
export default function Home() {
  redirect("/dashboard");
}
