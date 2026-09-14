import type { Translate } from "@/lib/i18n/catalogue";
import { monotone } from "@/lib/charts/curve";
import { moneyFormatter } from "@/lib/currency";

/**
 * Les neuf banques couvertes, en bandeau défilant.
 *
 * Les noms sont écrits, les logos ont été retirés — et la raison mérite d'être consignée pour
 * qu'on ne les remette pas.
 *
 * Le lendemain de leur ajout, Google Safe Browsing a classé le site comme hameçonnage. La
 * combinaison est exactement celle qu'un classificateur cherche : un domaine enregistré la
 * veille, un formulaire demandant une adresse et un mot de passe, et neuf logos de banques
 * françaises affichés à côté. Aucun de ces éléments n'est suspect isolément ; ensemble ils
 * forment la signature d'un site qui se fait passer pour une banque.
 *
 * Les noms écrits portent la même information — quelles banques sont couvertes — sans emprunter
 * l'identité visuelle de personne. On pourra revenir aux logos quand le domaine aura de
 * l'ancienneté et une identité d'éditeur publiée, pas avant.
 */
export const BANKS = [
  { id: "stet-bnp-paribas-ma-banque", name: "BNP Paribas" },
  { id: "stet-credit-agricole", name: "Crédit Agricole" },
  { id: "stet-societe-generale", name: "Société Générale" },
  { id: "stet-credit-mutuel", name: "Crédit Mutuel" },
  { id: "stet-caisse-d-epargne", name: "Caisse d’Épargne" },
  { id: "stet-banque-populaire", name: "Banque Populaire" },
  { id: "stet-bnp-paribas-hello-bank", name: "Hello bank!" },
  { id: "ob-revolut-fr", name: "Revolut" },
  { id: "ob-transferwise-fr", name: "Wise" }
] as const;

export function BankMarquee({ t }: { t: Translate }) {
  return <section className="landing-section landing-banks" id="banques">
    <h2>{t("home.banks.title")}</h2>
    <p className="landing-section-lead">{t("home.banks.subtitle")}</p>
    <div className="marquee" aria-label={t("home.banks.title")}>
      <ul className="marquee-track">
        {BANKS.map((bank) => <li key={bank.id}>{bank.name}</li>)}
      </ul>
      <ul className="marquee-track" aria-hidden="true">
        {BANKS.map((bank) => <li key={`copie-${bank.id}`}>{bank.name}</li>)}
      </ul>
    </div>
    {/* Une absence transformée en signal : c'est la seule façon de savoir quelle banque ajouter
        en premier, et ça vaut mieux qu'un visiteur qui repart sans rien dire. */}
    <a className="landing-banks-missing" href={`mailto:contact@clairfinances.com?subject=${encodeURIComponent("Ma banque n\u2019est pas dans la liste")}`}>
      {t("home.banks.missing")}
    </a>
    <p className="landing-note landing-banks-note">{t("home.banks.note")}</p>
  </section>;
}

/**
 * Un aperçu du premier écran, construit avec les formes réelles de l'application.
 *
 * Une capture d'écran aurait été plus simple et moins honnête : elle aurait montré les comptes
 * de quelqu'un. Des chiffres d'illustration, dits comme tels, montrent la même chose sans
 * prétendre à ce qu'ils ne sont pas — d'où la mention « Exemple », visible et non en note de bas
 * de page — la mention sous le cadre y suffit. Une pastille « Exemple » posée à côté du titre
 * était une étiquette de documentation, pas de site : personne ne présente son produit ainsi.
 *
 * Les valeurs sont volontairement rondes et plausibles : des montants au centime donneraient
 * l'impression d'un vrai relevé, ce qu'ils ne sont pas.
 */
/* Les libellés et les montants suivent la langue de la page. Un visiteur anglophone voyait
   « Logement · 1 513 € » dans la démonstration : l'aperçu censé montrer le produit donnait à
   croire qu'il ne parle pas sa langue. */
const CATEGORIES = [
  { key: "essentiels", label: "c1", share: 100, amount: 612 },
  { key: "quotidien", label: "c2", share: 64, amount: 391 },
  { key: "plaisirs", label: "c3", share: 41, amount: 248 },
  { key: "argent", label: "c4", share: 28, amount: 170 },
  { key: "sante", label: "c5", share: 15, amount: 92 }
] as const;

/* Les six mois se nomment par Intl plutôt qu'à la main : « avr. mai juin » sur une page
   anglaise trahissait la même chose que les catégories. Le mois courant est le sixième, et les
   cinq autres se comptent à rebours à partir de lui. */
const HEIGHTS = [58, 71, 46, 88, 63, 74];

function months(locale: string) {
  const format = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  const now = new Date();
  return HEIGHTS.map((height, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (HEIGHTS.length - 1 - index), 1));
    return { label: format.format(date), height, current: index === HEIGHTS.length - 1 };
  });
}

