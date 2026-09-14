import { AppHeader } from "@/components/app-header";
import { Select } from "@/components/select";
import { AssistantChat } from "@/components/assistant-chat";
import { getTranslations } from "@/lib/i18n/server";
import type { AssistantMessage } from "@/lib/ai/assistant/assistant";
export async function AssistantWorkspace({ email, firstName, conversations, messages, requested, shown = null }: {
  email: string; firstName?: string | null; conversations: Array<{ id: string; title: string }>;
  messages: AssistantMessage[]; requested: string | null;
  /** Uniquement pour le banc d'essai : voir l'en-tête d'AssistantChat. */
  shown?: React.ComponentProps<typeof AssistantChat>["initialShown"];
}) {
  const t = await getTranslations();
  return <main className="shell">
    <AppHeader email={email} firstName={firstName} current="/assistant"/>
    <h1>{t("assistant.prompt")}</h1><p className="intro">{t("assistant.intro")}</p>
    <nav className="assistant-tools" aria-label={t("assistant.conversations")}>
      <a className="secondary-button" href="/assistant?nouveau=1">＋ {t("assistant.new")}</a>
      {conversations.length > 0 && <form method="get" action="/assistant"><Select name="c" label={t("assistant.conversations")} value={requested ?? conversations[0]?.id ?? ""} options={conversations.map((conversation) => ({ value: conversation.id, label: conversation.title }))} /><button className="small-button">{t("assistant.open")}</button></form>}
    </nav>
    <AssistantChat key={requested ?? "new"} initialMessages={messages} initialConversationId={requested} initialShown={shown}/>
  </main>;
}
