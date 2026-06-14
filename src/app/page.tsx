import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import LandingPage from "@/components/LandingPage";

export default async function Home() {
  const session = await getSession();

  // Logged-in users go straight to their workspace; everyone else sees the
  // marketing landing page (login / try buttons live there).
  if (session) {
    redirect("/dashboard");
  }

  return <LandingPage />;
}
