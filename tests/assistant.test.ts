import { describe, expect, it, vi } from "vitest";
import { FinanceAssistant, type ToolRunner } from "@/lib/ai/assistant/assistant";
import { parseToolArguments, redactCounterparty, TOOL_DEFINITIONS } from "@/lib/ai/assistant/tools";

/** Construit un flux SSE comme celui d'OpenAI, ce qui exerce aussi l'analyseur. */
const sse = (events: unknown[]) => new ReadableStream({
  start(controller) {
    for (const event of events) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
    controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
    controller.close();
  }
});
// Le texte arrive en plusieurs fragments, comme en production : un test sur un fragment
// unique ne prouverait pas que l'accumulation fonctionne.
const textReply = (text: string) => [...text.match(/.{1,7}/g) ?? []].map((part) => ({ type: "response.output_text.delta", delta: part }));
const toolCall = (name: string, args: unknown, callId = "call_1") => [{ type: "response.output_item.done", item: { type: "function_call", name, call_id: callId, arguments: JSON.stringify(args) } }];
const respond = (...payloads: unknown[][]) => {
  const queue = [...payloads];
  return vi.fn(async () => new Response(sse(queue.shift() ?? []), { status: 200, headers: { "content-type": "text/event-stream" } }));
};
const runner = (impl?: ToolRunner["run"]): ToolRunner & { calls: Array<[string, unknown]> } => {
  const calls: Array<[string, unknown]> = [];
  return { calls, run: async (name, args) => { calls.push([name, args]); return impl ? impl(name, args) : { ok: true }; } };
};

describe("validation des arguments d’outil", () => {
  it("refuse un outil inconnu", () => {
    expect(parseToolArguments("drop_database", "{}")).toMatchObject({ ok: false });
  });

  it("refuse un mois mal formé plutôt que de le transmettre à la base", () => {
    expect(parseToolArguments("get_spending_summary", '{"month":"août 2026"}')).toMatchObject({ ok: false });
    expect(parseToolArguments("get_spending_summary", '{"month":"2026-08"}')).toMatchObject({ ok: true });
  });

  it("refuse des arguments illisibles sans lever", () => {
    expect(parseToolArguments("get_accounts", "{ pas du json")).toMatchObject({ ok: false });
  });

  it("ramène une limite trop grande au maximum au lieu de refuser", () => {
    // Observé en production : le modèle demandait limit=100, était rejeté, réessayait à
    // l'identique six fois, puis annonçait « aucune transaction » à l'utilisateur.
    const parsed = parseToolArguments("get_recent_transactions", '{"from":"2026-08-01","to":"2026-09-01","limit":5000}');
    expect(parsed).toMatchObject({ ok: true });
    expect((parsed as { args: { limit: number } }).args.limit).toBe(50);
  });

  it("traite une catégorie vide comme l’absence de filtre", () => {
    // Transmise telle quelle, la chaîne vide filtrait sur category = '' et ne renvoyait rien.
    const parsed = parseToolArguments("get_recent_transactions", '{"from":"2026-08-01","to":"2026-09-01","category":"  "}');
    expect((parsed as { args: { category?: string } }).args.category).toBeUndefined();
  });

  it("refuse toujours une limite absurde plutôt que de la corriger en silence", () => {
    expect(parseToolArguments("get_recent_transactions", '{"from":"2026-08-01","to":"2026-09-01","limit":0}')).toMatchObject({ ok: false });
  });
});

describe("protection des tiers", () => {
  it("remplace le nom d’une personne par la nature de l’opération", () => {
    // Ces libellés portent l'identité de tiers, qui n'a aucune utilité pour répondre à une
    // question financière et n'a donc pas à être transmise.
    expect(redactCounterparty("TO JULIEN MARC ANTOINE LEROY")).toBe("Virement émis");
    expect(redactCounterparty("FROM SOPHIE R")).toBe("Virement reçu");
  });

  it("laisse intacts les vrais commerçants", () => {
    expect(redactCounterparty("CARREFOUR")).toBe("CARREFOUR");
    expect(redactCounterparty("TOTAL ENERGIES")).toBe("TOTAL ENERGIES");
  });
});

