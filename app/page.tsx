import { publicMetadata } from "@/lib/site";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentLocale, getTranslations } from "@/lib/i18n/server";
import { intlLocale } from "@/lib/i18n/catalogue";
import { BankMarquee, DashboardPreview } from "@/components/landing-preview";
import { ICONS, type IconName } from "@/components/landing-icons";
import { LandingNav } from "@/components/landing-nav";
import { GUIDES } from "@/components/guide";

export const metadata = publicMetadata("/", "Clair — Comprendre ses dépenses", "Clair relie vos comptes bancaires, classe vos dépenses tout seul, et répond à vos questions.");

/**
 * Page d'accueil publique.
 *
 * La suite des sections répond aux questions dans l'ordre où on se les pose : de quoi s'agit-il,
 * à quoi ça ressemble, en quoi c'est différent de mon application bancaire, qu'est-ce que ça
 * sait faire, est-ce sûr, comment on commence, combien ça coûte.
 *
 * Deux choses qu'on ne trouvera pas ici, et c'est délibéré. Pas de compteur d'utilisateurs ni de
 * témoignage : Clair en a un, et fabriquer les autres serait exactement le genre de mensonge
 * qu'un service qui lit des comptes bancaires ne peut pas se permettre. Pas de logo de presse
 * non plus. Ce qui remplace la preuve sociale, faute d'en avoir, est la preuve vérifiable : le
 * régime d'accès, le lieu d'hébergement, le prix, et ce que le produit affiche réellement.
 */
const GROUPS: Array<{ key: string; icon: IconName; features: string[] }> = [
  { key: "g1", icon: "layers", features: ["f7", "f4", "f6"] },
  { key: "g2", icon: "calendar", features: ["f1", "f2", "f3"] },
  { key: "g3", icon: "chat", features: ["f5"] }
];

const SECURITY: Array<{ key: string; icon: IconName }> = [
  { key: "s1", icon: "bank" }, { key: "s2", icon: "eye" },
  { key: "s3", icon: "lock" }, { key: "s4", icon: "shield" }
];

/* Le relevé brut, tel qu'une application bancaire le donne. Les enseignes sont écrites parce
   qu'un libellé anonymisé ne ressemblerait à rien de ce qu'on voit sur son propre compte. */
