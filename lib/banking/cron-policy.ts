/**
 * Combien de connexions une exécution traite au plus.
 *
 * Une synchronisation prend quelques secondes ; au-delà, la fonction serait interrompue en
 * plein travail et la dernière connexion resterait verrouillée. Les connexions sont prises de
 * la plus ancienne à la plus récente, si bien que celles laissées de côté passent en tête à
 * l'exécution suivante — personne n'est jamais durablement oublié.
 */
export const CRON_MAX_CONNECTIONS = 10;

/** En deçà, une connexion vient d'être synchronisée : y revenir dépenserait des appels pour rien. */
export const CRON_STALE_HOURS = 6;

/** Date avant laquelle une connexion mérite d'être resynchronisée. */
export function staleBefore(now: Date): Date {
  return new Date(now.getTime() - CRON_STALE_HOURS * 3_600_000);
}

/**
 * Vérifie l'en-tête d'autorisation d'une exécution planifiée.
 *
 * Vercel envoie `Authorization: Bearer <CRON_SECRET>` à chaque déclenchement. Sans ce contrôle,
 * n'importe qui pourrait déclencher la synchronisation de tous les comptes en boucle et épuiser
 * le quota bancaire — la route agit sur tous les utilisateurs, pas seulement sur l'appelant.
 *
 * Un secret absent refuse tout, plutôt que d'ouvrir la route : une variable oubliée doit faire
 * échouer la tâche de façon visible, jamais la rendre publique en silence.
 */
export function isCronAuthorized(header: string | null, secret: string | undefined): boolean {
  const expected = secret?.trim() ?? "";
  if (!expected) return false;
  const received = header?.trim() ?? "";
  if (!received.toLowerCase().startsWith("bearer ")) return false;
  return timingSafeEquals(received.slice(7).trim(), expected);
}

/**
 * Comparaison à durée constante.
 *
 * Une comparaison ordinaire s'arrête au premier caractère différent, et le temps de réponse
 * révèle alors combien de caractères initiaux étaient corrects — de quoi reconstituer un secret
 * essai après essai.
 */
function timingSafeEquals(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
