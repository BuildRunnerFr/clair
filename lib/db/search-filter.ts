/**
 * Construit le filtre de recherche textuelle envoyé à PostgREST.
 *
 * Deux échappements successifs, et les deux sont nécessaires :
 *
 * 1. Sémantique LIKE — un « % » ou un « _ » saisi doit se chercher littéralement. Sans cela,
 *    une recherche « 100% » ramènerait toutes les transactions.
 * 2. Syntaxe PostgREST — dans un `or`, la virgule sépare les conditions. Une saisie contenant
 *    une virgule cassait l'analyse du filtre et faisait échouer la requête entière ; la valeur
 *    est donc guillemetée, et les guillemets qu'elle contient échappés à leur tour.
 *
 * Extrait du repository pour être testable : le repository est marqué server-only, et une
 * construction de requête est précisément ce qui mérite des tests.
 */
export function buildSearchFilter(query: string, columns: readonly string[]): string | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const forLike = trimmed.replace(/[\\%_]/g, (match) => `\\${match}`);
  const quoted = `"%${forLike.replace(/["\\]/g, (match) => `\\${match}`)}%"`;
  return columns.map((column) => `${column}.ilike.${quoted}`).join(",");
}
