"use client";

import { categoryLabel } from "@/lib/categories/labels";
import { formatMoney } from "@/lib/currency";
import { useIntlLocale, useTranslate } from "@/components/i18n-provider";

import { useRef, useState } from "react";
import type { AssistantMessage } from "@/lib/ai/assistant/assistant";

interface ShownTransactions {
  /** Nul quand la liste couvre tout l’historique. */
  month: string | null;
  category: string | null;
  transactions: Array<{ id: string; date: string; merchant: string; amount: number; currency: string; count: number; category: string }>;
}

/**
 * Les paramètres d'un lien, les vides écartés.
 *
 * Une liste peut couvrir tout l'historique, auquel cas il n'y a pas de mois — et « month=null »
 * dans l'adresse ferait filtrer la page des transactions sur un mois qui n'existe pas.
 */
function lien(params: Record<string, string | null>): string {
  return new URLSearchParams(Object.entries(params).filter(([, value]) => value) as [string, string][]).toString();
}

/** Les exemples sont traduits : ce sont des questions qu'on pose, pas des étiquettes. */
const SUGGESTION_KEYS = ["assistant.example1", "assistant.example2", "assistant.example3", "assistant.example4"];

/**
 * `initialShown` n'existe que pour le banc d'essai : il donne un état de départ au bloc
 * d'opérations, qui autrement ne se peuple qu'au fil d'une vraie réponse du modèle. Sans lui,
 * cet affichage ne se regarderait qu'en payant un appel, ce qui revient à ne pas le regarder.
 */
