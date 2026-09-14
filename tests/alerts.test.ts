import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { sendAlert } from "@/lib/alerts/notify";

/**
 * Une alerte est le dernier endroit où l'on peut se permettre de faire tomber ce qu'on
 * surveille : une clé absente, un refus du fournisseur ou une coupure réseau doivent laisser la
 * synchronisation se terminer normalement.
 */
const alerte = { subject: "Clair — essai", body: "corps" };
const original = { ...process.env };
afterEach(() => { process.env = { ...original }; vi.restoreAllMocks(); });

describe("l’alerte d’exploitation", () => {
  it("n’envoie rien et ne lève pas quand elle n’est pas configurée", async () => {
    delete process.env.RESEND_API_KEY;
    process.env.ALERT_EMAIL_TO = "exploitant@example.test";
    const http = vi.fn();
    expect(await sendAlert(alerte, http as unknown as typeof fetch)).toBe(false);
    expect(http).not.toHaveBeenCalled();
  });

  it("n’envoie rien sans destinataire, même avec une clé", async () => {
    process.env.RESEND_API_KEY = "cle";
    delete process.env.ALERT_EMAIL_TO;
    const http = vi.fn();
    expect(await sendAlert(alerte, http as unknown as typeof fetch)).toBe(false);
    expect(http).not.toHaveBeenCalled();
  });

  it("poste le message au fournisseur, en texte", async () => {
    process.env.RESEND_API_KEY = "cle";
    process.env.ALERT_EMAIL_TO = "exploitant@example.test";
    const http = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await sendAlert(alerte, http as unknown as typeof fetch)).toBe(true);
    const [url, options] = http.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((options.headers as Record<string, string>).authorization).toBe("Bearer cle");
    const corps = JSON.parse(String(options.body));
    expect(corps).toMatchObject({ to: ["exploitant@example.test"], subject: "Clair — essai", text: "corps" });
    // Sans domaine vérifié, seule cette adresse d'expédition est acceptée.
    expect(corps.from).toContain("@");
  });

  it("avale un refus du fournisseur sans lever", async () => {
    process.env.RESEND_API_KEY = "cle";
    process.env.ALERT_EMAIL_TO = "exploitant@example.test";
    const refus = vi.fn(async () => new Response('{"message":"domain not verified"}', { status: 403 }));
    expect(await sendAlert(alerte, refus as unknown as typeof fetch)).toBe(false);
  });

  it("avale une coupure réseau sans lever", async () => {
    process.env.RESEND_API_KEY = "cle";
    process.env.ALERT_EMAIL_TO = "exploitant@example.test";
    const coupure = vi.fn(async () => { throw new Error("ECONNRESET"); });
    expect(await sendAlert(alerte, coupure as unknown as typeof fetch)).toBe(false);
  });
});
