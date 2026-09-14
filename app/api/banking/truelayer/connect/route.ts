import { mutationOriginError } from "@/lib/security/requests";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BankSecretRepository } from "@/lib/db/bank-secret-repository";
import { getTrueLayerConfig } from "@/lib/banking/truelayer/config";
import { TrueLayerBankProvider } from "@/lib/banking/truelayer/truelayer-bank-provider";
import { ProfileRepository } from "@/lib/db/profile-repository";
import { providersForCountry } from "@/lib/profile/profile";

export async function POST(request: Request) {
  const originError = mutationOriginError(request);
  if (originError) return originError;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);
  try {
    const state = await new BankSecretRepository(createAdminClient()).createState(user.id);
    // Les banques proposées sont celles du pays de l'utilisateur. Lui présenter neuf banques
    // françaises alors qu'il vit à Lisbonne n'est pas un défaut cosmétique : c'est un écran où
    // il ne trouve pas sa banque et s'arrête là. Sans pays connu, la liste complète est servie —
    // trop large vaut mieux que vide.
    const profile = await new ProfileRepository(supabase).get(user.id).catch(() => null);
    const config = getTrueLayerConfig();
    const result = await new TrueLayerBankProvider({ ...config, providers: providersForCountry(config.providers, profile?.country ?? null) }).connect(state);
    if (!result.authorizationUrl) throw new Error("URL d’autorisation absente.");
    return NextResponse.redirect(result.authorizationUrl, 303);
  } catch {
    return NextResponse.redirect(new URL("/dashboard?bank_error=configuration", request.url), 303);
  }
}
