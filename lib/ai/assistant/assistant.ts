import { parseToolArguments, TOOL_DEFINITIONS, type ToolName } from "./tools";

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantTurn {
  reply: string;
  toolCalls: Array<{ name: string; arguments: unknown; ok: boolean }>;
  iterations: number;
}

/**
 * Ce que l'interface reçoit pendant qu'une réponse se construit.
 *
 * Deux natures d'attente, et une seule était visible. Sur une question un peu large, le modèle
 * passe environ deux tiers du temps à décider puis à interroger la base — pendant quoi il
 * n'écrit rien, donc rien à streamer — et un tiers à rédiger. Diffuser le texte seul aurait
 * laissé les deux tiers muets ; l'événement « tool » les rend lisibles.
 */
export type AssistantEvent =
  | { type: "tool"; label: string }
  | { type: "delta"; text: string }
  | { type: "done"; reply: string };

/** Formulations à la première personne : c'est l'assistant qui parle, pas un journal technique. */
export const TOOL_LABELS: Record<string, string> = {
  get_spending_summary: "Je regarde le total du mois…",
  get_spending_by_category: "Je répartis par catégorie…",
  get_top_merchants: "Je cherche tes principaux commerçants…",
  get_spending_between: "Je calcule sur la période…",
  get_recent_transactions: "Je parcours le détail des transactions…",
  get_accounts: "Je consulte tes comptes…",
  get_budget_status: "Je vérifie tes budgets…",
  get_month_position: "Je situe ce mois parmi les précédents…",
  get_unusual_spending: "Je compare chaque poste à ton habitude…",
  get_subscriptions: "Je fais le tour de tes prélèvements récurrents…",
  get_month_flows: "Je regarde ce qui est entré et ce qui est sorti…",
  show_transactions: "Je sors les opérations concernées…",
  show_largest_transactions: "Je cherche tes plus grosses dépenses, depuis le début…",
  get_all_time_totals: "J’additionne tout ton historique…",
  set_budget: "Je prépare une proposition de budget…"
};

export interface ToolRunner {
  run(name: ToolName, args: Record<string, unknown>): Promise<unknown>;
}

const OPENAI_URL = "https://api.openai.com/v1/responses";
const TIMEOUT_MS = 45_000;
/**
 * Plafond de tours d'outils. Un modèle peut boucler — redemander la même agrégation, affiner
 * indéfiniment — et chaque tour est un appel facturé. Au-delà, on lui demande de conclure avec
 * ce qu'il a plutôt que de le laisser tourner.
 */
const MAX_ITERATIONS = 6;

