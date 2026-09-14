import { describe, expect, it, vi, beforeEach } from "vitest";
const calls = vi.hoisted(() => ({ createClient: vi.fn(), owns: vi.fn(), quota: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: calls.createClient }));
vi.mock("@/lib/quota/consume", () => ({ consumeQuota: calls.quota }));
vi.mock("@/lib/db/assistant-repository", () => ({ AssistantRepository: class { ownsConversation = calls.owns; } }));
import { POST } from "@/app/api/assistant/route";
beforeEach(() => { vi.clearAllMocks(); calls.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }); });
describe("accès à une conversation", () => {
  it("rejette une origine externe avant de lire la session", async () => {
    const response = await POST(new Request("https://clairfinances.com/api/assistant", { method: "POST", headers: { origin: "https://evil.example" } }));
    expect(response.status).toBe(403); expect(calls.createClient).not.toHaveBeenCalled();
  });
  it("n’appelle ni quota ni modèle pour une conversation appartenant à un autre utilisateur", async () => {
    calls.owns.mockResolvedValue(false);
    const response = await POST(new Request("https://clairfinances.com/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: "Bonjour", conversationId: "00000000-0000-4000-8000-000000000001" }) }));
    expect(response.status).toBe(404); expect(calls.owns).toHaveBeenCalledWith("u1", "00000000-0000-4000-8000-000000000001"); expect(calls.quota).not.toHaveBeenCalled();
  });
});
