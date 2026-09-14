import { BRAND_CTA } from "@/lib/site";

/**
 * L'habillage commun des pages de contenu.
 *
 * Elles sont écrites en français seulement, comme les mentions légales et pour une raison
 * voisine : elles visent des recherches formulées en français — « suivi dépenses automatique »,
 * « application gestion budget » — et une traduction mot à mot ne viserait rien du tout dans
 * l'autre langue. Le jour où l'anglais aura ses propres requêtes, il aura ses propres pages,
 * pas la traduction de celles-ci.
 *
 * Chaque page porte le même pied : un appel à l'action, puis les autres guides. Ce maillage
 * n'est pas décoratif — sans lien entrant, une page ne se fait pas explorer, et quatre pages
 * qui s'ignorent valent moins que quatre pages qui se citent.
 */
export const GUIDES = [
  { href: "/suivi-depenses", title: "Le suivi de dépenses automatique", teaser: "Ce que veut dire « automatique », et comment une dépense reçoit sa catégorie." },
  { href: "/gestion-budget", title: "Gérer son budget sans le tenir", teaser: "Fixer une limite qui tient, à partir de ce que le poste vous coûte d’ordinaire." },
  { href: "/abonnements", title: "Retrouver ses abonnements", teaser: "Comment on repère un prélèvement récurrent, et ce qu'il coûte sur l'année." },
  { href: "/banques-compatibles", title: "Les banques compatibles", teaser: "Vérifier la disponibilité de votre banque et comprendre les données récupérées." }
] as const;

export function GuideShell({ title, lead, children, current }: {
  title: string; lead: string; current: string; children: React.ReactNode;
}) {
  const others = GUIDES.filter((guide) => guide.href !== current);
  return <div className="landing" lang="fr">
    <header className="landing-bar">
      <div className="landing-bar-inner">
        <a className="brand brand-link" href="/">clair.</a>
        <span className="guide-crumb">Guides</span>
        <div className="landing-bar-actions">
          <a className="landing-signin" href="/login">Se connecter</a>
          <a className="landing-cta landing-cta-small" href="/login">{BRAND_CTA}</a>
        </div>
      </div>
    </header>

    <main className="guide">
      <h1>{title}</h1>
      <p className="guide-lead">{lead}</p>
      {children}

      <section className="guide-cta">
        <h2>Essayer sur vos propres dépenses</h2>
        <p>Clair est gratuit, sans carte bancaire. La connexion se fait chez votre banque, en
          lecture seule, et se révoque quand vous voulez.</p>
        <a className="landing-cta" href="/login">{BRAND_CTA}</a>
      </section>

      <nav className="guide-others" aria-label="Autres guides">
        <h2>À lire aussi</h2>
        <ul>
          {others.map((guide) => <li key={guide.href}>
            <a href={guide.href}>{guide.title}</a>
            <span>{guide.teaser}</span>
          </li>)}
        </ul>
      </nav>
    </main>

    <footer className="landing-footer">
      <div className="landing-footer-inner">
        <div className="landing-footer-brand">
          <span className="brand">clair.</span>
          <p>Comprendre ses dépenses sans y passer ses soirées.</p>
          <p className="landing-footer-note">Conçu et hébergé dans l’Union européenne.</p>
        </div>
        <div className="landing-footer-columns">
          <div>
            <h4>Produit</h4>
            <a href="/#fonctionnalites">Fonctionnalités</a>
            <a href="/#securite">Sécurité</a>
            <a href="/#prix">Prix</a>
            <a href="/login">Se connecter</a>
          </div>
          <div>
            <h4>Guides</h4>
            {GUIDES.map((guide) => <a key={guide.href} href={guide.href}>{guide.title}</a>)}
          </div>
          <div>
            <h4>Informations</h4>
            <a href="/mentions-legales">Mentions légales</a>
            <a href="/confidentialite">Confidentialité</a>
            <a href="mailto:contact@clairfinances.com">contact@clairfinances.com</a>
          </div>
        </div>
      </div>
    </footer>
  </div>;
}
