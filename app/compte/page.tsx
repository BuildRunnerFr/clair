import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/user";
import { BankConnectionRepository } from "@/lib/db/bank-connection-repository";
import { currentTrueLayerEnvironment } from "@/lib/banking/truelayer/config";
import { AccountWorkspace } from "@/components/account-workspace";
export const metadata: Metadata = { robots: { index: false, follow: false }, title: "Mon compte" };
export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, supabase, profile } = await requireUser({ allowIncompleteProfile: true });
  const params = await searchParams;
  const connections = (await new BankConnectionRepository(supabase).list(user.id)).filter(connection => connection.environment === currentTrueLayerEnvironment());
  const methods = [...new Set((user.identities ?? []).map(identity => identity.provider))];
  return <AccountWorkspace email={user.email ?? ""} profile={profile} methods={methods} connections={connections} passwordSaved={params.password === "1"} profileSaved={params.profile === "1"}/>;
}
