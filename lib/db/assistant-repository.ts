import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { AssistantMessage } from "@/lib/ai/assistant/assistant";

/** Nombre de messages relus pour reconstituer le contexte d'un tour. Au-delà, la requête au
 *  modèle grossit sans gagner en pertinence, et coûte plus cher à chaque question. */
const CONTEXT_WINDOW = 10;

export class AssistantRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async ownsConversation(userId: string, conversationId: string): Promise<boolean> {
    const { data, error } = await this.client.from("assistant_conversations").select("id")
      .eq("id", conversationId).eq("user_id", userId).maybeSingle();
    if (error) throw new Error("Échec de vérification de la conversation.");
    return Boolean(data);
  }

  async listConversations(userId: string) {
    const { data, error } = await this.client.from("assistant_conversations").select("id,title,updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(30);
    if (error) throw new Error(`Échec de lecture des conversations: ${error.message}`);
    return data.map((row) => ({ id: row.id, title: row.title, updatedAt: row.updated_at }));
  }

  async getMessages(userId: string, conversationId: string): Promise<AssistantMessage[]> {
    const { data, error } = await this.client.from("assistant_messages").select("role,content").eq("user_id", userId).eq("conversation_id", conversationId).order("created_at").limit(200);
    if (error) throw new Error(`Échec de lecture des messages: ${error.message}`);
    return data.map((row) => ({ role: row.role as AssistantMessage["role"], content: row.content }));
  }

  /** Les derniers échanges, dans l'ordre chronologique, pour donner du contexte au modèle. */
  async getContext(userId: string, conversationId: string): Promise<AssistantMessage[]> {
    const { data, error } = await this.client.from("assistant_messages").select("role,content").eq("user_id", userId).eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(CONTEXT_WINDOW);
    if (error) throw new Error(`Échec de lecture du contexte: ${error.message}`);
    return data.reverse().map((row) => ({ role: row.role as AssistantMessage["role"], content: row.content }));
  }

  async createConversation(userId: string, firstQuestion: string) {
    // Le titre est la question initiale tronquée : suffisant pour se repérer dans une liste,
    // et cela évite un appel au modèle uniquement pour nommer un fil.
    const title = firstQuestion.trim().slice(0, 60) || "Nouvelle conversation";
    const { data, error } = await this.client.from("assistant_conversations").insert({ user_id: userId, title }).select("id").single();
    if (error) throw new Error(`Échec de création de la conversation: ${error.message}`);
    return data.id;
  }

  async appendMessages(userId: string, conversationId: string, messages: AssistantMessage[]) {
    if (!messages.length) return;
    const { error } = await this.client.from("assistant_messages").insert(messages.map((message) => ({ conversation_id: conversationId, user_id: userId, role: message.role, content: message.content.slice(0, 8000) })));
    if (error) throw new Error(`Échec d’enregistrement des messages: ${error.message}`);
    await this.client.from("assistant_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId).eq("user_id", userId);
  }

  async deleteConversation(userId: string, conversationId: string) {
    const { error } = await this.client.from("assistant_conversations").delete().eq("id", conversationId).eq("user_id", userId);
    if (error) throw new Error(`Échec de suppression: ${error.message}`);
  }
}
