/**
 * Le libellé d'un compte dans une liste de choix.
 *
 * Une banque comme Revolut ouvre un portefeuille par devise, tous portant le nom du titulaire :
 * quatre lignes identiques dans un sélecteur, impossibles à départager. Le nom seul ne suffit
 * donc pas — c'est la devise qui distingue, et elle doit être lue avec le nom.
 *
 * Quand deux comptes partagent jusqu'à leur devise — deux comptes courants dans la même banque,
 * cas ordinaire —, la devise ne tranche plus. On ajoute alors les derniers caractères de
 * l'identifiant fourni par la banque : ce n'est pas un numéro de compte, mais c'est stable, et
 * c'est le seul élément qui distingue à coup sûr. On ne l'ajoute qu'en cas de collision, pour ne
 * pas encombrer le cas courant d'un détail que personne ne lit.
 */
export interface LabelledAccount {
  id: string;
  name: string;
  currency: string;
  providerAccountId?: string | null;
}

export function accountLabels<T extends LabelledAccount>(accounts: readonly T[]): Map<string, string> {
  const occurrences = new Map<string, number>();
  for (const account of accounts) {
    const cle = `${account.name}|${account.currency}`;
    occurrences.set(cle, (occurrences.get(cle) ?? 0) + 1);
  }
  const labels = new Map<string, string>();
  for (const account of accounts) {
    const ambigu = (occurrences.get(`${account.name}|${account.currency}`) ?? 0) > 1;
    const suffixe = ambigu && account.providerAccountId ? ` (…${account.providerAccountId.slice(-4)})` : "";
    labels.set(account.id, `${account.name} · ${account.currency}${suffixe}`);
  }
  return labels;
}
