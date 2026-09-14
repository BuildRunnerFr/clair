import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";

/**
 * Deux familles, deux rôles.
 *
 * Un serif pour les titres : c'est ce qui distingue une institution financière d'un outil
 * technique, plus sûrement qu'une couleur. Source Serif est une transitionnelle sobre, lisible
 * en gros comme en petit, et sans le maniérisme des serifs à la mode.
 *
 * Inter pour tout le reste, et surtout pour les chiffres : ses variantes tabulaires alignent les
 * montants en colonne, ce qu'aucun serif ne fait proprement.
 *
 * Chargées par next/font : les fichiers sont servis depuis le domaine, sans requête vers Google,
 * et la police de repli est mesurée pour que le texte ne saute pas à l'arrivée de la vraie.
 */
const serif = Source_Serif_4({ subsets: ["latin"], display: "swap", variable: "--font-serif", weight: ["400", "600"] });
const sans = Inter({ subsets: ["latin"], display: "swap", variable: "--font-sans" });
import { I18nProvider } from "@/components/i18n-provider";
import { catalogueFor, currentLocale } from "@/lib/i18n/server";
import { SITE_URL } from "@/lib/site";

/**
 * Lit le choix de thème et le pose sur la racine. Enveloppé dans un try : un navigateur qui
 * refuse le stockage local lèverait à la lecture, et une exception ici empêcherait la page
 * entière de s'afficher.
 */
const THEME_BOOTSTRAP = `try{var t=localStorage.getItem("clair.theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

/**
 * `viewport-fit: cover` étend la page sous l'encoche et la barre d'état, ce qui est la seule
 * façon d'obtenir une page qui va jusqu'aux bords — et la seule qui oblige à réserver soi-même
 * la place de ces bandes, par env(safe-area-inset-*). Sans cette déclaration, le navigateur
 * décide seul, et sur iOS il glisse le contenu sous l'heure et la batterie dès que sa barre
 * d'outils se réduit : constaté, la marque et l'initiale du compte passaient dessous.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // La couleur de la barre du navigateur suit le thème, au lieu de trancher avec la page.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#16181c" }
  ]
};

export const metadata: Metadata = {
  /**
   * L'adresse de référence, sans laquelle Next émet des adresses relatives dans les balises de
   * partage — qu'aucun réseau ne sait résoudre. Elle est fixe et non déduite du déploiement :
   * voir lib/site.ts.
   */
  metadataBase: new URL(SITE_URL),
  title: "Clair — Finances personnelles",
  description: "Un tableau de bord simple pour comprendre ses dépenses.",
  /* Ce que voit quelqu'un à qui on envoie le lien. Sans ces balises, un lien partagé s'affiche
     comme une adresse nue, ce qui pour un service financier ressemble à un lien qu'on n'ouvre
     pas. */
  openGraph: {
    type: "website",
    siteName: "Clair",
    locale: "fr_FR",
    url: "/",
    title: "Clair — Comprendre ses dépenses",
    description: "Clair relie vos comptes bancaires, classe vos dépenses tout seul, et répond à vos questions.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Clair — votre banque vous dit ce que vous avez dépensé, Clair vous dit ce que ça veut dire." }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Clair — Comprendre ses dépenses",
    description: "Comprendre ses dépenses sans y passer ses soirées.",
    images: ["/og.png"]
  },
  /**
   * Preuve, pour Google, que le site appartient bien à qui demande le réexamen.
   *
   * Elle ne change rien à ce que voit un visiteur et ne donne aucun accès à Google : elle atteste
   * seulement qu'on peut modifier le site, donc qu'on en est responsable. Sans elle, n'importe
   * qui pourrait demander le retrait d'un signalement sur le domaine d'un autre.
   *
   * Doublée d'un fichier à la racine (public/google88394e9ffface080.html) : les deux méthodes
   * sont acceptées, en poser deux évite un aller-retour si l'une échoue.
   */
  verification: { google: "-Lj5nGnkfj4EeIgOE2MWqWaf7bRVh-z7vNIFZwBn_w0" }
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // `lang` suit la langue rendue : les lecteurs d'écran choisissent leur prononciation dessus,
  // et un texte anglais annoncé comme français est à peine intelligible.
  const locale = await currentLocale();
  return (
    <html lang={locale} className={`${sans.variable} ${serif.variable}`}>
      <head>
        {/* Le thème choisi est posé avant la peinture, et cela justifie un script bloquant.
            Appliqué depuis un effet React, il arriverait après le premier rendu : la page
            apparaîtrait en clair une fraction de seconde avant de basculer — un éclair blanc
            en pleine nuit, sur toutes les pages, à chaque navigation. Trois lignes exécutées
            avant le premier octet de contenu coûtent moins que ce clignotement. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <I18nProvider catalogue={catalogueFor(locale)} locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
