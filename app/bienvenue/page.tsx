import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/user";
import { isProfileComplete } from "@/lib/profile/profile";
import { redirect } from "next/navigation";
import { WelcomeWorkspace } from "@/components/welcome-workspace";
export const metadata: Metadata = { robots: { index: false, follow: false }, title: "Bienvenue" };
export default async function WelcomePage() {
  const { user, profile } = await requireUser({ allowIncompleteProfile: true });
  if (isProfileComplete(profile)) redirect("/compte");
  return <WelcomeWorkspace email={user.email ?? ""} profile={profile}/>;
}