export function AssistantChat({ initialMessages = [], initialConversationId = null, initialShown = null }: { initialMessages?: AssistantMessage[]; initialConversationId?: string | null; initialShown?: ShownTransactions | null }) {
  const t = useTranslate();
  const locale = useIntlLocale();
  const [proposals, setProposals] = useState<Array<{ category: string; monthlyLimit: number; currency: string }>>([]);
  /**
   * Les opérations que l'assistant vient de montrer.
   *
   * Remplacées à chaque question et non accumulées : elles illustrent la dernière réponse, et
   * une liste qui survivrait à la question suivante prétendrait illustrer autre chose.
   */
  const [shown, setShown] = useState<ShownTransactions | null>(initialShown);
  const [messages, setMessages] = useState<AssistantMessage[]>(initialMessages);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [pending, setPending] = useState(false);
  // Ce que l'assistant est en train de faire, remplacé à chaque outil.
  const [activity, setActivity] = useState<string | null>(null);
  // La réponse en cours d'écriture, distincte des messages déjà achevés.
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    if (!question.trim() || pending) return;
    setError(null);
    setShown(null);
    setPending(true);
    // La question est affichée immédiatement : l'attente est déjà longue, la voir partir
    // évite de croire que le clic n'a rien fait.
    const asked: AssistantMessage[] = [...messages, { role: "user", content: question }];
    setMessages(asked);
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));

    // L'historique n'est plus transmis : le serveur le relit en base, ce qui empêche un
    // client de fabriquer un faux échange pour orienter le modèle.
    setActivity(t("assistant.thinking"));
    setDraft("");
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, conversationId })
      });
      if (!response.ok) {
        // Le serveur explique pourquoi il refuse — quota atteint, session expirée. Traiter tout
        // échec comme une panne générique jetait ce message et laissait l'utilisateur relancer
        // en boucle sans jamais comprendre.
        const body = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message ?? "indisponible");
      }
      if (!response.body) throw new Error("indisponible");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let reply = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Un objet par ligne ; la dernière peut être incomplète et attend la lecture suivante.
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as { type: string; text?: string; label?: string; reply?: string; conversationId?: string; message?: string; proposal?: { category: string; monthlyLimit: number; currency: string } } & Partial<ShownTransactions>;
          if (event.type === "budget_proposal" && event.proposal) { const proposal = event.proposal; setProposals(current => [...current.filter(item => item.category !== proposal.category), proposal]); }
          else if (event.type === "transactions" && event.transactions) setShown({ month: event.month ?? null, category: event.category ?? null, transactions: event.transactions });
          else if (event.type === "conversation") setConversationId(event.conversationId ?? null);
          else if (event.type === "tool") { setActivity(event.label ?? null); }
          else if (event.type === "delta") { setActivity(null); reply += event.text ?? ""; setDraft(reply); }
          else if (event.type === "done") reply = event.reply ?? reply;
          else if (event.type === "error") setError(event.message ?? t("assistant.failed"));
          endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        }
      }
      if (reply) setMessages([...asked, { role: "assistant", content: reply }]);
    } catch (failure) {
      // « indisponible » est le repli quand le serveur n'a rien expliqué ; tout autre message
      // vient de lui et vaut mieux que le nôtre — il dit pourquoi, et souvent quoi faire.
      const explained = failure instanceof Error && failure.message !== "indisponible" ? failure.message : null;
      setError(explained ?? t("assistant.unavailable"));
    } finally {
      setPending(false);
      setActivity(null);
      setDraft("");
    }
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
  }

  return <section className="chat">
    <div className="chat-thread">
      {!messages.length && <div className="chat-empty">
        <p>{t("assistant.examplesLead")}</p>
        <div className="chat-suggestions">
          {SUGGESTION_KEYS.map((key) => t(key)).map((suggestion) => <button key={suggestion} type="button" className="chat-suggestion" onClick={() => ask(suggestion)} disabled={pending}>{suggestion}</button>)}
        </div>
      </div>}
      {messages.map((message, index) => <div key={index} className={`chat-message chat-${message.role}`}>{message.content}</div>)}
      {draft && <div className="chat-message chat-assistant">{draft}<span className="chat-caret" /></div>}
      {pending && !draft && <div className="chat-message chat-assistant chat-pending" role="status">{activity ?? t("assistant.thinking")}</div>}
      {/* Sous la réponse, et non à côté : ces lignes en font partie. Chacune mène à la page des
          transactions filtrée sur le commerçant, où l'opération se reclasse — l'assistant montre,
          l'utilisateur décide. */}
      {shown && shown.transactions.length > 0 && <div className="chat-shown">
        <span className="chat-shown-title">{t("assistant.shownTitle")}</span>
        <ul>
          {shown.transactions.map((line) => <li key={line.id}>
            <a href={`/transactions?${lien({ month: shown.month, q: line.merchant })}`}>
              <span className="chat-shown-date">{new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(line.date))}</span>
              <span className="chat-shown-merchant">{line.merchant}{line.count > 1 && <em> ×{line.count}</em>}</span>
              <span className="chat-shown-amount">{formatMoney(-line.amount, line.currency, locale)}</span>
            </a>
          </li>)}
        </ul>
        <p className="chat-shown-hint">{t("assistant.shownHint")}</p>
        <a className="small-button" href={`/transactions?${lien({ month: shown.month, category: shown.category })}`}>{t(shown.category ? "assistant.shownAll" : "assistant.shownAllTransactions")}</a>
      </div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div ref={endRef} />
    </div>

    <form className="chat-form" onSubmit={(event) => {
      event.preventDefault();
      const field = event.currentTarget.elements.namedItem("question") as HTMLInputElement;
      const value = field.value;
      field.value = "";
      void ask(value);
    }}>
      <input name="question" maxLength={500} required aria-label={t("assistant.yourQuestion")} placeholder={t("assistant.inputPlaceholder")} autoComplete="off" disabled={pending} />
      <button className="primary" disabled={pending}>{pending ? "…" : t("assistant.ask")}</button>
    </form>
    {proposals.map(proposal => <aside className="assistant-proposal" key={proposal.category}><strong>{categoryLabel(proposal.category, locale)} · {formatMoney(proposal.monthlyLimit, proposal.currency, locale)}</strong><p>{t("assistant.proposalHint")}</p><a className="small-button" href={`/budgets?${new URLSearchParams({ proposalCategory: proposal.category, proposalLimit: String(proposal.monthlyLimit) })}`}>{t("assistant.reviewProposal")}</a></aside>)}
    <p className="chat-note">{t("assistant.privacyNote")}</p>
  </section>;
}
