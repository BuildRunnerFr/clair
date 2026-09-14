import type { SqlDashboardSummary } from "@/types/analytics";
import type { Account } from "@/types/database";
import { importDemoData } from "@/app/dashboard/actions";
import { AppHeader } from "@/components/app-header";
import { budgetLevel } from "@/lib/analytics/month";
import type { BankConnection } from "@/types/banking";
import { syncTrueLayer } from "@/app/dashboard/banking-actions";
import { CurrencySelect } from "@/components/currency-select";
import { Select } from "@/components/select";
import { accountLabels } from "@/lib/accounts/label";
import { categoryLabel } from "@/lib/categories/labels";
import { SyncButton } from "@/components/sync-button";
import { moneyFormatter } from "@/lib/currency";
import { BalanceChart } from "@/components/balance-chart";
import { TrendChart } from "@/components/trend-chart";
import { TransactionList } from "@/components/transaction-list";
import { colorOf } from "@/lib/categories/families";
import { SubscriptionsCard } from "@/components/subscriptions-card";
import type { StoredSubscription } from "@/lib/subscriptions/detect";
import { AutoSubmit } from "@/components/auto-submit";
import { FilterCollapse } from "@/components/filter-collapse";
import { getTranslations, currentLocale } from "@/lib/i18n/server";
import { intlLocale, type Translate } from "@/lib/i18n/catalogue";
import { BudgetAlerts } from "@/components/budget-alerts";
import { budgetAlerts } from "@/lib/analytics/budget-alerts";
import { forecastCashflow } from "@/lib/analytics/cashflow";

