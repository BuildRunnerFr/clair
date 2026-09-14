import type { MetadataRoute } from "next";

/**
 * Le manifeste d'application, pour un écran d'accueil de téléphone.
 *
 * `display: standalone` retire la barre d'adresse une fois l'application ajoutée : ce qui reste
 * est l'interface, avec sa propre barre d'onglets en bas. La couleur de fond est celle du papier
 * et non du thème sombre — c'est elle qu'affiche le système pendant le chargement, et un flash
 * noir avant une interface claire se remarque plus qu'un blanc cassé.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Clair — Comprendre ses dépenses",
    short_name: "Clair",
    description: "Vos comptes bancaires reliés, vos dépenses classées toutes seules, et des réponses à vos questions.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f3f5f7",
    theme_color: "#1b3a63",
    lang: "fr",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      // `maskable` autorise le système à rogner l'icône dans sa propre forme — cercle sur
      // Android, carré arrondi ailleurs. La lettre déborde déjà : elle supporte le rognage.
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
