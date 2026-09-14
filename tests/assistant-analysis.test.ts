import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { TOOL_DEFINITIONS, TOOL_SCHEMAS, parseToolArguments } from "@/lib/ai/assistant/tools";
import { TOOL_LABELS } from "@/lib/ai/assistant/assistant";

/**
 * L'assistant ne peut analyser que ce qu'il peut interroger.
 *
 * Il disposait du total du mois et de celui d'avant, et de rien d'autre : il qualifiait donc de
 * « forte hausse » un écart de vingt pour cent, alors que la dépense au même jour varie de dix-
 * neuf à soixante-douze pour cent d'un mois sur l'autre. Trois outils manquaient — la position
 * du mois parmi les précédents, l'écart par catégorie à l'habitude, et les récurrences.
 */
describe("les outils d’analyse de l’assistant", () => {
  it("expose la position du mois, l’écart à l’habitude et les récurrences", () => {
    const noms = TOOL_DEFINITIONS.map((tool) => tool.name);
    for (const attendu of ["get_month_position", "get_unusual_spending", "get_subscriptions"]) {
      expect(noms, attendu).toContain(attendu);
      expect(Object.keys(TOOL_SCHEMAS), attendu).toContain(attendu);
    }
  });

  it("décrit chaque outil au modèle, sans quoi il ne l’appellera pas", () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.description.length, tool.name).toBeGreaterThan(40);
    }
  });

  it("valide le mois et refuse ce qui n’en est pas un", () => {
    expect(parseToolArguments("get_unusual_spending", '{"month":"2026-08"}')).toMatchObject({ ok: true });
    for (const mauvais of ['{"month":"2026-13"}', '{"month":"août"}', '{"month":"2026-08-01"}', "{}"]) {
      expect(parseToolArguments("get_unusual_spending", mauvais).ok, mauvais).toBe(false);
    }
  });

  it("annonce à l’écran ce que chaque outil est en train de faire", () => {
    /* Le modèle passe environ deux tiers du temps à interroger la base, pendant quoi il n'écrit
       rien. Un outil sans libellé laisse donc l'écran muet le temps de son travail, et rien
       dans le typage ne l'impose — cinq outils ont été ajoutés d'un coup, en oublier un était
       le défaut le plus probable. */
    for (const tool of TOOL_DEFINITIONS) {
      expect(TOOL_LABELS[tool.name], tool.name).toBeTruthy();
    }
  });

  it("n’exige aucun argument pour les récurrences", () => {
    expect(parseToolArguments("get_subscriptions", "{}")).toMatchObject({ ok: true });
  });
});

/**
 * Le parcours entier, avec un modèle simulé : « où ai-je trop dépensé ».
 *
 * Ce que ce test tient, c'est l'enchaînement — situer le mois, chercher l'écart à l'habitude,
 * puis sortir les opérations — et le fait que chaque appel passe la validation. Il ne dit rien
 * de la qualité de la réponse, qui dépend du modèle ; il dit que la mécanique répond.
 */
import { FinanceAssistant, type ToolRunner } from "@/lib/ai/assistant/assistant";

const sse = (events: unknown[]) => new ReadableStream({
  start(controller) {
    for (const event of events) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
    controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
    controller.close();
  }
});
const appel = (name: string, args: unknown, id: string) => [{ type: "response.output_item.done", item: { type: "function_call", name, call_id: id, arguments: JSON.stringify(args) } }];
const texte = (t: string) => [{ type: "response.output_text.delta", delta: t }];

describe("« où ai-je trop dépensé », de bout en bout", () => {
  it("situe le mois, cherche l’écart, puis montre les opérations", async () => {
    const appels: string[] = [];
    const outils: ToolRunner = { run: async (name) => { appels.push(name); return { ok: true }; } };
    const files = [
      appel("get_month_position", { month: "2026-08" }, "a"),
      appel("get_unusual_spending", { month: "2026-08" }, "b"),
      appel("show_transactions", { month: "2026-08", category: "Restaurants", limit: 6 }, "c"),
      texte("Août reste dans votre ordinaire.")
    ];
    const http = vi.fn(async () => new Response(sse(files.shift() ?? []), { status: 200, headers: { "content-type": "text/event-stream" } }));
    const assistant = new FinanceAssistant("clé", outils, http as unknown as typeof fetch);

    const etapes: string[] = [];
    let reponse = "";
    for await (const evenement of assistant.stream([], "Où est-ce que j’ai trop dépensé le mois dernier ?")) {
      if (evenement.type === "tool") etapes.push(evenement.label);
      if (evenement.type === "done") reponse = evenement.reply;
    }

    expect(appels).toEqual(["get_month_position", "get_unusual_spending", "show_transactions"]);
    // L'écran n'est jamais muet pendant que la base est interrogée.
    expect(etapes).toHaveLength(3);
    expect(etapes.every((label) => label.length > 0)).toBe(true);
    expect(reponse).toBe("Août reste dans votre ordinaire.");
  });
});

describe("le masquage des contreparties", () => {
  it("retire un nom de personne précédé de sa civilité", async () => {
    const { redactCounterparty } = await import("@/lib/ai/assistant/tools");
    for (const libelle of ["MR JOHN SMITH", "MS JANE DOE", "Mme Dupont", "M. Martin", "Dr Bernard"]) {
      expect(redactCounterparty(libelle), libelle).toBe("Virement à un particulier");
    }
  });

  it("ne masque pas une enseigne dont le nom commence par les mêmes lettres", async () => {
    const { redactCounterparty } = await import("@/lib/ai/assistant/tools");
    // « MRS FIELDS COOKIES » sans numéro reste masqué : collision assumée, voir le commentaire.
    for (const enseigne of ["MONOPRIX", "MSC CROISIERES", "DRIVE CARREFOUR", "MRS FIELDS COOKIES 12", "MR BRICOLAGE 0412"]) {
      expect(redactCounterparty(enseigne), enseigne).not.toBe("Virement à un particulier");
    }
  });
});