/**
 * Le solde du mois, tel que l'application le dessine.
 *
 * Les valeurs sont d'illustration mais la forme ne l'est pas : même lissage, même dégradé, même
 * point terminal que le graphique du tableau de bord, parce qu'une vitrine qui montre autre
 * chose que le produit ment sur le produit. La courbe descend, remonte au salaire, redescend :
 * c'est la forme qu'a un mois.
 */
const BALANCE = [2480, 2395, 2360, 2210, 2165, 2090, 1940, 1880, 1760, 1690, 1540, 3120, 3040, 2870, 2760, 2610, 2480, 2390, 2245, 2145];
const CURVE = { width: 640, height: 118, top: 10, bottom: 12 };

function balanceGeometry() {
  const min = Math.min(...BALANCE), max = Math.max(...BALANCE);
  const plot = CURVE.height - CURVE.top - CURVE.bottom;
  const points = BALANCE.map((value, index) => ({
    x: (index / (BALANCE.length - 1)) * CURVE.width,
    y: CURVE.top + plot - ((value - min) / (max - min)) * plot
  }));
  const line = monotone(points);
  const last = points[points.length - 1]!;
  return { line, last, area: `${line} L${CURVE.width},${CURVE.height} L0,${CURVE.height} Z` };
}

export function DashboardPreview({ t, locale }: { t: Translate; locale: string }) {
  const { line, area, last } = balanceGeometry();
  const { money } = moneyFormatter(locale);
  const euro = (value: number) => money(value, "EUR");

  // Une figure et non une section : l'aperçu illustre désormais la colonne de texte à sa
  // gauche, dont il partage le titre. Un second <h2> ici couperait la section en deux dans le
  // plan du document, et ferait annoncer deux fois la même chose à un lecteur d'écran.
  return <figure className="landing-preview">
    <figcaption className="landing-preview-caption">{t("home.preview.title")}</figcaption>

    <div className="preview-frame">
      <div className="preview-metrics">
        <div className="preview-metric">
          <span className="preview-label">{t("home.preview.spent")}</span>
          <strong>{euro(1513)}</strong>
          <span className="preview-sub">{t("home.preview.excluding")}</span>
        </div>
        <div className="preview-metric">
          <span className="preview-label">{t("home.preview.budget")}</span>
          <strong>{euro(287)}</strong>
          <span className="preview-sub">{t("home.preview.onCategories")}</span>
        </div>
        <div className="preview-metric">
          <span className="preview-label">{t("home.preview.vsTypical")}</span>
          <strong>−12 %</strong>
          <span className="preview-sub">{t("home.preview.ordinary")}</span>
        </div>
      </div>

      <div className="preview-card preview-balance">
        <div className="preview-balance-head">
          <span className="preview-label">{t("home.preview.balance")}</span>
          <strong>{euro(2145)}</strong>
        </div>
        <svg viewBox={`0 0 ${CURVE.width} ${CURVE.height}`} className="preview-curve" role="presentation">
          <defs>
            <linearGradient id="preview-fill" x1="0" y1="0" x2="0" y2="1">
              <stop className="chart-fill-top" offset="0%" />
              <stop className="chart-fill-bottom" offset="100%" />
            </linearGradient>
          </defs>
          <path className="chart-area" d={area} fill="url(#preview-fill)" />
          <path className="chart-line" d={line} />
          <circle className="chart-endpoint-halo" cx={last.x} cy={last.y} r={7} />
          <circle className="chart-endpoint" cx={last.x} cy={last.y} r={3.5} />
        </svg>
      </div>

      <div className="preview-charts">
        <div className="preview-card">
          <span className="preview-label">{t("home.preview.byCategory")}</span>
          <ul className="preview-bars">
            {CATEGORIES.map((category) => <li key={category.key}>
              {/* Le nom est écrit à côté de la couleur : la teinte renforce l'identité, elle ne
                  la porte jamais seule. */}
              <span className="preview-bar-name">{t(`home.preview.${category.label}`)}</span>
              <span className="preview-bar"><i style={{ width: `${category.share}%`, background: `var(--family-${category.key})` }} /></span>
              <span className="preview-bar-value">{euro(category.amount)}</span>
            </li>)}
          </ul>
        </div>

        <div className="preview-card">
          <span className="preview-label">{t("home.preview.sixMonths")}</span>
          <div className="preview-months">
            {months(locale).map((month) => <div className={month.current ? "preview-month preview-month-current" : "preview-month"} key={month.label}>
              <span className="preview-column"><i style={{ height: `${month.height}%` }} /></span>
              <span className="preview-month-label">{month.label}</span>
            </div>)}
          </div>
        </div>
      </div>
    </div>

    <p className="landing-note">{t("home.preview.note")}</p>
  </figure>;
}
