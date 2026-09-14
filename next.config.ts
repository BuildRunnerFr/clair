import type { NextConfig } from "next";

/**
 * Les en-têtes de sécurité, déclarés ici plutôt que dans la configuration de l'hébergeur.
 *
 * Ils y étaient, et c'était un mauvais endroit pour deux raisons. Ils ne s'appliquaient qu'en
 * production, donc une politique trop stricte ne se découvrait qu'une fois déployée — sur la
 * page de connexion, c'est-à-dire au pire endroit. Et ils étaient liés à un hébergeur
 * particulier, alors que rien d'autre dans l'application ne l'est.
 *
 * Ici, ils s'appliquent aussi en développement et sur n'importe quel hôte, et se vérifient
 * d'un simple curl avant de partir.
 */
const CSP = [
  "default-src 'self'",
  // Next.js pose ses propres scripts en ligne pour l'hydratation, et le gabarit en pose un pour
  // appliquer le thème avant la peinture. Les interdire casserait la page ; les autoriser par
  // nonce demanderait un middleware sur chaque requête. Le reste de la politique garde sa
  // valeur : elle ferme l'exfiltration, l'encadrement et la réécriture de base — les gestes
  // qu'un script injecté ferait ensuite.
  process.env.NODE_ENV === "development"
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  // Les polices sont servies depuis le domaine par next/font : aucune origine tierce.
  "font-src 'self' data:",
  // Les seules destinations que le navigateur appelle : l'application et Supabase.
  "connect-src 'self' https://*.supabase.co https://*.supabase.in",
  // Aucune page ne doit pouvoir être encadrée : un habillage invisible ferait cliquer
  // l'utilisateur sur « supprimer mon compte » en croyant cliquer ailleurs.
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests"
  // form-action est délibérément absent. La connexion par Google passe par une Server Action,
  // puis par Supabase, puis par Google : Chrome applique form-action à toute la chaîne de
  // redirections, et une origine oubliée n'y couperait pas l'accès à une page — elle couperait
  // la connexion elle-même. Le gain serait mince, le risque porte sur le seul écran dont
  // dépendent tous les autres.
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  }
};

export default nextConfig;
