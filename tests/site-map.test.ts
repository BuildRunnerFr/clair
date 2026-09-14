import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRIVATE_PATHS, PUBLIC_PAGES, SITE_URL } from "@/lib/site";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

/**
 * Le plan du site et le fichier d'exclusion doivent décrire les routes qui existent.
 *
 * Les deux fichiers énumèrent des chemins à la main. Rien, dans le typage, ne relie cette
 * énumération aux dossiers de `app/` : une page renommée, une page supprimée, une page publique
 * ajoutée — et le plan ment sans qu'aucune compilation ne s'en aperçoive. Un moteur, lui, s'en
 * aperçoit ; il constate des adresses mortes sur un domaine qui vient d'être déclassé.
 */
const route = (path: string) => new URL(`../app${path === "/" ? "" : path}/page.tsx`, import.meta.url);

describe("le plan du site décrit le site", () => {
  it("ne référence que des pages qui existent", () => {
    for (const path of PUBLIC_PAGES) expect(existsSync(route(path)), path).toBe(true);
  });

  it("n’exclut que des routes qui existent", () => {
    for (const path of PRIVATE_PATHS) {
      const directory = new URL(`../app/${path.replace(/^\/|\/$/g, "")}`, import.meta.url);
      expect(existsSync(directory), path).toBe(true);
    }
  });

  it("désigne le plan du site depuis le fichier d’exclusion", () => {
    expect(robots().sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });

  it("publie les trois pages ouvertes, et l’accueil sans barre oblique finale", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain(SITE_URL);
    expect(urls).toHaveLength(PUBLIC_PAGES.length);
    // Une adresse canonique qui existe en deux formes est deux pages pour un moteur.
    for (const url of urls) expect(url.endsWith("/")).toBe(false);
  });

  it("n’expose aucune page privée au plan du site", () => {
    const urls = sitemap().map((entry) => entry.url.replace(SITE_URL, "") || "/");
    for (const path of PRIVATE_PATHS) expect(urls.some((url) => url.startsWith(path.replace(/\/$/, "")))).toBe(false);
  });
});

describe("le lien partagé montre quelque chose", () => {
  it("sert l’image de partage annoncée par les balises", () => {
    // Une balise og:image qui pointe sur un fichier absent produit un aperçu vide — c'est-à-dire
    // pire qu'aucune balise, puisque le réseau a alors une carte à afficher et rien à y mettre.
    expect(existsSync(new URL("../public/og.png", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../scripts/og-card.html", import.meta.url))).toBe(true);
  });

  it("garde le jeu d’icônes que Next assemble par convention de nom", () => {
    /* Ces fichiers ne sont importés nulle part : Next les repère à leur emplacement et à leur
       nom, et fabrique les balises correspondantes. Rien ne casse si l'un d'eux disparaît — on
       retombe simplement sur le globe par défaut, et personne ne s'en aperçoit avant de voir
       l'onglet. D'où cette liste, seule référence écrite à ces chemins. */
    for (const asset of ["app/favicon.ico", "app/icon.png", "app/apple-icon.png",
      "app/manifest.ts", "public/icon-192.png", "public/icon-512.png"]) {
      expect(existsSync(new URL(`../${asset}`, import.meta.url)), asset).toBe(true);
    }
  });
});

describe("métadonnées des pages publiques", () => {
  it("partage le titre et l’adresse du guide, sans hériter de ceux de l’accueil", async () => {
    const { publicMetadata } = await import("@/lib/site");
    const metadata = publicMetadata("/gestion-budget", "Budget — Clair", "Fixer ses limites.");
    expect(metadata.alternates?.canonical).toBe("/gestion-budget");
    expect(metadata.openGraph).toMatchObject({ url: "/gestion-budget", title: "Budget — Clair", description: "Fixer ses limites." });
    expect(metadata.twitter).toMatchObject({ title: "Budget — Clair", images: ["/og.png"] });
  });
});
