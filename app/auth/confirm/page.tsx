import { getTranslations } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { confirmMagicLink } from "./actions";
import { parseConfirmationInput } from "@/lib/auth/confirm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : null;
  const type = typeof params.type === "string" ? params.type : null;
  const parsed = parseConfirmationInput({ tokenHash, type });
  const t = await getTranslations();

  return <main className="auth-shell"><div className="auth-card"><div className="brand">clair.</div><h1>{t("confirm.title")}</h1>{parsed.ok ? <><p>{t("confirm.body")}</p><form action={confirmMagicLink} className="auth-form"><input type="hidden" name="token_hash" value={parsed.tokenHash} /><input type="hidden" name="type" value={parsed.type} /><button className="primary">{t("confirm.action")}</button></form></> : <><p>{t("confirm.invalid")}</p><a className="primary-link" href="/login">{t("confirm.requestNew")}</a></>}</div></main>;
}
