import type { MetadataRoute } from "next";
import { PRIVATE_PATHS, SITE_URL } from "@/lib/site";

/**
 * Le fichier d'exclusion, qui manquait — il répondait 404.
 *
 * Son absence n'interdit rien, mais elle prive le site de la seule ligne qui compte vraiment
 * ici : celle qui désigne le plan du site. Sans elle, un moteur découvre les pages par les
 * liens, dans l'ordre où il tombe dessus.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...PRIVATE_PATHS] }],
    sitemap: `${SITE_URL}/sitemap.xml`
  };
}