const RAW_LINES = [
  { label: "CARREFOUR MARKET 4412", amount: "−47,50 €" },
  { label: "SARL LE PETIT COIN", amount: "−28,00 €" },
  { label: "CB MONOPRIX 0938", amount: "−31,20 €" },
  { label: "PAIEMENT CB 12/09", amount: "−19,90 €" }
];

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect("/dashboard");

  const t = await getTranslations();
  // L'aperçu formate ses montants et nomme ses mois : il lui faut l'étiquette Intl, pas la langue.
  const locale = intlLocale(await currentLocale());

  return <div className="landing">
    <header className="landing-bar">
      <div className="landing-bar-inner">
        <span className="brand">clair.</span>
        <LandingNav items={[
          { href: "#fonctionnalites", label: t("home.nav.features") },
          { href: "#securite", label: t("home.nav.security") },
          { href: "#banques", label: t("home.nav.banks") },
          { href: "#prix", label: t("home.nav.price") }
        ]} />
        <div className="landing-bar-actions">
          <a className="landing-signin" href="/login">{t("home.nav.signIn")}</a>
          <a className="landing-cta landing-cta-small" href="/login">{t("home.nav.start")}</a>
        </div>
      </div>
    </header>

    <main>
      {/* Le produit est dans le premier écran, à côté de la promesse. Il y était trois sections
          plus bas : le visiteur devait lire pour savoir de quoi on parlait. */}
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow">{t("home.hero.eyebrow")}</p>
          <h1>{t("home.hero.title")}</h1>
          <p className="landing-lead">{t("home.hero.subtitle")}</p>
          <div className="landing-hero-actions">
            <a className="landing-cta" href="/login">{t("home.hero.cta")}</a>
            <a className="landing-cta-ghost" href="#fonctionnement">{t("home.hero.ctaSecondary")}</a>
          </div>
          <p className="landing-note">{t("home.hero.note")}</p>
        </div>
        <DashboardPreview t={t} locale={locale} />
        <ul className="landing-trust">
          {["banks", "readonly", "hosting"].map((key) => <li key={key}>{t(`home.trust.${key}`)}</li>)}
        </ul>
      </section>

      {/* L'opposition qui porte le positionnement. Une liste de fonctionnalités ne répond pas à
          « pourquoi pas l'application de ma banque » ; deux colonnes côte à côte, si. */}
      <section className="landing-section landing-why">
        <h2>{t("home.why.title")}</h2>
        <p className="landing-why-answer">{t("home.why.lead")}</p>
        <div className="landing-why-panels">
          <div className="landing-why-raw">
            <span className="landing-panel-label">{t("home.why.bankLabel")}</span>
            <ul>
              {RAW_LINES.map((line) => <li key={line.label}>
                <span>{line.label}</span><span>{line.amount}</span>
              </li>)}
            </ul>
          </div>
          <div className="landing-why-clair">
            <span className="landing-panel-label">{t("home.why.clairLabel")}</span>
            <p className="landing-why-headline">
              <strong>{t("home.why.category")}</strong>
              <em>{t("home.why.amount")}</em>
            </p>
            <span className="landing-why-period">{t("home.why.period")}</span>
            <ul>
              {["line1", "line2", "line3"].map((key) => <li key={key}>{t(`home.why.${key}`)}</li>)}
            </ul>
          </div>
        </div>
      </section>

      <section className="landing-section" id="fonctionnalites">
        <h2>{t("home.groups.title")}</h2>
        <div className="landing-groups">
          {GROUPS.map((group) => <div className="landing-group" key={group.key}>
            <span className="landing-icon">{ICONS[group.icon]}</span>
            <span className="landing-group-eyebrow">{t(`home.groups.${group.key}.eyebrow`)}</span>
            <h3>{t(`home.groups.${group.key}.question`)}</h3>
            <ul>
              {group.features.map((feature) => <li key={feature}>
                <strong>{t(`home.features.${feature}.title`)}</strong>
                <span>{t(`home.features.${feature}.body`)}</span>
              </li>)}
            </ul>
            {/* L'assistant se montre au lieu de se décrire : c'est ce qui distingue Clair d'un
                tableur, et une phrase d'exemple ne le fait pas comprendre. */}
            {group.key === "g3" && <div className="landing-ask">
              <p className="landing-ask-question">{t("home.ask.question")}</p>
              <p className="landing-ask-answer">{t("home.ask.answer")}</p>
              <span className="landing-panel-label">{t("home.ask.more")}</span>
              <ul className="landing-ask-more">
                {["s1", "s2", "s3"].map((key) => <li key={key}>{t(`home.ask.${key}`)}</li>)}
              </ul>
              <p className="landing-note">{t("home.ask.note")}</p>
            </div>}
          </div>)}
        </div>
      </section>

      {/* Dit par la négative, à dessein. Sur un service qui lit des comptes bancaires, ce qu'il
          s'interdit rassure davantage que ce qu'il promet. */}
      <section className="landing-security" id="securite">
        <div className="landing-security-inner">
          <h2>{t("home.security.title")}</h2>
          <p className="landing-section-lead">{t("home.security.lead")}</p>
          <ul className="landing-security-list">
            {SECURITY.map((item) => <li key={item.key}>
              <span className="landing-icon">{ICONS[item.icon]}</span>
              <div>
                <h3>{t(`home.security.${item.key}.title`)}</h3>
                <p>{t(`home.security.${item.key}.body`)}</p>
              </div>
            </li>)}
          </ul>
          <a className="landing-security-link" href="/confidentialite">{t("home.security.more")}</a>
        </div>
      </section>

      <BankMarquee t={t} />

      <section className="landing-section" id="fonctionnement">
        <h2>{t("home.steps.title")}</h2>
        <ol className="landing-steps">
          {[1, 2, 3].map((step) => <li key={step}>
            <span className="landing-step-index">{step}</span>
            <div>
              <h3>{t(`home.step${step}.title`)}</h3>
              <p>{t(`home.step${step}.body`)}</p>
            </div>
          </li>)}
        </ol>
      </section>

      {/* Le prix est la question qu'on se pose en troisième, et elle n'avait aucune réponse. */}
      <section className="landing-section landing-price" id="prix">
        <h2>{t("home.price.title")}</h2>
        <p className="landing-price-amount">{t("home.price.amount")}</p>
        <p className="landing-price-body">{t("home.price.body")}</p>
        <p className="landing-price-detail">{t("home.price.detail")}</p>
      </section>

      <section className="landing-section">
        <h2>{t("home.faq.title")}</h2>
        <div className="landing-faq-list">
          {[1, 2, 3, 4].map((n) => <details key={n}>
            <summary>{t(`home.faq.q${n}`)}</summary>
            <p>{t(`home.faq.a${n}`)}</p>
          </details>)}
        </div>
      </section>

      <section className="landing-final">
        <div className="landing-final-inner">
          <h2>{t("home.final.title")}</h2>
          <p>{t("home.final.body")}</p>
          <a className="landing-cta" href="/login">{t("home.final.cta")}</a>
        </div>
      </section>
    </main>

    {/* Les pages légales sont liées depuis le pied de page, où on les cherche — et leur présence
        est aussi ce qu'un classificateur regarde pour décider si un site a un éditeur. */}
    <footer className="landing-footer">
      <div className="landing-footer-inner">
        <div className="landing-footer-brand">
          <span className="brand">clair.</span>
          <p>{t("home.footer.tagline")}</p>
          <p className="landing-footer-note">{t("home.footer.builtIn")}</p>
        </div>
        <div className="landing-footer-columns">
          <div>
            <h4>{t("home.footer.product")}</h4>
            <a href="#fonctionnalites">{t("home.nav.features")}</a>
            <a href="#securite">{t("home.nav.security")}</a>
            <a href="#banques">{t("home.nav.banks")}</a>
            <a href="#prix">{t("home.nav.price")}</a>
            <a href="/login">{t("home.footer.signIn")}</a>
          </div>
          {/* Les guides sont liés depuis l'accueil : sans lien entrant, une page ne se fait pas
              explorer, et le plan du site seul ne suffit pas à la faire remonter. */}
          <div>
            <h4>Guides</h4>
            {GUIDES.map((guide) => <a key={guide.href} href={guide.href}>{guide.title}</a>)}
          </div>
          <div>
            <h4>{t("home.footer.legalTitle")}</h4>
            <a href="/mentions-legales">{t("home.footer.legal")}</a>
            <a href="/confidentialite">{t("home.footer.privacy")}</a>
          </div>
          <div>
            <h4>{t("home.footer.contactTitle")}</h4>
            <a href="mailto:contact@clairfinances.com">contact@clairfinances.com</a>
            <p className="landing-footer-note">{t("home.footer.contactHint")}</p>
          </div>
        </div>
      </div>
    </footer>
  </div>;
}