const SYSTEM_PROMPT = `Tu es l'assistant financier de Clair. Tu réponds en français, brièvement, à des questions sur les dépenses de l'utilisateur.

Règles :
- N'avance jamais un chiffre sans l'avoir obtenu par un outil. Si un outil n'a pas été appelé, tu ne connais pas le montant.
- Les montants sont déjà convertis dans la devise principale de l'utilisateur ; ne convertis rien toi-même et n'additionne pas des devises différentes.
- Les libellés « Virement émis » et « Virement reçu » désignent des virements entre particuliers dont l'identité a été volontairement retirée. Ne cherche pas à savoir de qui il s'agit.
- Si la question est ambiguë sur la période, prends le mois en cours et dis-le.
- Si les données ne permettent pas de répondre, dis-le franchement plutôt que d'estimer.
- Un outil qui renvoie un champ « error » a échoué : ce n'est pas une absence de données. Ne conclus jamais « aucune transaction » sur une erreur ; dis que la requête a échoué, ou corrige tes arguments et réessaie.
- Les catégories portent des noms anglais (Travel, Subscriptions, Restaurants…). Emploie-les tels quels dans les outils, et traduis seulement dans ta réponse.
- Tu peux proposer un budget avec set_budget. Cet outil ne sauvegarde rien : une confirmation dans l’interface Budgets est indispensable. Tu ne peux ni supprimer, ni modifier une transaction, ni changer un réglage.
- N'appelle set_budget que si l'utilisateur a demandé un budget et que le montant est sans ambiguïté. S'il dit seulement « aide-moi à économiser », propose un montant et attends sa confirmation. Après la proposition, précise la catégorie et le montant, puis demande au client de vérifier et confirmer avec le bouton affiché. Ne dis jamais que la proposition est déjà enregistrée.

Analyser, et non seulement répondre :
- Avant de qualifier un mois de fort ou de faible, appelle get_month_position. Un écart à la médiane qui reste dans l'étendue déjà observée n'est pas une information : dis que le mois est ordinaire. La dépense au même jour varie de dix-neuf à soixante-douze pour cent d'un mois à l'autre — vingt pour cent d'écart, ce n'est rien.
- Pour « où ai-je trop dépensé » ou « qu'est-ce qui n'était pas nécessaire », appelle get_unusual_spending, puis show_transactions sur le poste qui dépasse le plus. Un total ne se discute pas ; les opérations qui le composent, si. L'utilisateur les voit apparaître sous ta réponse : ne les recopie pas une à une, commente ce qu'elles montrent. Ne juge jamais toi-même qu'une dépense est superflue : la famille le dit. « Plaisirs » est le discrétionnaire, « Essentiels » le subi. Cite les deux ou trois postes qui dépassent le plus leur habitude, avec l'écart chiffré, et laisse l'utilisateur juger.
- Une catégorie dont monthsCounted vaut zéro ou un n'a pas d'habitude : ne conclus pas dessus, signale seulement qu'il n'y a pas encore de repère.
- Avant de conseiller une économie, appelle get_month_flows. Conseiller de réduire un poste sans savoir ce qui reste à la fin du mois, c'est parler dans le vide : un mois qui dégage trois cents euros et un mois qui finit à découvert n'appellent pas les mêmes mots. Si aucun revenu n'est détecté, ne conclus rien sur la marge.
- Quand tu conseilles, appuie-toi sur ce qui se répète : get_subscriptions donne le coût annuel et les hausses de tarif. Un abonnement à douze euros ne se remarque pas ; cent quarante-quatre euros par an, si. Un conseil sans chiffre n'est pas un conseil.
- Dès que ta réponse énumérerait des opérations — « montre-moi mes plus grosses dépenses », « lesquelles », « ma plus grosse dépense depuis le début », le détail d'un poste —, appelle show_transactions au lieu de les écrire. Pour une question sans période — « ma plus grosse dépense », « depuis la création du compte », « toutes périodes confondues » — emploie show_largest_transactions pour les opérations et get_all_time_totals pour les totaux : aucun des deux n'a de dates. Les virements sont une catégorie comme une autre dans ces totaux : « combien de virements depuis le début » se lit sur la ligne Transfers. N'invente jamais une plage pour couvrir l'historique, et ne réponds jamais que tu ne peux pas remonter au-delà d'un mois. Un seul appel d'affichage par réponse : le suivant remplace la liste sous les yeux de l'utilisateur, et la réponse ne correspondrait plus à ce qu'il voit. Une liste recopiée en texte n'est pas cliquable et ne mène nulle part ; le bloc, si. get_top_merchants donne des totaux par commerçant, ce n'est pas la même chose que des opérations.
- Un conseil doit être une action, pas une intention. « Regarde tes deux abonnements de streaming, ils font 214 € par an » se fait ; « fais attention aux dépenses superflues » ne se fait pas. Une seule action à la fois, la plus rentable.
- Ne moralise pas. L'utilisateur sait ce qu'il a acheté ; ton rôle est de lui montrer ce qu'il ne voyait pas, pas de le juger. Pas de « attention à », pas de « vous devriez faire attention ».
- Termine par une ouverture concrète quand c'est utile : ce qu'il pourrait regarder ensuite, ou une action possible. Une seule, la plus pertinente.

- Réponds en texte brut, sans Markdown : pas d'astérisques, de dièses ni de tirets de liste. L'interface affiche ta réponse telle quelle, et ces marques y apparaîtraient littéralement. Pour énumérer, va à la ligne.`;

export class FinanceAssistant {
  constructor(
    private readonly apiKey: string,
    private readonly tools: ToolRunner,
    private readonly http: typeof fetch = fetch,
    private readonly model = process.env.OPENAI_ASSISTANT_MODEL?.trim() || "gpt-5.6-luna"
  ) {}

  /** Collecte le flux. Utile aux appels qui n'affichent rien en cours de route, et aux tests. */
  async ask(history: AssistantMessage[], question: string, today = new Date()): Promise<AssistantTurn> {
    let reply = "";
    for await (const event of this.stream(history, question, today)) {
      if (event.type === "done") reply = event.reply;
    }
    return { reply, toolCalls: this.lastToolCalls, iterations: this.lastIterations };
  }

  private lastToolCalls: AssistantTurn["toolCalls"] = [];
  private lastIterations = 0;

