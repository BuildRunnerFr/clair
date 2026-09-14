import { logout } from "@/app/login/actions";
import { getTranslations } from "@/lib/i18n/server";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * En-tête unique de l'application.
 *
 * Chaque page portait auparavant sa propre barre : le tableau de bord menait à l'assistant et
 * aux budgets, les budgets ne menaient qu'au tableau de bord, et la catégorisation n'était
 * accessible que par un encart conditionnel qui disparaissait une fois tout catégorisé — la
 * page devenait alors introuvable alors qu'elle sert aussi à corriger des règles. Le même lien
 * s'appelait par ailleurs « Dashboard » ici et « Tableau de bord » là.
 *
 * La page courante figure dans la barre au lieu d'en être retirée. L'omettre déplaçait tous les
 * autres liens à chaque navigation — la barre n'avait jamais deux fois la même forme, et rien
 * n'indiquait où l'on se trouvait. Un onglet marqué coûte une ligne et rend la barre stable.
 */
/**
 * Deux libellés par entrée. Sur mobile la barre passe en bas, dans la zone du pouce, et cinq
 * intitulés longs n'y tiennent pas sur 375 px — soit ils débordent, soit ils imposent un
 * défilement horizontal qu'on n'attend pas d'une barre d'onglets. Le libellé court n'apparaît
 * que là ; l'abréger partout appauvrirait le bureau sans nécessité.
 */
const LINKS = [
  { href: "/dashboard", key: "dashboard" },
  { href: "/transactions", key: "transactions" },
  { href: "/assistant", key: "assistant" },
  { href: "/budgets", key: "budgets" }
] as const;

/**
 * La catégorisation avait son onglet. Elle a été retirée : la page servait à corriger le
 * classement marchand par marchand, dans une liste de plusieurs centaines de lignes, alors que
 * la correction se fait désormais là où l'on constate l'erreur — en dépliant l'opération dans la
 * liste des transactions. Un écran qu'on n'ouvre que pour y chercher ce qu'on a sous les yeux
 * ailleurs ne mérite pas un cinquième de la barre de navigation.
 */

/** `/compte` n'est pas un onglet : on y accède par l'adresse email, là où on la cherche. */
export type HeaderLocation = (typeof LINKS)[number]["href"] | "/compte";

export async function AppHeader({ email, current, firstName }: { email: string; current: HeaderLocation; firstName?: string | null }) {
  const t = await getTranslations();
  return <header className="header">
    <a className="brand brand-link" href="/dashboard">clair.</a>
    {/* aria-current porte l'information à l'assistance vocale ; la pastille la porte à l'œil.
        Les deux sont nécessaires, la couleur seule ne se lit pas. */}
    <nav className="main-nav" data-tour="nav" aria-label={t("nav.mainLabel")}>
      {LINKS.map((link) => <a key={link.href} href={link.href} aria-current={link.href === current ? "page" : undefined}>
        <span className="nav-long">{t(`nav.${link.key}`)}</span><span className="nav-short">{t(`nav.${link.key}Short`)}</span>
      </a>)}
    </nav>
    <div className="header-account">
      <ThemeToggle />
      {/* L'adresse en entier sur grand écran, son initiale sur téléphone.
          Les trois éléments de ce bloc réclamaient ensemble plus de 390 px : « Se déconnecter »
          sortait de l'écran, coupé net, sur toutes les pages. L'adresse est la moins utile des
          trois — on la connaît — et c'est donc elle qui cède la place, sans disparaître : la
          pastille mène au même endroit et porte l'adresse en infobulle. */}
      <a className="user-email" href="/compte" title={t("nav.accountTitle", { email })} aria-current={current === "/compte" ? "page" : undefined}>{email}</a>
      <a className="user-initial" href="/compte" title={t("nav.accountTitle", { email })} aria-label={t("nav.accountTitle", { email })} aria-current={current === "/compte" ? "page" : undefined}>
        {/* L'initiale du prénom, et non celle de l'adresse : une adresse commençant par un
            chiffre — 92client@… — donnait une pastille marquée « 9 », qui ne désigne personne.
            L'adresse ne sert de repli que tant que le profil n'est pas rempli. */}
        <span aria-hidden="true">{(firstName?.trim().charAt(0) || email.trim().charAt(0)).toUpperCase() || "·"}</span>
      </a>
      <form action={logout} className="header-signout"><button className="text-button">{t("nav.signOut")}</button></form>
    </div>
  </header>;
}
