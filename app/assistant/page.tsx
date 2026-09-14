import type { Metadata } from "next";
import { z } from "zod";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/user";
import { AssistantRepository } from "@/lib/db/assistant-repository";
import { AssistantWorkspace } from "@/components/assistant-workspace";
export const metadata: Metadata = { robots: { index: false, follow: false }, title: "Assistant" };
export const dynamic = "force-dynamic";
export default async function AssistantPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, supabase, profile } = await requireUser();
  const params = await searchParams;
  const parsed = z.string().uuid().safeParse(params.c);
  const requested = parsed.success ? parsed.data : null;
  const repository = new AssistantRepository(supabase);
  if (requested && !(await repository.ownsConversation(user.id, requested))) notFound();
  const conversations = await repository.listConversations(user.id);
  /**
   * Sans conversation demandée, on rouvre la dernière.
   *
   * L'écran s'ouvrait vide, et le fil précédent n'était accessible qu'en remarquant une liste
   * déroulante puis en cliquant « Ouvrir ». L'historique existait donc — trente conversations,
   * deux cents messages, isolés par utilisateur — sans que rien ne le laisse voir : revenir sur
   * l'assistant donnait l'impression d'avoir tout perdu.
   *
   * Reprendre le dernier fil est ce que fait n'importe quelle messagerie, et « Nouvelle » reste
   * là pour repartir de zéro — l'action explicite est celle qui efface le contexte, pas celle
   * qui le garde.
   */
  // « Nouvelle » porte désormais son propre paramètre : sans lui, revenir sur /assistant
  // rouvrirait le dernier fil, et le bouton n'ouvrirait plus jamais rien de neuf.
  const ouverte = requested ?? (params.nouveau ? null : conversations[0]?.id ?? null);
  const messages = ouverte ? await repository.getMessages(user.id, ouverte) : [];
  return <AssistantWorkspace email={user.email ?? ""} firstName={profile?.firstName} conversations={conversations} messages={messages} requested={ouverte}/>;
}
