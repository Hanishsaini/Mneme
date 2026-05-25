import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { RegistrationForm } from "@/features/auth/components/registration-form";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  const { callbackUrl } = await searchParams;
  return <RegistrationForm callbackUrl={callbackUrl} />;
}
