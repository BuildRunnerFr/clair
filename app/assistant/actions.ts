"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/user";
import { AssistantRepository } from "@/lib/db/assistant-repository";

/** La conversation passe par /api/assistant, qui diffuse ; il ne reste ici que la suppression. */
export async function deleteConversation(conversationId: string): Promise<{ ok: boolean }> {
  if (!z.string().uuid().safeParse(conversationId).success) return { ok: false };
  const { user, supabase } = await requireUser();
  await new AssistantRepository(supabase).deleteConversation(user.id, conversationId);
  return { ok: true };
}
