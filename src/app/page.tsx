import { redirect } from "next/navigation";
import Script from "next/script";
import { getSession } from "@/lib/auth";
import LandingPage from "@/components/LandingPage";

export default async function Home() {
  const session = await getSession();

  // Logged-in users go straight to their workspace; everyone else sees the
  // marketing landing page (login / try buttons live there).
  if (session) {
    redirect("/dashboard");
  }

  return (
    <>
      <Script async src="http://localhost:8081/p.js" data-id="PLS-C8BVRU88" />
      <LandingPage />
    </>
  );
}
