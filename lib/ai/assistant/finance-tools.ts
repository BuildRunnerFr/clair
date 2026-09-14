import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { getUtcMonthBounds } from "@/lib/analytics/month";
import { typicalMonth } from "@/lib/analytics/typical-month";
import { familyOf, FAMILY_LABELS } from "@/lib/categories/families";
import { redactCounterparty, type AssistantBlock, type ToolName } from "./tools";

/**
 * Exécute un outil contre la base, sous la session de l'utilisateur.
 *
 * Le client passé ici est celui de la requête, jamais le client admin : c'est ce qui garantit
 * que le RLS s'applique. Un assistant qui interrogerait la base avec la clé service pourrait
 * lire les données de n'importe qui, quelle que soit la prudence du prompt.
 */
export class FinanceTools {
  /**
   * Le second paramètre est un canal vers l'interface, distinct de ce que reçoit le modèle.
   *
   * La distinction porte tout le dispositif : un bloc part vers l'écran de l'utilisateur, la
   * valeur de retour part vers le modèle. Ils n'ont donc pas à être identiques — et pour les
   * transactions ils ne le sont pas, l'écran recevant les vrais libellés et le modèle leur
   * version masquée. L'utilisateur voit ses données ; le tiers ne les voit jamais.
   */
  constructor(private readonly client: SupabaseClient<Database>, private readonly emit?: (block: AssistantBlock) => void) {}

