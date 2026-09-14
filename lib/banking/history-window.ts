/**
 * Sur quelle profondeur une synchronisation peut interroger la banque.
 *
 * Deux ans d'historique sont bien disponibles — mais pendant quelques minutes seulement.
 *
 * La directive impose à une banque de fournir 90 jours sans authentification forte, et davantage
 * après. L'erreur a été de croire que ce « après » durait : il ne vaut que pendant la fenêtre
 * SCA, de cinq à quarante-cinq minutes selon l'établissement, qui suit immédiatement
 * l'authentification. Passé ce délai, toute demande excédant 90 jours ne renvoie pas moins de
 * données : elle renvoie « access_denied », que TrueLayer transmet en 403.
 *
 * Le coût de la méprise a été exactement celui-là. Une synchronisation demandant deux ans hors
 * fenêtre recevait un 403, que le code lisait comme un consentement révoqué et qui marquait la
 * connexion à réautoriser — sur une connexion parfaitement valide. Le rattrapage automatique
 * rendait la faute permanente : l'historique ne pouvant jamais atteindre deux ans, chaque
 * synchronisation redemandait deux ans, recevait 403, et condamnait la connexion à nouveau.
 * Se reconnecter n'y changeait rien, la synchronisation suivante rejouant la même scène.
 *
 * La profondeur est donc désormais une question de moment, non d'ambition : deux ans tant que la
 * fenêtre est ouverte, 89 jours ensuite. La reprise complète de l'historique n'a lieu qu'une
 * fois, dans les secondes qui suivent l'autorisation — c'est pourquoi le retour d'OAuth la
 * déclenche lui-même au lieu de l'attendre d'un geste de l'utilisateur.
 *
 * https://support.truelayer.com/hc/en-us/articles/360025818054
 */
export const HISTORY_MONTHS = 24;

/**
 * Quatre minutes, quand la plus courte fenêtre bancaire en vaut cinq.
 *
 * La marge n'est pas de la prudence gratuite : l'horloge qui compte est celle de la banque, et
 * dépasser d'une seconde ne coûte pas quelques jours d'historique — cela condamne la connexion.
 */
export const SCA_WINDOW_MINUTES = 4;

/** Trois jours de recouvrement : une opération peut être modifiée après avoir été enregistrée. */
const OVERLAP_DAYS = 3;

/**
 * 89 jours et non 90. Les 90 jours se comptent chez la banque, à l'instant où elle traite la
 * requête, et une demande posée exactement sur la borne bascule du mauvais côté pour un décalage
 * d'horloge ou une journée arrondie autrement.
 */
const SAFE_DAYS = 89;

export interface WindowInput {
  /** Dernier passage réussi, ou null si la connexion n'a jamais été synchronisée. */
  lastSyncedAt: Date | null;
  /** Dernière autorisation par l'utilisateur, ou null si elle est antérieure à son suivi. */
  authorizedAt: Date | null;
  now: Date;
}

/**
 * Décide la date de départ, et dit s'il s'agit d'une reprise d'historique.
 *
 * Hors fenêtre, la borne des 89 jours s'applique aussi aux synchronisations ordinaires : une
 * connexion restée muette quatre mois repartirait sinon de son dernier passage, c'est-à-dire
 * au-delà de ce que la banque accorde, et se ferait condamner pour cela.
 */
export function safeWindowStart(now: Date): Date {
  return new Date(now.getTime() - SAFE_DAYS * 86_400_000);
}

export function syncWindow({ lastSyncedAt, authorizedAt, now }: WindowInput): { from: Date; backfill: boolean } {
  const safe = safeWindowStart(now);

  if (authorizedAt && now.getTime() - authorizedAt.getTime() <= SCA_WINDOW_MINUTES * 60_000) {
    const deep = new Date(now);
    deep.setUTCMonth(deep.getUTCMonth() - HISTORY_MONTHS);
    return { from: deep, backfill: true };
  }

  if (!lastSyncedAt) return { from: safe, backfill: false };
  const since = new Date(lastSyncedAt.getTime() - OVERLAP_DAYS * 86_400_000);
  return { from: since < safe ? safe : since, backfill: false };
}
