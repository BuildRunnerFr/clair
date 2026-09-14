import type { CategoryName } from "./taxonomy";

/**
 * Familles de catégories, et leur couleur.
 *
 * Les applications de référence colorent chaque catégorie. Elles en ont une dizaine ; il y en
 * a vingt-deux ici. Au-delà de huit teintes l'œil ne les distingue plus de façon fiable, et
 * une palette générée pour vingt-deux produirait des voisines indifférenciables — a fortiori
 * pour un daltonien. D'où un regroupement en cinq familles, plus un neutre.
 *
 * L'appartenance est fixe et ne dépend pas des données : une catégorie garde sa couleur quel
 * que soit le mois ou le filtre. Colorer selon le rang ferait changer les couleurs à chaque
 * changement de période, ce qui détruirait toute reconnaissance.
 *
 * Palette vérifiée au validateur de la charte, thème clair, toutes paires confrontées : bande de
 * clarté, seuil de chroma, séparation en vision daltonienne et contraste sur le fond. En thème
 * sombre, seules les paires voisines passent — cinq teintes qui se distinguent toutes deux à
 * deux dans les deux thèmes est sur-contraint, et la méthode dit alors de réduire plutôt que de
 * forcer.
 *
 * Ce compromis est sans conséquence ici : la couleur d'une famille n'apparaît jamais seule. Elle
 * est toujours une pastille suivie du nom écrit de la catégorie, ce qui constitue exactement
 * l'encodage secondaire que la règle exige. Le jour où une couleur porterait seule l'identité —
 * un anneau, une aire empilée — il faudrait revenir à quatre teintes.
 *
 * Les teintes sont déclarées par thème et non déduites l'une de l'autre : éclaircir uniformément
 * un jeu clair détruit l'étagement de luminosité qui, précisément, sépare le teal du rose en
 * vision deutéranope.
 */
export type CategoryFamily = "essentiels" | "quotidien" | "plaisirs" | "argent" | "sante" | "autre";

const MEMBERSHIP: Partial<Record<CategoryName, CategoryFamily>> = {
  Housing: "essentiels", Utilities: "essentiels", Insurance: "essentiels", Taxes: "essentiels",
  Groceries: "quotidien", Transport: "quotidien", "Personal Care": "quotidien",
  Restaurants: "plaisirs", Coffee: "plaisirs", "Food & Drink": "plaisirs", Entertainment: "plaisirs", Travel: "plaisirs", Shopping: "plaisirs", Subscriptions: "plaisirs",
  "Financial Services": "argent", Transfers: "argent", Income: "argent", "Gifts & Donations": "argent",
  Health: "sante", Education: "sante"
};

export const FAMILY_COLORS: Record<CategoryFamily, string> = {
  essentiels: "#00785e",
  quotidien: "#4477d8",
  plaisirs: "#bd800c",
  argent: "#6d33a0",
  sante: "#dd6089",
  // Neutre volontairement hors palette : « Autre » n'est pas une famille de plus mais l'absence
  // de famille, et lui donner une teinte lui prêterait un sens qu'elle n'a pas. Un neutre échoue
  // par construction le seuil de chroma du validateur — il n'est pas une teinte catégorielle et
  // n'a pas à être jugé comme telle.
  autre: "#7a8794"
};

/** Les mêmes familles sur fond sombre. Choisies, non déduites — voir l'en-tête du fichier. */
export const FAMILY_COLORS_DARK: Record<CategoryFamily, string> = {
  essentiels: "#1f9179",
  quotidien: "#5e8fe4",
  plaisirs: "#c08722",
  argent: "#8b57c4",
  sante: "#d66d90",
  autre: "#93a0ac"
};

export const FAMILY_LABELS: Record<CategoryFamily, string> = {
  essentiels: "Essentiels", quotidien: "Quotidien", plaisirs: "Plaisirs", argent: "Argent", sante: "Santé et éducation", autre: "Autre"
};

export function familyOf(category: string): CategoryFamily {
  return MEMBERSHIP[category as CategoryName] ?? "autre";
}

/**
 * La couleur d'une catégorie, sous forme de variable CSS.
 *
 * Une valeur littérale posée en style inline ne peut pas suivre le thème : elle est calculée sur
 * le serveur, qui ignore si le navigateur affiche en clair ou en sombre. La variable, elle, est
 * résolue au rendu et bascule d'elle-même.
 */
export function colorOf(category: string): string {
  return `var(--family-${familyOf(category)})`;
}