  async run(name: ToolName, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case "get_spending_summary": return this.spendingSummary(String(args.month));
      case "get_spending_by_category": return this.spendingByCategory(String(args.from), String(args.to));
      case "get_top_merchants": return this.topMerchants(String(args.month), Number(args.limit ?? 5));
      case "get_spending_between": return this.spendingBetween(String(args.from), String(args.to), args.category as string | undefined);
      case "get_recent_transactions": return this.recentTransactions(String(args.from), String(args.to), Number(args.limit ?? 15), args.category as string | undefined);
      case "get_accounts": return this.accounts();
      case "get_budget_status": return this.budgetStatus(String(args.month));
      case "get_month_position": return this.monthPosition(String(args.month));
      case "get_unusual_spending": return this.unusualSpending(String(args.month));
      case "get_subscriptions": return this.subscriptions();
      case "get_month_flows": return this.monthFlows(String(args.month));
      case "show_transactions": return this.showTransactions(args as { month?: string; from?: string; to?: string; category?: string; limit?: number });
      case "show_largest_transactions": return this.showTransactions({ limit: Number(args.limit ?? 8) });
      case "get_all_time_totals": return this.allTimeTotals();
      case "set_budget": return this.setBudget(String(args.category), Number(args.monthlyLimit));
    }
  }


  /**
   * Où le mois se situe parmi les mois passés, à date égale.
   *
   * Le même calcul que le tableau de bord, par la même fonction : l'assistant et l'écran ne
   * peuvent pas se contredire. Sans cet outil, le modèle ne disposait que du total du mois et
   * de celui du précédent, et il qualifiait de « forte hausse » un écart de vingt pour cent —
   * alors que la dépense au même jour varie de dix-neuf à soixante-douze pour cent d'un mois à
   * l'autre. L'étendue de l'ordinaire est précisément ce qui distingue un signal d'un bruit.
   */
  private async monthPosition(month: string) {
    const bounds = getUtcMonthBounds(month);
    const today = new Date();
    const courant = month === today.toISOString().slice(0, 7);
    // Sur un mois passé, la comparaison porte sur le mois entier ; sur le mois en cours, elle
    // s'arrête au jour d'aujourd'hui — comparer un mois commencé à des mois finis n'a pas de sens.
    const dernierJour = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    const arret = courant ? today.getUTCDate() : dernierJour;
    const [currency, rows] = await Promise.all([
      this.baseCurrency(),
      this.client.rpc("finance_month_to_date", { p_month: bounds.monthDate, p_day: arret, p_months: 6 })
    ]);
    const points = this.unwrap(rows, "Mois à date égale").map((row) => ({ month: String(row.month).slice(0, 7), total: Number(row.total) }));
    const position = typicalMonth(points, month);
    if (!position) return { month, currency, error: "Pas assez de mois couverts par le relevé pour situer celui-ci." };
    return {
      month, currency, monthComplete: !courant, comparedAtDay: arret, daysInMonth: dernierJour,
      spent: position.current, typical: position.typical,
      ordinaryRange: { lowest: position.lowest, highest: position.highest },
      monthsCompared: position.monthsCompared, changePercent: position.changePercent,
      position: position.position,
      lecture: position.position === "ordinaire"
        ? "Ce mois reste dans l'étendue déjà observée : l'écart à la médiane n'est pas une information."
        : `Ce mois sort de l'étendue observée (${position.lowest} à ${position.highest}).`
    };
  }

  /**
   * Ce qui dépasse l'habitude, catégorie par catégorie, avec sa famille.
   *
   * La famille est ce qui permet de répondre à « qu'est-ce qui n'était pas nécessaire » sans
   * que le modèle en juge lui-même : « plaisirs » désigne le discrétionnaire, « essentiels »
   * le loyer et les charges. Cette appartenance est fixe et vient du produit, pas du modèle.
   *
   * Une catégorie sans historique suffisant n'est pas comparée — elle est rendue avec
   * monthsCounted, à charge pour le modèle de ne pas conclure dessus.
   */
  private async unusualSpending(month: string) {
    const bounds = getUtcMonthBounds(month);
    const today = new Date();
    const courant = month === today.toISOString().slice(0, 7);
    const [currency, actuel, historique] = await Promise.all([
      this.baseCurrency(),
      this.client.rpc("finance_spending_by_category", { p_from: bounds.from, p_to: bounds.to, p_currency: null, p_account_id: null, p_category: null }),
      this.client.rpc("finance_category_history", { p_months: 6 })
    ]);
    const usuel = new Map(this.unwrap(historique, "Historique par catégorie")
      .map((row) => [row.category, { moyenne: Number(row.average_monthly), mois: Number(row.months_counted) }]));

    const categories = this.unwrap(actuel, "Dépenses par catégorie").map((row) => {
      const spent = Number(row.total_spent);
      const repere = usuel.get(row.category);
      const famille = familyOf(row.category);
      return {
        category: row.category,
        family: FAMILY_LABELS[famille],
        discretionary: famille === "plaisirs",
        spent,
        usualMonthly: repere ? round2(repere.moyenne) : null,
        monthsCounted: repere?.mois ?? 0,
        difference: repere ? round2(spent - repere.moyenne) : null,
        differencePercent: repere && repere.moyenne > 0 ? Math.round(((spent - repere.moyenne) / repere.moyenne) * 100) : null
      };
    }).sort((a, b) => (b.difference ?? -Infinity) - (a.difference ?? -Infinity));

    return {
      month, currency, monthComplete: !courant,
      ...(courant ? { avertissement: "Le mois n'est pas terminé : la moyenne habituelle porte sur des mois entiers, la comparaison surestime donc l'économie et sous-estime le dépassement. Le dire." } : {}),
      categories
    };
  }

  /** Les prélèvements récurrents, matière première de tout conseil durable. */
  private async subscriptions() {
    const { data, error } = await this.client
      .from("subscriptions")
      .select("merchant_name, latest_amount, previous_amount, average_amount, currency, frequency, last_transaction_date")
      .eq("direction", "debit").eq("active", true)
      .order("average_amount", { ascending: false }).limit(40);
    if (error) throw new Error(`Prélèvements récurrents : ${error.message}`);
    const parAn: Record<string, number> = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1 };
    return {
      subscriptions: (data ?? []).map((row) => {
        const montant = Number(row.latest_amount ?? row.average_amount);
        const occurrences = parAn[row.frequency] ?? 12;
        const precedent = row.previous_amount === null ? null : Number(row.previous_amount);
        return {
          merchant: redactCounterparty(row.merchant_name),
          amount: round2(montant), currency: row.currency, frequency: row.frequency,
          annualCost: round2(montant * occurrences),
          priceIncrease: precedent !== null && montant > precedent ? round2(montant - precedent) : null,
          lastCharge: row.last_transaction_date
        };
      }),
      note: "Ces récurrences sont détectées sur la cadence des opérations : elles ne prouvent ni un contrat actif ni une résiliation."
    };
  }


  /**
   * Les opérations elles-mêmes, montrées à l'utilisateur et non seulement racontées.
   *
   * « Tu as dépensé quatre cents euros en restaurants » n'appelle aucune décision ; les six
   * additions qui composent ces quatre cents, si. C'est là que l'utilisateur reconnaît ce qui
   * lui paraît de trop — un jugement qu'il est le seul à pouvoir porter, et que ni le modèle ni
   * le produit n'ont à porter pour lui.
   *
   * Les plus grosses d'abord, et non les plus récentes : c'est le montant qui décide de ce qui
   * mérite un regard. Le tri porte sur le montant converti — trier sur le montant d'origine
   * mêlerait des devises et ferait passer quatre-vingts livres devant cent euros.
   */
  private async showTransactions({ month, from, to, category, limit }: { month?: string; from?: string; to?: string; category?: string; limit?: number }) {
    /**
     * Les bornes sont facultatives, et leur absence signifie « tout l'historique ».
     *
     * Un mois était exigé, si bien que « ma plus grosse dépense depuis la création du compte »
     * n'avait pas de réponse. Trois formes sont admises : un mois, une période libre, ou rien.
     */
    const bornes = month ? getUtcMonthBounds(month) : null;
    const debut = bornes?.from ?? (from ? `${from}T00:00:00Z` : null);
    const fin = bornes?.to ?? (to ? `${to}T00:00:00Z` : null);
    const plafond = Math.min(Math.max(limit ?? 8, 1), 15);
    let requete = this.client.from("transactions")
      .select("id, transaction_date, merchant_name, description, amount, currency, amount_base, base_currency, category")
      .lt("amount", 0).eq("pending", false);
    if (debut) requete = requete.gte("transaction_date", debut);
    if (fin) requete = requete.lt("transaction_date", fin);
    if (category) requete = requete.eq("category", category);
    // On lit plus large que ce qu'on montrera : le regroupement qui suit réduit le nombre de
    // lignes, et prélever d'abord la limite donnerait deux lignes là où l'utilisateur en demande
    // huit. Quatre fois suffit — au-delà, c'est le même prélèvement sur plus de comptes qu'un
    // particulier n'en possède.
    const { data, error } = await requete
      .order("amount_base", { ascending: true, nullsFirst: false })
      .limit(plafond * 4);
    if (error) throw new Error(`Opérations à revoir : ${error.message}`);

    /**
     * Le montant affiché est celui du relevé, dans sa devise d'origine.
     *
     * Il l'était dans la devise de restitution, et c'était faux à l'écran : l'application a deux
     * notions de devise de base — le réglage de l'utilisateur, que renvoie finance_base_currency,
     * et la devise de conversion inscrite sur chaque opération — et elles peuvent différer. Une
     * même réponse annonçait alors des totaux en livres et des lignes en euros. Montrer la
     * dépense telle que la banque l'a passée ne peut pas se contredire, et c'est de toute façon
     * ce que l'utilisateur reconnaît.
     *
     * Le tri, lui, continue de porter sur le montant converti : c'est la seule grandeur
     * comparable entre deux devises. On classe sur l'une, on affiche l'autre.
     */
    const brutes = (data ?? []).map((row) => ({
      id: row.id,
      date: String(row.transaction_date).slice(0, 10),
      merchant: (row.merchant_name || row.description || "").trim(),
      amount: round2(Math.abs(Number(row.amount))),
      currency: row.currency,
      category: row.category ?? "Uncategorized"
    }));

    /**
     * Les opérations identiques sont réunies en une ligne.
     *
     * Un même prélèvement passé sur cinq comptes produisait cinq lignes rigoureusement
     * indiscernables — même jour, même commerçant, même montant — qui occupaient la totalité du
     * bloc et cachaient les autres dépenses. Or on demande où l'argent est parti, pas cinq fois
     * la même réponse. Le compte est affiché, ce qui dit à la fois combien et pourquoi.
     */
    const groupes = new Map<string, typeof brutes[number] & { count: number }>();
    for (const ligne of brutes) {
      const cle = `${ligne.date}|${ligne.merchant}|${ligne.amount}|${ligne.currency}`;
      const existant = groupes.get(cle);
      if (existant) existant.count++;
      else groupes.set(cle, { ...ligne, count: 1 });
    }
    const lignes = [...groupes.values()].slice(0, plafond);

    // Vers l'écran : les libellés réels, que l'utilisateur doit reconnaître.
    this.emit?.({ type: "transactions", transactions: lignes, month: month ?? null, category: category ?? null });
    // Vers le modèle : les mêmes lignes, libellés masqués.
    return {
      month: month ?? null, from: from ?? null, to: to ?? null,
      period: month ?? (from && to ? `${from} → ${to}` : "tout l'historique"),
      category: category ?? null, shown: lignes.length,
      transactions: lignes.map((ligne) => ({ ...ligne, id: undefined, merchant: redactCounterparty(ligne.merchant) })),
      note: "Ces opérations sont déjà affichées à l'utilisateur sous ta réponse. Ne les recopie pas une à une : commente-les."
    };
  }


  /**
   * Ce qui entre, ce qui sort, ce qui reste.
   *
   * Sans ce chiffre, tout conseil d'économie porte sur la dépense seule — « réduisez les
   * restaurants » — sans savoir s'il reste déjà de la marge ou si le mois se termine à
   * découvert. Ce sont deux situations qui n'appellent pas les mêmes mots.
   *
   * Les noms de l'utilisateur sont transmis pour la même raison qu'au tableau de bord : un
   * virement depuis un compte à lui qui n'est pas connecté ici n'est pas un revenu, et le
   * compter comme tel gonflerait la marge d'un argent qu'il possédait déjà.
   */
  private async monthFlows(month: string) {
    const bounds = getUtcMonthBounds(month);
    const { data: profil } = await this.client.from("user_profiles").select("first_name, last_name").maybeSingle();
    const noms = profil?.first_name && profil?.last_name
      ? [`${profil.first_name} ${profil.last_name}`, `${profil.last_name} ${profil.first_name}`]
      : [];
    const [currency, rows] = await Promise.all([
      this.baseCurrency(),
      this.client.rpc("finance_month_flows", { p_month: bounds.monthDate, p_currency: null, p_account_id: null, p_self_names: noms })
    ]);
    const row = this.unwrap(rows, "Entrées et sorties du mois")?.[0];
    const income = round2(Number(row?.income ?? 0));
    const outflow = round2(Number(row?.outflow ?? 0));
    return {
      month, currency, income, outflow, net: round2(income - outflow),
      transfersExcluded: round2(Number(row?.transfers_excluded ?? 0)),
      ...(income === 0 ? { avertissement: "Aucun revenu détecté sur ce mois : ne conclus rien sur la marge disponible, dis seulement ce qui est sorti." } : {})
    };
  }


  /**
   * Les totaux depuis le premier jour, par catégorie.
   *
   * Aucun paramètre : c'est ce qui rend la question « depuis la création du compte » répondable.
   * Les crédits sont rendus à part des débits — « combien j'ai envoyé » et « combien j'ai reçu »
   * sont deux questions, qu'une différence unique rendrait toutes deux illisibles.
   */
  private async allTimeTotals() {
    const [currency, rows] = await Promise.all([
      this.baseCurrency(),
      this.client.rpc("finance_all_time_totals")
    ]);
    const lignes = this.unwrap(rows, "Totaux depuis le début");
    const dates = lignes.map((row) => row.first_at).filter(Boolean).sort();
    const fins = lignes.map((row) => row.last_at).filter(Boolean).sort();
    const ecartees = lignes.reduce((total, row) => total + Number(row.unconverted ?? 0), 0);
    return {
      currency,
      coveredFrom: dates[0] ? String(dates[0]).slice(0, 10) : null,
      coveredTo: fins.length ? String(fins[fins.length - 1]).slice(0, 10) : null,
      totalSpent: round2(lignes.reduce((total, row) => total + Number(row.spent), 0)),
      totalReceived: round2(lignes.reduce((total, row) => total + Number(row.received), 0)),
      transactions: lignes.reduce((total, row) => total + Number(row.transactions), 0),
      categories: lignes.map((row) => ({
        category: row.category, family: FAMILY_LABELS[familyOf(row.category)],
        spent: Number(row.spent), received: Number(row.received), transactions: Number(row.transactions)
      })),
      ...(ecartees > 0 ? { avertissement: `${ecartees} opérations n'ont pas de montant converti et sont exclues des sommes : dis que le total est incomplet de ce nombre.` } : {})
    };
  }

  private async baseCurrency() {
    const { data } = await this.client.rpc("finance_base_currency");
    return (data as string | null) ?? "EUR";
  }

  private unwrap<T>(result: { data: T | null; error: { message: string } | null }, label: string): T {
    if (result.error) throw new Error(`${label} : ${result.error.message}`);
    if (result.data === null) throw new Error(`${label} : aucune donnée renvoyée.`);
    return result.data;
  }

  private async spendingSummary(month: string) {
    const bounds = getUtcMonthBounds(month);
    const [currency, rows] = await Promise.all([this.baseCurrency(), this.client.rpc("finance_monthly_summary", { p_month: bounds.monthDate, p_currency: null, p_account_id: null, p_category: null })]);
    const row = this.unwrap(rows, "Résumé mensuel")?.[0];
    return { month, currency, totalSpent: Number(row?.total_spent ?? 0), previousMonthSpent: Number(row?.previous_month_spent ?? 0), changePercent: row?.change_percent === null || row?.change_percent === undefined ? null : Number(row.change_percent) };
  }

  private async spendingByCategory(from: string, to: string) {
    const [currency, rows] = await Promise.all([this.baseCurrency(), this.client.rpc("finance_spending_by_category", { p_from: `${from}T00:00:00Z`, p_to: `${to}T00:00:00Z`, p_currency: null, p_account_id: null, p_category: null })]);
    return { from, to, currency, categories: this.unwrap(rows, "Dépenses par catégorie").map((item) => ({ category: item.category, spent: Number(item.total_spent) })) };
  }

  private async topMerchants(month: string, limit: number) {
    const bounds = getUtcMonthBounds(month);
    const [currency, rows] = await Promise.all([this.baseCurrency(), this.client.rpc("finance_top_merchants", { p_month: bounds.monthDate, p_currency: null, p_account_id: null, p_category: null, p_limit: Math.min(Math.max(limit, 1), 20) })]);
    return { month, currency, merchants: this.unwrap(rows, "Top commerçants").map((item) => ({ merchant: redactCounterparty(item.merchant_name), spent: Number(item.total_spent) })) };
  }

  private async spendingBetween(from: string, to: string, category?: string) {
    const [currency, rows] = await Promise.all([this.baseCurrency(), this.client.rpc("finance_spending_between", { p_from: `${from}T00:00:00Z`, p_to: `${to}T00:00:00Z`, p_currency: null, p_category: category ?? null, p_account_id: null })]);
    return { from, to, category: category ?? null, currency, totalSpent: Number(this.unwrap(rows, "Dépenses sur la période")?.[0]?.total_spent ?? 0) };
  }

  private async recentTransactions(from: string, to: string, limit: number, category?: string) {
    const [currency, rows] = await Promise.all([this.baseCurrency(), this.client.rpc("finance_recent_transactions", { p_from: `${from}T00:00:00Z`, p_to: `${to}T00:00:00Z`, p_currency: null, p_account_id: null, p_category: category ?? null, p_limit: Math.min(Math.max(limit, 1), 50) })]);
    return {
      from, to, currency,
      transactions: this.unwrap(rows, "Transactions").map((item) => ({
        date: item.transaction_date.slice(0, 10),
        merchant: redactCounterparty(item.merchant_name),
        category: item.category,
        subcategory: item.subcategory,
        // Le montant converti, et non l'original : mélanger les devises dans une réponse
        // produirait des totaux faux.
        amount: item.amount_base === null ? Number(item.amount) : Number(item.amount_base)
      }))
    };
  }

  private async accounts() {
    const { data, error } = await this.client.from("accounts").select("name,currency,balance_current,balance_available,balance_updated_at").order("created_at");
    if (error) throw new Error(`Comptes : ${error.message}`);
    return { accounts: data.map((account) => ({ name: account.name, currency: account.currency, balance: account.balance_current === null ? null : Number(account.balance_current), available: account.balance_available === null ? null : Number(account.balance_available), updatedAt: account.balance_updated_at })) };
  }

  /** Une sortie de modèle n’est pas une autorisation d’écriture : confirmation dans Budgets. */
  private async setBudget(category: string, monthlyLimit: number) {
    const currency = await this.baseCurrency();
    if (["Income", "Transfers", "Uncategorized"].includes(category)) throw new Error("Choisissez une catégorie de dépense.");
    const proposal = { category, monthlyLimit, currency };
    this.emit?.({ type: "budget_proposal", proposal });
    return { ...proposal, saved: false, requiresConfirmation: true, instruction: "Proposition affichée au client. Aucun budget n’est enregistré tant qu’il ne confirme pas dans la page Budgets." };
  }

  private async budgetStatus(month: string) {
    const bounds = getUtcMonthBounds(month);
    const rows = this.unwrap(await this.client.rpc("finance_budget_status", { p_month: bounds.monthDate, p_currency: null }), "Budgets");
    return {
      month,
      budgets: rows.filter((item) => item.monthly_limit !== null).map((item) => ({ category: item.category, currency: item.currency, limit: Number(item.monthly_limit), spent: Number(item.spent), remaining: item.remaining === null ? null : Number(item.remaining), percentageUsed: item.percentage_used === null ? null : Number(item.percentage_used) }))
    };
  }
}

/** Deux décimales : ces montants sont lus par un modèle, et les flottants bruts l'égarent. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