  async *stream(history: AssistantMessage[], question: string, today = new Date()): AsyncGenerator<AssistantEvent> {
    const input: unknown[] = [
      ...history.map((message) => ({ role: message.role, content: message.content })),
      { role: "user", content: question }
    ];
    const toolCalls: AssistantTurn["toolCalls"] = [];
    this.lastToolCalls = toolCalls;

    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
      this.lastIterations = iteration;
      let text = "";
      const calls: Array<{ name?: string; call_id?: string; arguments?: string }> = [];

      // Le texte est diffusé au fil de son arrivée ; les appels d'outils sont accumulés pour
      // être exécutés une fois la réponse du modèle terminée.
      for await (const chunk of this.requestStream(input, iteration === MAX_ITERATIONS, today)) {
        if (chunk.kind === "delta") { text += chunk.text; yield { type: "delta", text: chunk.text }; }
        else calls.push(chunk.call);
      }

      if (!calls.length) {
        const reply = text.trim() || "Je n’ai pas réussi à formuler de réponse.";
        yield { type: "done", reply };
        return;
      }

      for (const call of calls) {
        yield { type: "tool", label: TOOL_LABELS[call.name ?? ""] ?? "Je consulte tes données…" };
        input.push({ type: "function_call", name: call.name, call_id: call.call_id, arguments: call.arguments });
        const parsed = parseToolArguments(call.name ?? "", call.arguments ?? "{}");
        let output: string;
        if (!parsed.ok) {
          // L'erreur est renvoyée au modèle plutôt que levée : il peut corriger ses arguments,
          // ce qu'une exception lui interdirait.
          output = JSON.stringify({ error: parsed.error });
          toolCalls.push({ name: call.name ?? "?", arguments: call.arguments, ok: false });
        } else {
          try {
            output = JSON.stringify(await this.tools.run(parsed.name, parsed.args as Record<string, unknown>));
            toolCalls.push({ name: parsed.name, arguments: parsed.args, ok: true });
            /* Les arguments sont journalisés, jamais les résultats : les premiers sont des
               mois, des catégories et des limites — aucune donnée personnelle —, les seconds
               sont le relevé de quelqu'un. C'est le seul moyen de savoir pourquoi une réponse
               porte à côté : une question sur tout l'historique à laquelle le modèle avait
               répondu sur l'année en cours n'a été comprise qu'en voyant ce qu'il demandait. */
            console.info("[assistant] outil", { name: parsed.name, arguments: parsed.args });
          } catch (error) {
            output = JSON.stringify({ error: error instanceof Error ? error.message : "Échec de l’outil" });
            toolCalls.push({ name: parsed.name, arguments: parsed.args, ok: false });
          }
        }
        input.push({ type: "function_call_output", call_id: call.call_id, output });
      }
    }

    yield { type: "done", reply: "Je n’ai pas réussi à aboutir à une réponse dans le temps imparti." };
  }

  /**
   * Lit la réponse d'OpenAI en flux (SSE) plutôt que d'attendre le JSON complet.
   *
   * Deux natures d'événements nous intéressent : les fragments de texte, diffusés au fur et à
   * mesure, et les appels d'outils, qui n'arrivent qu'une fois l'élément terminé puisqu'il
   * faut leurs arguments entiers pour les exécuter.
   */
  private async *requestStream(input: unknown[], lastChance: boolean, today: Date): AsyncGenerator<{ kind: "delta"; text: string } | { kind: "call"; call: { name?: string; call_id?: string; arguments?: string } }> {
    const response = await this.http(OPENAI_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: this.model,
        store: false,
        stream: true,
        instructions: `${SYSTEM_PROMPT}\n\nDate du jour : ${today.toISOString().slice(0, 10)}.${lastChance ? "\n\nConclus maintenant avec les données déjà obtenues, sans appeler d'outil." : ""}`,
        input,
        // Au dernier tour les outils sont retirés : c'est ce qui garantit une réponse en
        // texte plutôt qu'un nouvel appel, et donc la fin de la boucle.
        ...(lastChance ? {} : { tools: TOOL_DEFINITIONS.map((tool) => ({ type: "function", ...tool })) }),
        max_output_tokens: 1200
      })
    });
    if (!response.ok || !response.body) throw new Error(`Assistant indisponible (${response.status}).`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Les événements SSE sont séparés par une ligne vide ; un fragment incomplet reste en
      // tampon jusqu'à la lecture suivante.
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        const line = block.split("\n").find((part) => part.startsWith("data:"));
        if (!line) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;
        let event: { type?: string; delta?: string; item?: { type?: string; name?: string; call_id?: string; arguments?: string } };
        try { event = JSON.parse(raw); } catch { continue; }
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") yield { kind: "delta", text: event.delta };
        else if (event.type === "response.output_item.done" && event.item?.type === "function_call") yield { kind: "call", call: { name: event.item.name, call_id: event.item.call_id, arguments: event.item.arguments } };
      }
    }
  }
}
