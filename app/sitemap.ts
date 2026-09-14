import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, SITE_URL } from "@/lib/site";

/**
 * Le plan du site : trois pages, et pas une de plus.
 *
 * `lastModified` est volontairement absent. La date du déploiement serait la seule dont on
 * dispose, et elle changerait à chaque mise en ligne, y compris quand la page n'a pas bougé
 * d'une virgule : un moteur qui la croit revient explorer pour rien, et finit par ne plus
 * croire aucune des dates du domaine. Mieux vaut ne rien dire que dire faux.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((path) => ({
    url: path === "/" ? SITE_URL : `${SITE_URL}${path}`,
    changeFrequency: path === "/" ? "weekly" : "yearly",
    priority: path === "/" ? 1 : 0.3
  }));
}
