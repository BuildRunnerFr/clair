/**
 * L'identité de l'éditeur, telle que la loi impose de la publier.
 *
 * Lue dans l'environnement et non écrite en dur : ces valeurs dépendent d'un statut juridique
 * qui se constitue, et un dépôt public n'est pas l'endroit d'une adresse personnelle.
 *
 * Tant qu'elles manquent, les pages le disent au lieu d'afficher un gabarit à trous. Une mention
 * légale incomplète est un manquement ; une mention légale qui affiche « [VOTRE NOM] » est un
 * manquement doublé d'un aveu de négligence, et c'est ce que verrait un classificateur venu
 * vérifier si le site a un éditeur.
 */
export interface Publisher {
  name?: string;
  status?: string;
  address?: string;
  email?: string;
  siret?: string;
  director?: string;
  /** « TVA non applicable, article 293 B du CGI » pour une micro-entreprise sous le seuil. */
  vat?: string;
}

export function publisher(env: Record<string, string | undefined> = process.env): Publisher {
  const read = (key: string) => env[key]?.trim() || undefined;
  return {
    name: read("LEGAL_PUBLISHER_NAME"),
    status: read("LEGAL_PUBLISHER_STATUS"),
    address: read("LEGAL_PUBLISHER_ADDRESS"),
    email: read("LEGAL_CONTACT_EMAIL"),
    siret: read("LEGAL_PUBLISHER_SIRET"),
    director: read("LEGAL_PUBLICATION_DIRECTOR"),
    vat: read("LEGAL_VAT_MENTION")
  };
}

/** Vrai lorsque les mentions obligatoires sont renseignées. */
export function isPublisherComplete(details: Publisher): boolean {
  return Boolean(details.name && details.address && details.email);
}

/**
 * L'hébergeur, que la loi impose de nommer au même titre que l'éditeur.
 *
 * Vercel héberge, et la région dub1 place l'exécution à Dublin ; la base Supabase est en
 * eu-west-1, en Irlande également. Les deux sont dans l'Union, ce qui évite d'avoir à justifier
 * un transfert hors UE pour l'hébergement lui-même — la question se pose en revanche pour
 * OpenAI, et la politique de confidentialité le dit.
 */
export const HOST = {
  name: "Vercel Inc.",
  address: "440 N Barranca Ave #4133, Covina, CA 91723, États-Unis",
  region: "Dublin, Irlande (région dub1)",
  site: "vercel.com"
} as const;

/**
 * Les tiers qui accèdent aux données, et ce que chacun voit exactement.
 *
 * Cette liste est le cœur du document : c'est elle qu'un gabarit générique ne peut pas produire,
 * et c'est elle qui décide si la déclaration est sincère. Chaque ligne correspond à un appel
 * réel dans le code.
 */
export const PROCESSORS = [
  {
    name: "Supabase",
    role: "Base de données et authentification",
    data: "Adresse email, transactions, soldes, budgets, règles de catégorisation, conversations avec l’assistant",
    location: "Irlande (eu-west-1)"
  },
  {
    name: "Vercel",
    role: "Hébergement de l’application",
    data: "Données transitant par les pages consultées ; journaux techniques",
    location: "Dublin, Irlande"
  },
  {
    name: "TrueLayer Ireland Limited",
    role: "Accès aux comptes bancaires",
    data: "Transactions et soldes transmis par la banque, sur autorisation de l’utilisateur",
    location: "Irlande"
  },
  {
    name: "OpenAI",
    role: "Classement des dépenses et assistant conversationnel",
    data: "Libellé de l’opération après masquage, montant, devise. Jamais de nom de tiers, d’IBAN ni de référence",
    location: "États-Unis"
  },
  {
    name: "Resend",
    role: "Envoi des emails de connexion",
    data: "Adresse email",
    location: "Irlande (eu-west-1)"
  }
] as const;
