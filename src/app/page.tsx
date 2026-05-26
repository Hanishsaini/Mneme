import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LandingPage } from "@/features/marketing/components/landing-page";

/**
 * Public landing. Authenticated users skip straight into the app; everyone
 * else gets the marketing surface so recruiters/founders/GitHub visitors
 * see a real product, not a bare login form.
 */
export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  return <LandingPage />;
}