describe("boucle de conversation", () => {
  it("répond directement quand aucun outil n’est nécessaire", async () => {
    const assistant = new FinanceAssistant("key", runner(), respond(textReply("Bonjour.")) as never);
    const turn = await assistant.ask([], "bonjour");
    expect(turn).toMatchObject({ reply: "Bonjour.", iterations: 1 });
    expect(turn.toolCalls).toHaveLength(0);
  });

  it("appelle l’outil puis répond à partir de son résultat", async () => {
    const tools = runner(async () => ({ totalSpent: 1234.5, currency: "EUR" }));
    const assistant = new FinanceAssistant("key", tools, respond(
      toolCall("get_spending_summary", { month: "2026-08" }),
      textReply("Tu as dépensé 1 234,50 € en août.")
    ) as never);
    const turn = await assistant.ask([], "combien en août ?");
    expect(tools.calls).toEqual([["get_spending_summary", { month: "2026-08" }]]);
    expect(turn.reply).toContain("1 234,50");
  });

  it("renvoie l’erreur au modèle au lieu d’échouer, pour qu’il se corrige", async () => {
    const tools = runner();
    const assistant = new FinanceAssistant("key", tools, respond(
      toolCall("get_spending_summary", { month: "pas-un-mois" }),
      textReply("Quelle période exactement ?")
    ) as never);
    const turn = await assistant.ask([], "combien ?");
    expect(tools.calls).toHaveLength(0);
    expect(turn.toolCalls[0]).toMatchObject({ ok: false });
    expect(turn.reply).toContain("période");
  });

  it("n’interrompt pas la conversation quand un outil échoue", async () => {
    const tools = runner(async () => { throw new Error("Base indisponible"); });
    const assistant = new FinanceAssistant("key", tools, respond(
      toolCall("get_accounts", {}),
      textReply("Je n’arrive pas à lire tes comptes pour l’instant.")
    ) as never);
    await expect(assistant.ask([], "mes comptes ?")).resolves.toMatchObject({ reply: expect.stringContaining("comptes") });
  });

  it("s’arrête au plafond de tours au lieu de boucler indéfiniment", async () => {
    // Chaque tour est un appel facturé : un modèle qui redemande sans fin doit être coupé.
    const tools = runner();
    const http = vi.fn(async () => new Response(sse(toolCall("get_accounts", {})), { status: 200, headers: { "content-type": "text/event-stream" } }));
    const assistant = new FinanceAssistant("key", tools, http as never);
    const turn = await assistant.ask([], "boucle");
    expect(turn.iterations).toBe(6);
    expect(http.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it("retire les outils au dernier tour pour forcer une conclusion", async () => {
    const http = vi.fn(async (_url: string, init?: RequestInit) => new Response(sse(toolCall("get_accounts", {})), { status: 200, headers: { "content-type": "text/event-stream" } }));
    const assistant = new FinanceAssistant("key", runner(), http as never);
    await assistant.ask([], "boucle");
    const lastBody = JSON.parse(String(http.mock.calls.at(-1)?.[1]?.body));
    expect(lastBody.tools).toBeUndefined();
  });
});

describe("consignes données au modèle", () => {
  it("interdit le Markdown, que l’interface afficherait littéralement", async () => {
    const http = vi.fn(async (_url: string, init?: RequestInit) => new Response(sse(textReply("ok")), { status: 200, headers: { "content-type": "text/event-stream" } }));
    await new FinanceAssistant("key", runner(), http as never).ask([], "bonjour");
    const body = JSON.parse(String(http.mock.calls[0]?.[1]?.body));
    expect(body.instructions).toContain("sans Markdown");
  });

  it("transmet la date du jour, sans laquelle « le mois dernier » n’a pas de sens", async () => {
    const http = vi.fn(async (_url: string, init?: RequestInit) => new Response(sse(textReply("ok")), { status: 200, headers: { "content-type": "text/event-stream" } }));
    await new FinanceAssistant("key", runner(), http as never).ask([], "et le mois dernier ?", new Date("2026-09-03T10:00:00Z"));
    expect(JSON.parse(String(http.mock.calls[0]?.[1]?.body)).instructions).toContain("2026-09-03");
  });
});

describe("vocabulaire des catégories", () => {
  it("énumère les catégories dans la définition d’outil, pour éviter les traductions", async () => {
    // Le modèle envoyait « Voyage » et « Abonnements » ; la taxonomie dit Travel et
    // Subscriptions. Sans énumération, chaque tentative coûtait un aller-retour.
    const http = vi.fn(async (_url: string, init?: RequestInit) => new Response(sse(textReply("ok")), { status: 200, headers: { "content-type": "text/event-stream" } }));
    await new FinanceAssistant("key", runner(), http as never).ask([], "?");
    const tools = JSON.parse(String(http.mock.calls[0]?.[1]?.body)).tools;
    const recent = tools.find((t: { name: string }) => t.name === "get_recent_transactions");
    expect(recent.parameters.properties.category.enum).toContain("Travel");
    expect(recent.parameters.properties.category.enum).toContain("Subscriptions");
  });

  it("dit au modèle qu’une erreur d’outil n’est pas une absence de données", async () => {
    const http = vi.fn(async (_url: string, init?: RequestInit) => new Response(sse(textReply("ok")), { status: 200, headers: { "content-type": "text/event-stream" } }));
    await new FinanceAssistant("key", runner(), http as never).ask([], "?");
    expect(JSON.parse(String(http.mock.calls[0]?.[1]?.body)).instructions).toContain("aucune transaction");
  });
});

describe("écriture de budget, seule action possible", () => {
  it("refuse un montant négatif ou nul", () => {
    expect(parseToolArguments("set_budget", '{"category":"Restaurants","monthlyLimit":-50}')).toMatchObject({ ok: false });
    expect(parseToolArguments("set_budget", '{"category":"Restaurants","monthlyLimit":0}')).toMatchObject({ ok: false });
  });

  it("refuse un montant invraisemblable", () => {
    expect(parseToolArguments("set_budget", '{"category":"Restaurants","monthlyLimit":99999999}')).toMatchObject({ ok: false });
  });

  it("refuse une catégorie hors taxonomie", () => {
    // Le modèle ne peut pas inventer une catégorie et créer un budget qui n'agrégerait rien.
    expect(parseToolArguments("set_budget", '{"category":"Sorties du samedi","monthlyLimit":200}')).toMatchObject({ ok: false });
  });

  it("accepte une demande légitime", () => {
    expect(parseToolArguments("set_budget", '{"category":"Restaurants","monthlyLimit":200}')).toMatchObject({ ok: true });
  });

  it("n’expose aucun outil de suppression ni de modification de transaction", () => {
    /* La surface d'écriture doit rester délibérément étroite, et l'allowlist est nominative :
       tout outil qui n'est pas une lecture doit figurer explicitement ci-dessous.

       Trois natures, à ne pas confondre. « get_ » lit et rend au modèle. « show_ » lit aussi,
       mais fait en outre afficher des lignes à l'utilisateur — un effet sur l'écran, aucun sur
       les données. « set_ » prépare une proposition que l'utilisateur doit confirmer ailleurs.
       Aucune ne touche une transaction, et c'est ce que ce test tient. */
    const horsLecture = TOOL_DEFINITIONS.map((tool) => tool.name).filter((name) => !name.startsWith("get_"));
    expect(horsLecture.filter((name) => name.startsWith("show_")).sort()).toEqual(["show_largest_transactions", "show_transactions"]);
    expect(horsLecture.filter((name) => !name.startsWith("show_"))).toEqual(["set_budget"]);
  });
});

describe("diffusion progressive", () => {
  const collect = async (assistant: FinanceAssistant, question = "?") => {
    const events = [];
    for await (const event of assistant.stream([], question)) events.push(event);
    return events;
  };

  it("émet le texte par fragments, sans attendre la réponse entière", async () => {
    const events = await collect(new FinanceAssistant("key", runner(), respond(textReply("Tu as dépensé 1 234 € en août.")) as never));
    const deltas = events.filter((event) => event.type === "delta");
    expect(deltas.length).toBeGreaterThan(1);
    expect(deltas.map((event) => (event as { text: string }).text).join("")).toBe("Tu as dépensé 1 234 € en août.");
  });

  it("annonce chaque outil avant de l’exécuter", async () => {
    // C'est ce qui rend visibles les deux tiers d'attente où le modèle n'écrit rien.
    const events = await collect(new FinanceAssistant("key", runner(), respond(
      toolCall("get_spending_by_category", { from: "2026-08-01", to: "2026-09-01" }),
      textReply("Voici.")
    ) as never));
    const labels = events.filter((event) => event.type === "tool").map((event) => (event as { label: string }).label);
    expect(labels).toEqual(["Je répartis par catégorie…"]);
    expect(events.findIndex((event) => event.type === "tool")).toBeLessThan(events.findIndex((event) => event.type === "delta"));
  });

  it("termine toujours par un événement final porteur de la réponse complète", async () => {
    const events = await collect(new FinanceAssistant("key", runner(), respond(textReply("Bonjour.")) as never));
    expect(events.at(-1)).toEqual({ type: "done", reply: "Bonjour." });
  });

  it("reconstitue un fragment SSE coupé entre deux lectures réseau", async () => {
    // Un événement peut arriver en deux morceaux ; sans tampon, le JSON serait illisible.
    const payload = `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "coupé" })}\n\n`;
    const http = vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(payload.slice(0, 20)));
        controller.enqueue(new TextEncoder().encode(payload.slice(20)));
        controller.close();
      }
    }), { status: 200 }));
    const events = await collect(new FinanceAssistant("key", runner(), http as never));
    expect(events.filter((event) => event.type === "delta")).toEqual([{ type: "delta", text: "coupé" }]);
  });
});
