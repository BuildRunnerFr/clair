import { describe, expect, it, vi, afterEach } from "vitest";

// Même convention que les autres tests de modules serveur : le garde-fou d'import n'a pas de
// sens hors du rendu Next, et il empêcherait simplement de charger le module ici.
vi.mock("server-only", () => ({}));

/**
 * On n'offre que les connexions qui aboutissent.
 *
 * L'écran de connexion proposait « Continuer avec Apple » alors que le fournisseur n'était pas
 * configuré : Supabase répondait 400 à la demande d'autorisation, et l'utilisateur lisait
 * « Connexion impossible pour le moment. Réessayez dans un instant. » — un message qui annonce
 * un incident passager sur un chemin définitivement fermé. Trouvé en recette, sur le premier
 * écran du produit.
 */
const settings = (external: Record<string, boolean>) =>
  vi.fn(async () => new Response(JSON.stringify({ external }), { status: 200 }));

async function providersWith(fetchImpl: typeof fetch) {
  vi.stubGlobal("fetch", fetchImpl);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemple.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "clé-publique";
  const { enabledProviders } = await import("@/lib/auth/providers");
  return enabledProviders();
}

afterEach(() => vi.unstubAllGlobals());

describe("les fournisseurs proposés à la connexion", () => {
  it("ne retient que ceux que Supabase déclare actifs", async () => {
    expect(await providersWith(settings({ google: true, apple: false, email: true }) as unknown as typeof fetch))
      .toEqual(["google"]);
  });

  it("les propose tous les deux quand ils le sont", async () => {
    expect(await providersWith(settings({ google: true, apple: true }) as unknown as typeof fetch))
      .toEqual(["google", "apple"]);
  });

  it("ignore un fournisseur que l’application ne sait pas gérer", async () => {
    expect(await providersWith(settings({ github: true }) as unknown as typeof fetch)).toEqual([]);
  });

  it("n’en propose aucun plutôt qu’un mort si la lecture échoue", async () => {
    expect(await providersWith((async () => { throw new Error("réseau"); }) as unknown as typeof fetch)).toEqual([]);
    expect(await providersWith((async () => new Response("", { status: 500 })) as unknown as typeof fetch)).toEqual([]);
  });
});