export async function Dashboard({ summary, accounts, categories, currencies, subscriptions, incomes, filters, email, connections, bankNotice, bankError, demoNotice, firstName }: {
  summary: SqlDashboardSummary;
  accounts: Account[];
  categories: string[];
  currencies: string[];
  subscriptions: StoredSubscription[];
  /** Les encaissements réguliers : le salaire, sans lequel la prévision ne décrirait qu'une chute. */
  incomes: StoredSubscription[];
  filters: { month: string; currency: string | null; accountId?: string; category?: string };
  email: string;
  connections: BankConnection[];
  bankNotice?: string;
  bankError?: string;
  /** Annonce que les chiffres affichés sont un exemple, le temps de la visite guidée. */
  demoNotice?: boolean;
  /** Le prénom, quand il est connu : saluer quelqu'un par son nom coûte un mot et se remarque. */
  firstName?: string | null;
}) {
  const t = await getTranslations();
  const locale = await currentLocale();
  const { money, range, headline } = moneyFormatter(intlLocale(locale));
  // La liste des comptes suit la devise choisie ; les libellés se calculent sur cette liste, de
  // sorte qu'un doublon caché par le filtre n'aille pas ajouter un suffixe inutile aux autres.
  const visibleAccounts = accounts.filter((item) => filters.currency === null || item.currency === filters.currency);
  const etiquettes = accountLabels(visibleAccounts);
  const maxCategory = summary.byCategory[0]?.amount || 1;
  const alerts = budgetAlerts(summary.budgetStatus);
  const typical = summary.typicalMonth;
  const now = new Date();
  const isCurrentMonth = filters.month === `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  // Les soldes restent dans la devise du compte : contrairement aux dépenses, ils ne sont
  // pas convertis. Sans filtre explicite on retombe donc sur la devise principale.
  const balanceCurrency = filters.currency ?? summary.baseCurrency;
  const currencyAccounts = accounts.filter((item) => item.currency === balanceCurrency);
  const knownBalances = currencyAccounts.filter((item) => item.balanceCurrent !== null);
  const totalBalance = knownBalances.reduce((total, item) => total + (item.balanceCurrent ?? 0), 0);
  const lastBalanceUpdate = knownBalances.map((item) => item.balanceUpdatedAt).filter((value): value is string => value !== null).sort().at(-1);
  // La prévision n'a de sens que sur le mois en cours, et seulement si les soldes et les
  // dépenses sont exprimés dans la même devise : les premiers ne sont pas convertis, les
  // secondes le sont, et les mêler ferait une courbe qui n'est dans aucune unité.
  const forecast = isCurrentMonth && knownBalances.length && balanceCurrency === summary.baseCurrency
    ? forecastCashflow({ startBalance: totalBalance, today: now, subscriptions, incomes, daily: summary.dailyDiscretionary, currency: balanceCurrency })
    : null;
  const net = summary.income - summary.outflow;
  const banks = connections.filter((connection) => connection.provider === "truelayer");
  const needsBankAttention = !banks.length || Boolean(bankNotice) || Boolean(bankError)
    || banks.some((bank) => bank.status !== "active");
  const dayMonth = (value: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(value));
  /**
   * L'aperçu s'arrête aux deux journées les plus récentes.
   *
   * Huit opérations groupées par jour descendaient sur cinq ou six journées, et la section
   * dépassait de plusieurs centaines de pixels toutes ses voisines — une colonne qui continue
   * seule bien après que les autres se sont arrêtées. Ce n'est pas un aperçu, c'est un début de
   * liste, et la liste complète est à un lien d'ici.
   *
   * La journée la plus récente, et elle seule : « aujourd'hui » au sens strict ne montrerait
   * rien après un week-end sans dépense, alors que la dernière journée où il s'est passé quelque
   * chose est toujours celle qu'on veut voir.
   */
  const previewDays = [...new Set(summary.latest.map((item) => item.transactionDate.slice(0, 10)))].slice(0, 1);
  const latestPreview = summary.latest.filter((item) => previewDays.includes(item.transactionDate.slice(0, 10)));
  return <main className="shell">
    <AppHeader email={email} firstName={firstName} current="/dashboard" />
    {/* Le salut passe au second plan. Une page qui ouvre sur « Bonjour » ouvre sur une politesse ;
        celle-ci doit ouvrir sur un chiffre — c'est la question qu'on vient poser. Le titre reste
        un titre pour qui navigue au clavier ou à la voix, il cesse simplement d'être l'élément le
        plus voyant de l'écran. */}
    <h1 className="page-greeting">{firstName ? t("dashboard.greetingNamed", { name: firstName }) : t("dashboard.greeting")}</h1>
    {demoNotice && <p className="demo-banner" role="status">{t("demo.banner")}</p>}
    {/* Le bandeau bancaire ne s'impose que lorsqu'il a quelque chose à dire : aucune banque, une
        reconnexion à faire, une erreur. Tout allant bien, il descend en bas de page — un panneau
        d'exploitation n'a pas à occuper le premier tiers d'un écran de données. */}
    {needsBankAttention && <BankingPanel connections={connections} notice={bankNotice} error={bankError}/>}
    <BudgetAlerts alerts={alerts} currency={summary.baseCurrency} month={filters.month} />
    {/* L'encart qui demandait à l'utilisateur de catégoriser ses propres dépenses a été retiré,
        puis la page qui le prolongeait. C'est le travail de l'application, pas le sien : le lui
        déléguer revenait à avouer qu'elle ne sait pas le faire. La catégorisation tourne pendant
        la synchronisation, une seconde passe rattrape ce qui reste, et une tâche quotidienne vide
        la file. Ce qui échappe aux trois s'affiche « Non catégorisé » — une catégorie honnête
        vaut mieux qu'une corvée. La correction se fait là où l'erreur se constate : en dépliant
        l'opération dans la liste des transactions. */}
    <form className="filters" method="get">
      {/* Le résumé dit ce que les champs repliés contiennent : replier une barre sans annoncer
          son état revient à cacher un filtre actif, et à laisser quelqu'un chercher pourquoi ses
          chiffres ne sont pas ceux qu'il attend. */}
      <FilterCollapse activeCount={[filters.category, filters.accountId, filters.currency].filter(Boolean).length} summary={[
        new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(`${filters.month}-01T12:00:00Z`)),
        filters.category,
        filters.accountId ? accounts.find((item) => item.id === filters.accountId)?.name : undefined,
        filters.currency ?? undefined
      ].filter(Boolean).join(" · ")} />
      {/* L'intitulé est visible et non seulement annoncé : quatre listes côte à côte se
          distinguaient par leur seule valeur courante, ce qui ne dit rien de ce qu'elles
          filtrent — et rien du tout quand la valeur est vide. */}
      <label className="field"><span>{t("common.month")}</span>
        <input name="month" type="month" defaultValue={filters.month} /></label>
      <Select name="category" label={t("common.category")} value={filters.category ?? ""}
        options={[{ value: "", label: t("transactions.allCategories") }, ...categories.map((name) => ({ value: name, label: categoryLabel(name, intlLocale(locale)) }))]} />
      {/* Le libellé porte la devise : une banque qui ouvre un portefeuille par devise produit
          sinon plusieurs lignes au même nom, impossibles à départager. */}
      <Select name="account" label={t("dashboard.account")} value={filters.accountId ?? ""}
        options={[{ value: "", label: t("dashboard.allAccounts") },
          ...visibleAccounts.map((item) => ({ value: item.id, label: etiquettes.get(item.id) ?? item.name }))]} />
      <CurrencySelect currencies={currencies} value={filters.currency} label={t("dashboard.originCurrency")} allLabel={t("dashboard.allCurrencies")} />
      <button className="filter-button">{t("dashboard.apply")}</button>

      <AutoSubmit />
    </form>
    <div className="grid">
      <article className="card full" data-tour="balances">
        <div className="card-heading"><div className="label">{t("dashboard.balances")}</div>{lastBalanceUpdate && <span className="balance-secondary">{t("dashboard.balancesUpdated", { date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(lastBalanceUpdate)) })}</span>}</div>
        <div className="balance-total"><span className="balance-secondary">{t("dashboard.totalIn", { currency: balanceCurrency })}{knownBalances.length ? ` · ${t(knownBalances.length > 1 ? "dashboard.accountCountMany" : "dashboard.accountCountOne", { count: knownBalances.length })}` : ""}</span><strong>{knownBalances.length ? money(totalBalance, balanceCurrency) : "—"}</strong></div>
        {currencyAccounts.length ? currencyAccounts.map((item) => <div className="balance-row" key={item.id}>
          <span className="balance-name">{item.name}</span>
          <span className="balance-secondary">{item.balanceOverdraft ? t("dashboard.overdraft", { amount: money(item.balanceOverdraft, item.currency) }) : ""}</span>
          <span className="balance-secondary">{item.balanceAvailable !== null && item.balanceAvailable !== item.balanceCurrent ? t("dashboard.available", { amount: money(item.balanceAvailable, item.currency) }) : ""}</span>
          <strong>{item.balanceCurrent === null ? "—" : money(item.balanceCurrent, item.currency)}</strong>
        </div>) : <p className="empty">{t("dashboard.noAccountIn", { currency: balanceCurrency })}</p>}
        {currencyAccounts.length > 0 && !knownBalances.length && <p className="empty">{t("dashboard.noBalanceYet")}</p>}
        {knownBalances.length > 0 && <BalanceChart points={summary.balanceHistory} currency={balanceCurrency} forecast={forecast?.points ?? []} />}
      </article>
      {/* Le montant en attente est dit, et non seulement exclu. Une transaction en attente peut
          changer de montant ou ne jamais aboutir : la retirer du total est juste. Mais la retirer
          en silence donne un total que l'utilisateur ne retrouve pas en additionnant sa liste —
          constaté à 4 € près — et un écart inexpliqué sur de l'argent fait douter du reste. */}
      <article className="card metric" data-tour="metrics">
        <div className="label">{t("dashboard.spentThisMonth")}</div>
        <div className="value">{headline(summary.totalSpent, summary.baseCurrency)}</div>
        <div className="trend">{summary.pendingSpent > 0
          ? t("dashboard.excludingIncomeAndPending", { amount: money(summary.pendingSpent, summary.baseCurrency) })
          : t("dashboard.excludingIncome")}</div>
      </article>
      <article className="card metric" data-tour="metrics"><div className="label">{t("dashboard.budgetLeft")}</div><div className="value">{summary.configuredBudget ? headline(summary.budgetRemaining, summary.baseCurrency) : "—"}</div><div className="trend positive">{t("dashboard.onConfiguredCategories")}</div></article>
      {/* Comparaison au mois type plutôt qu'au seul mois précédent : un août calme après un
          juillet de vacances donne −30 % qui ne dit rien de personne. L'étendue accompagne
          l'écart parce qu'elle en fixe la lecture — mesurée ici, la dépense à date égale varie
          de 19 à 72 % d'un mois à l'autre, si bien qu'un écart de 20 % est un mois ordinaire.
          Le pourcentage est donc qualifié : au 3 septembre, −78 % tombait dans une étendue
          allant de 0 à 343 €, et n'était pas une nouvelle. */}
      <article className="card metric" data-tour="metrics">
        <div className="label">{t("dashboard.vsTypicalMonth")}</div>
        <div className="value">{typical === null ? "—" : `${typical.changePercent! > 0 ? "+" : ""}${typical.changePercent} %`}</div>
        <div className="trend">{typical === null
          ? t("dashboard.noMonthToCompare")
          : t("dashboard.typicalRange", {
              position: t({ ordinaire: "dashboard.ordinary", "au-dessus": "dashboard.aboveAll", "en-dessous": "dashboard.belowAll" }[typical.position]),
              range: range(typical.lowest, typical.highest, summary.baseCurrency),
              sameDate: isCurrentMonth ? t("dashboard.atSameDate") : ""
            })}</div>
      </article>
      {/* Les engagements à venir, eux, sont exacts : montant du dernier prélèvement, à la date
          où il tombe habituellement. C'est la partie de la prévision qui ne s'estime pas, et
          elle est affichée séparément pour cette raison. */}
      <article className="card side dashboard-upcoming" data-tour="upcoming">
        <div className="label">{t("dashboard.upcoming")}</div>
        {forecast && forecast.upcoming.length ? <>
          <div className="balance-total"><span className="balance-secondary">{t("dashboard.availableAfterCharges")}</span><strong>{money(forecast.available, balanceCurrency)}</strong></div>
          <ul className="upcoming-list">
            {forecast.upcoming.map((flow) => <li className="upcoming-row" key={`${flow.date}-${flow.merchantName}-${flow.kind}`}>
              <span className="balance-secondary">{dayMonth(flow.date)}</span>
              <span className="upcoming-name">{title(flow.merchantName)}</span>
              <strong className={flow.kind === "credit" ? "flow-in" : undefined}>{flow.kind === "credit" ? "+" : "−"}{money(flow.amount, balanceCurrency)}</strong>
            </li>)}
          </ul>
        </> : <p className="empty">{t(forecast ? "dashboard.noUpcoming" : "dashboard.upcomingCurrentMonthOnly")}</p>}
      </article>
      <article className="card wide dashboard-recurring" data-tour="subscriptions"><div className="label">{t("dashboard.subscriptions")}</div><SubscriptionsCard subscriptions={subscriptions} baseCurrency={summary.baseCurrency} />
      </article>
      <article className="card wide">
        <div className="card-heading"><div className="label">{t("dashboard.lastSixMonths")}</div></div>
        <TrendChart points={summary.monthlyTrend} currency={summary.baseCurrency} currentMonth={filters.month} />
      </article>
      {/* Ce qui entre, ce qui sort, ce qui reste. Une dépense ne se juge pas seule : mille euros
          est un mois économe ou un mois ruineux selon ce qui est entré, et le salaire était en
          base depuis le début — simplement écarté par le « montant négatif » de tous les
          agrégats. Les virements entre comptes propres sont retirés des deux côtés, sans quoi
          l'argent mis de côté passerait pour dépensé. */}
      <article className="card side" data-tour="flows">
        <div className="label">{t("dashboard.flows")}</div>
        {summary.income > 0 || summary.outflow > 0 ? <>
          <div className="flow-figures">
            <div className="flow-figure"><span className="balance-secondary">{t("dashboard.income")}</span><strong className="flow-in">{money(summary.income, summary.baseCurrency)}</strong></div>
            <div className="flow-figure"><span className="balance-secondary">{t("dashboard.outflow")}</span><strong>{money(summary.outflow, summary.baseCurrency)}</strong></div>
            {/* Sans revenu connu, la différence n'est que la dépense changée de signe : elle
                n'apprend rien, et « pris sur l'épargne » affirme en rouge quelque chose qu'on
                ignore — un compte peut n'avoir simplement pas encore reçu son premier virement. */}
            {summary.income > 0 && <div className="flow-figure flow-net"><span className="balance-secondary">{t(net >= 0 ? "dashboard.saved" : "dashboard.dippedInto")}</span><strong className={net >= 0 ? "flow-in" : "flow-out"}>{money(Math.abs(net), summary.baseCurrency)}</strong></div>}
          </div>
          {/* La part dépensée de ce qui est entré : c'est le rapport, et non les deux montants
              pris séparément, qui dit si le mois tient. */}
          {summary.income > 0 && <div className={summary.outflow > summary.income ? "flow-bar flow-bar-over" : "flow-bar"} role="img" aria-label={t("dashboard.flowShare", { percent: Math.round(summary.outflow / summary.income * 100) })}>
            <span style={{ width: `${Math.min(100, summary.outflow / summary.income * 100)}%` }} />
          </div>}
          <p className="chart-caption">
            {summary.income === 0 && `${t("dashboard.noIncomeYet")} `}
            {summary.income > 0 && `${net >= 0
              ? t("dashboard.flowShare", { percent: Math.round(summary.outflow / summary.income * 100) })
              : t("dashboard.flowOver", { amount: money(-net, summary.baseCurrency) })} `}
            {summary.transfersExcluded > 0
              ? t("dashboard.flowsTransfers", { amount: money(summary.transfersExcluded, summary.baseCurrency) })
              : t("dashboard.flowsNote")}
          </p>
        </> : <p className="empty">{t("dashboard.noFlows")}</p>}
      </article>
      <article className="card wide" data-tour="categories"><div className="label">{t("dashboard.byCategory")}</div>{summary.byCategory.length ? summary.byCategory.map((item) => <div className="bar-row" key={item.name}><span>{item.name}</span><div className="bar"><span style={{ width: `${item.amount / maxCategory * 100}%`, background: colorOf(item.name) }} /></div><strong>{money(item.amount, summary.baseCurrency)}</strong></div>) : (filters.category || filters.accountId || filters.currency
        /* Proposer de retirer des filtres qu'on n'a pas posés laisse chercher ce qui masquerait
           des dépenses qui n'existent simplement pas. */
        ? <p className="empty">{t("dashboard.noSpendingForFilters")} <a href={`/dashboard?month=${filters.month}`}>{t("dashboard.clearFilters")}</a></p>
        : <p className="empty">{t("dashboard.noSpendingThisMonth")}</p>)}</article>
      <article className="card side"><div className="label">{t("dashboard.topMerchants")}</div>{summary.topMerchants.length ? summary.topMerchants.map((item, index) => <div className="top-merchant" key={item.name}><span>{index + 1}. {title(item.name)}</span><strong>{money(item.amount, summary.baseCurrency)}</strong></div>) : <p className="empty">{t("dashboard.noMerchant", { month: new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(`${filters.month}-01`)) })}</p>}</article>
      <article className="card wide" data-tour="budgets"><div className="card-heading"><div className="label">{t("dashboard.budgets")}</div><a href={`/budgets?month=${filters.month}&currency=${summary.baseCurrency}`}>{t("dashboard.manage")}</a></div>{summary.budgetStatus.filter((item) => item.monthlyLimit !== null).length ? summary.budgetStatus.filter((item) => item.monthlyLimit !== null).slice(0, 5).map((item) => <div className={`budget-summary budget-${budgetLevel(item.percentageUsed)}`} key={item.category}><span>{item.category}</span><div><strong>{item.percentageUsed?.toFixed(0)} %</strong><small>{t("dashboard.budgetRemaining", { amount: money(item.remaining ?? 0, summary.baseCurrency) })}</small></div></div>) : <p className="empty">{t("dashboard.noBudget")} <a href="/budgets">{t("dashboard.setBudgets")}</a></p>}</article>
      <article className="card side latest-preview">
        <div className="card-heading"><div className="label">{t("dashboard.latestTransactions")}</div><a href="/transactions">{t("dashboard.seeAll")}</a></div>
        <TransactionList transactions={latestPreview} baseCurrency={summary.baseCurrency} />
      </article>
    </div>
    {!needsBankAttention && <BankingPanel connections={connections} notice={bankNotice} error={bankError}/>}
  </main>;
}

export async function EmptyDashboard({ email, firstName, connections, bankNotice, bankError, demoAvailable }: {
  email: string; firstName?: string | null; connections: BankConnection[]; bankNotice?: string; bankError?: string; demoAvailable: boolean }) {
  const t = await getTranslations();
  return <main className="shell">
    <AppHeader email={email} firstName={firstName} current="/dashboard" />
    <BankingPanel connections={connections} notice={bankNotice} error={bankError}/>
    <div className="empty-card centered-card">
      <span className="empty-icon">↙</span>
      <h1>{t("dashboard.emptyTitle")}</h1>
      <p>{t("dashboard.emptyBody")}</p>
      {/* L'import de démonstration n'est proposé que là où il est réellement activé : en
          production la variable est à false, et le bouton menait à une erreur. */}
      {demoAvailable && <form action={importDemoData}><button className="primary">{t("dashboard.importDemo")}</button></form>}
      <p className="privacy-note">Tout est rattaché au seul compte {email}.</p>
    </div>
  </main>;
}

/**
 * Les connexions bancaires, toutes.
 *
 * La version précédente n'en retenait qu'une (`connections.find`). Tant qu'il n'y en avait
 * qu'une, cela se voyait à peine ; dès la seconde, la banque ajoutée devenait invisible et,
 * faute de bouton, ne pouvait plus jamais être resynchronisée — alors que ses transactions
 * comptaient déjà dans tous les totaux.
 *
 * Chaque connexion porte donc sa propre synchronisation, et le bouton d'ajout reste offert
 * quel qu'en soit le nombre.
 */
async function BankingPanel({ connections, notice, error }: { connections: BankConnection[]; notice?: string; error?: string }) {
  const t = await getTranslations();
  const banks = connections.filter((connection) => connection.provider === "truelayer");
  // Les codes viennent des routes ; leur traduction est cherchée par convention de nom.

  return <section className="banking-card" data-tour="bank">
    <div className="banking-head">
      {/* Seul « Sandbox » s'affiche : il avertit qu'on regarde des données de test. « Live »
          était un terme d'ingénieur qui n'apprenait rien à l'utilisateur — c'est l'état normal. */}
      <div>{banks[0]?.environment === "sandbox" && <span className="sandbox-badge">Sandbox</span>}<h2>{t("bank.connections")}</h2></div>
      <form action="/api/banking/truelayer/connect" method="post">
        <button className={banks.length ? "panel-button" : "primary"}>
          <span className="nav-long">{banks.length ? t("bank.add") : t("bank.connect")}</span>
          <span className="nav-short">{banks.length ? t("bank.addShort") : t("bank.connectShort")}</span>
        </button>
      </form>
    </div>
    {notice && <small className="form-success">{notice}</small>}
    {error && <small className="bank-error">{t(`bank.error.${error}`)}</small>}
    {banks.length
      ? <ul className="bank-list">{banks.map((bank) => <BankRow bank={bank} key={bank.id} />)}</ul>
      : <p>{t("bank.connectFirst")}</p>}
  </section>;
}

async function BankRow({ bank }: { bank: BankConnection }) {
  const t = await getTranslations();
  const locale = await currentLocale();
  // Tant que le consentement n'est pas renouvelé, proposer une synchronisation reviendrait à
  // offrir un bouton dont on sait qu'il échouera.
  const needsReauthorization = bank.status === "reauthorization_required";
  return <li className="bank-row">
    <div className="bank-identity">
      {/* Le nom manque aux connexions établies avant qu'il ne soit capté ; la première
          synchronisation le comble, d'où un repli neutre plutôt qu'un vide. */}
      <strong>{bank.displayName ?? t("bank.connected")}</strong>
      {/* Le mot « active » n'apprend rien : c'est l'état normal, et un état qui ne l'est pas se
          dit ailleurs, en rouge. Il n'est donc écrit que lorsqu'il mérite d'être lu. La date
          perd son année, qui est celle qu'on croit — cette ligne s'enroulait sur trois lignes
          sur un téléphone, pour dire qu'une banque va bien. */}
      <small>{bank.status !== "active" ? `${statusLabel(bank.status, t)} · ` : ""}{t(bank.accountCount > 1 ? "bank.accountCountMany" : "bank.accountCountOne", { count: bank.accountCount })}{bank.lastSyncedAt ? t("bank.syncedOn", { date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(bank.lastSyncedAt)) }) : t("bank.neverSynced")}</small>
      {needsReauthorization && <small className="bank-error">{t("bank.consentExpired")}</small>}
      {!needsReauthorization && bank.lastError && <small className="bank-error">{bank.lastError}</small>}
    </div>
    <div className="bank-row-actions">
      {needsReauthorization
        ? <form action="/api/banking/truelayer/connect" method="post"><button className="primary bank-reconnect">{t("bank.reconnect")}</button></form>
        : <form action={syncTrueLayer}><input type="hidden" name="connection_id" value={bank.id}/><SyncButton/></form>}
    </div>
  </li>;
}

/** Les états viennent de la base ; leur libellé est cherché par convention de nom. */
function statusLabel(status: BankConnection["status"], t: Translate) { return t(`bank.status.${status}`); }

function title(value: string) { return value.toLowerCase().replace(/(^|\s)\p{L}/gu, (letter) => letter.toUpperCase()); }
