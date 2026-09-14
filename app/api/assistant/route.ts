import { mutationOriginError, readSmallJson } from "@/lib/security/requests";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { FinanceAssistant } from "@/lib/ai/assistant/assistant";
import { FinanceTools } from "@/lib/ai/assistant/finance-tools";
import { AssistantRepository } from "@/lib/db/assistant-repository";
import { consumeQuota } from "@/lib/quota/consume";
import { quotaMessage } from "@/lib/quota/policy";

const schema = z.object({ question: z.string().trim().min(1).max(500), conversationId: z.string().uuid().nullable() });

/**
 * Route en flux plutôt que Server Action : une action ne peut rendre qu'un résultat final,
 * alors que l'intérêt est précisément d'envoyer quelque chose pendant le travail.
 *
 * Le format est du JSON par ligne — un objet complet suivi d'un saut de ligne. Plus simple
 * que le SSE à produire comme à lire, et suffisant pour un canal à sens unique.
 */
export async function POST(request: Request) {
  const originError = mutationOriginError(request);
  if (originError) return originError;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ type: "error", message: "Session expirée." }), { status: 401 });

  const parsed = schema.safeParse(await readSmallJson(request));
  if (!parsed.success) return new Response(JSON.stringify({ type: "error", message: "Question invalide." }), { status: 400 });

  const conversations = new AssistantRepository(supabase);
  if (parsed.data.conversationId && !(await conversations.ownsConversation(user.id, parsed.data.conversationId))) {
    return Response.json({ type: "error", message: "Conversation introuvable." }, { status: 404 });
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return new Response(JSON.stringify({ type: "error", message: "Assistant non configuré." }), { status: 503 });

  // Avant d'ouvrir le flux : une fois la réponse commencée, le client a déjà reçu un 200 et un
  // refus n'aurait plus de code d'état où se dire. C'est aussi le poste le plus cher — chaque
  // question déclenche plusieurs appels au modèle, un par outil sollicité.
  const quota = await consumeQuota(supabase, "assistant");
  if (!quota.allowed) return new Response(JSON.stringify({ type: "error", message: quotaMessage("assistant", quota) }), { status: 429 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        // L'identifiant est émis en premier : sans lui, un rechargement pendant la réponse
        // perdrait le fil qui vient d'être créé.
        const conversationId = parsed.data.conversationId ?? (await conversations.createConversation(user.id, parsed.data.question));
        send({ type: "conversation", conversationId });

        // L'historique est relu en base, jamais reçu du client.
        const history = parsed.data.conversationId ? await conversations.getContext(user.id, conversationId) : [];
        const assistant = new FinanceAssistant(apiKey, new FinanceTools(supabase, block => send(block)));

        let reply = "";
        for await (const event of assistant.stream(history, parsed.data.question)) {
          if (event.type === "done") reply = event.reply;
          send(event);
        }
        await conversations.appendMessages(user.id, conversationId, [
          { role: "user", content: parsed.data.question },
          { role: "assistant", content: reply }
        ]);
      } catch (error) {
        console.warn("[assistant] échec", { message: error instanceof Error ? error.message : "inconnu" });
        send({ type: "error", message: "L’assistant n’a pas pu répondre. Réessayez dans un instant." });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
