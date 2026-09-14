import { describe, expect, it, vi } from "vitest";
import { isTokenNotYetValid, waitForSessionReady } from "@/lib/auth/session-ready";

describe("détection d’un jeton pas encore valide", () => {
  it("reconnaît le refus observé en production", () => {
    // Message exact renvoyé par Supabase lors du premier appel suivant la connexion.
    expect(isTokenNotYetValid({ message: "JWT issued at future" })).toBe(true);
  });

  it("reconnaît les formulations voisines des validateurs de jeton", () => {
    expect(isTokenNotYetValid({ message: "token is not yet valid" })).toBe(true);
    expect(isTokenNotYetValid({ message: "Token used before issued" })).toBe(true);
  });

  it("ne confond pas un vrai problème d’autorisation avec un décalage d’horloge", () => {
    // Le point important : ces erreurs ne doivent jamais être réessayées en silence.
    expect(isTokenNotYetValid({ message: "JWT expired" })).toBe(false);
    expect(isTokenNotYetValid({ message: "invalid signature" })).toBe(false);
    expect(isTokenNotYetValid({ message: "permission denied for table transactions" })).toBe(false);
    expect(isTokenNotYetValid(null)).toBe(false);
  });
});

describe("attente que la session devienne utilisable", () => {
  it("rend la main dès le premier succès, sans attendre", async () => {
    const probe = vi.fn(async () => ({ error: null }));
    expect(await waitForSessionReady(probe)).toBe(true);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("réessaie tant que le jeton est en avance, puis réussit", async () => {
    let calls = 0;
    const probe = vi.fn(async () => ({ error: ++calls < 3 ? { message: "JWT issued at future" } : null }));
    expect(await waitForSessionReady(probe, { delayMs: 1 })).toBe(true);
    expect(probe).toHaveBeenCalledTimes(3);
  });

  it("abandonne immédiatement sur une autre erreur, sans la masquer par un délai", async () => {
    const probe = vi.fn(async () => ({ error: { message: "permission denied" } }));
    expect(await waitForSessionReady(probe, { delayMs: 1 })).toBe(false);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("renonce au bout du nombre d’essais prévu plutôt que de boucler", async () => {
    const probe = vi.fn(async () => ({ error: { message: "JWT issued at future" } }));
    expect(await waitForSessionReady(probe, { attempts: 3, delayMs: 1 })).toBe(false);
    expect(probe).toHaveBeenCalledTimes(3);
  });
});
