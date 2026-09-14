/**
 * Le tracé des courbes, partagé par le graphique de solde et l'aperçu du site vitrine.
 *
 * Ici plutôt que dans le composant parce que la page d'accueil se rend sur le serveur : elle ne
 * peut pas importer un module marqué « use client » sans l'embarquer tout entier dans le
 * navigateur, et l'aperçu qu'elle dessine doit avoir exactement la forme du graphique réel —
 * sans quoi la page promet un dessin que l'application ne produit pas.
 */
export interface Point { x: number; y: number }

/**
 * Trace une courbe lissée qui ne déborde jamais de ses points.
 *
 * L'interpolation est celle de Fritsch et Carlson, dite monotone : les tangentes sont choisies
 * pour que la courbe reste comprise entre deux points consécutifs. La distinction n'est pas
 * cosmétique. Une spline ordinaire — Catmull-Rom, Bézier à tension fixe — dépasse les extrêmes
 * pour arrondir les angles : sur un solde, elle inventerait un creux sous le point le plus bas,
 * c'est-à-dire un découvert qui n'a pas eu lieu. Celle-ci passe exactement par chaque valeur
 * mesurée et n'en fabrique aucune entre deux.
 *
 * `continued` enchaîne le tracé sur un chemin déjà commencé — la bande de prévision se ferme en
 * repassant à l'envers par sa borne basse.
 */
export function monotone(points: Point[], continued = false): string {
  const count = points.length;
  if (count === 0) return "";
  const start = `${continued ? "L" : "M"}${points[0]!.x.toFixed(1)},${points[0]!.y.toFixed(1)}`;
  if (count < 3) return points.slice(1).reduce((path, point) => `${path} L${point.x.toFixed(1)},${point.y.toFixed(1)}`, start);

  const widths: number[] = [], slopes: number[] = [];
  for (let index = 0; index < count - 1; index++) {
    widths[index] = points[index + 1]!.x - points[index]!.x;
    slopes[index] = (points[index + 1]!.y - points[index]!.y) / widths[index]!;
  }
  const tangents: number[] = new Array(count);
  tangents[0] = slopes[0]!;
  tangents[count - 1] = slopes[count - 2]!;
  for (let index = 1; index < count - 1; index++) {
    const before = slopes[index - 1]!, after = slopes[index]!;
    // Un changement de sens, ou un palier : la tangente est plate, sinon la courbe dépasse.
    if (before * after <= 0) { tangents[index] = 0; continue; }
    const w1 = 2 * widths[index]! + widths[index - 1]!;
    const w2 = widths[index]! + 2 * widths[index - 1]!;
    tangents[index] = (w1 + w2) / (w1 / before + w2 / after);
  }

  let path = start;
  for (let index = 0; index < count - 1; index++) {
    const third = widths[index]! / 3;
    const from = points[index]!, to = points[index + 1]!;
    path += ` C${(from.x + third).toFixed(1)},${(from.y + third * tangents[index]!).toFixed(1)}`
      + ` ${(to.x - third).toFixed(1)},${(to.y - third * tangents[index + 1]!).toFixed(1)}`
      + ` ${to.x.toFixed(1)},${to.y.toFixed(1)}`;
  }
  return path;
}
