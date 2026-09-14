/**
 * Réécrit tous les jetons bancaires avec la clé de chiffrement courante.
 *
 *   npx tsx --env-file=.env.local scripts/rotate-encryption-key.ts [--dry-run]
 *
 * À lancer après avoir ajouté une nouvelle clé en tête de BANK_TOKEN_ENCRYPTION_KEYS. Les
 * jetons déjà écrits restent lisibles sans lui — la clé qui les a chiffrés reste dans la liste —
 * mais tant qu'ils n'ont pas été réécrits, l'ancienne clé ne peut pas être retirée. Ce script
 * est ce qui permet de la retirer, et donc ce qui rend la rotation réelle plutôt que théorique.
 *
 * Idempotent : ce qui porte déjà l'identifiant courant est ignoré. Une exécution interrompue se
 * reprend en la relançant.
 *
 * Une rotation ordinaire n'a rien d'urgent — les jetons d'accès expirent en une heure et sont
 * réécrits à chaque synchronisation. Ce script sert aux jetons de rafraîchissement, qui vivent
 * des mois, et au cas qui compte vraiment : une clé compromise, qu'il faut retirer aujourd'hui.
 */
import { createClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken, encryptionKeys, needsRotation } from "@/lib/banking/truelayer/crypto";

const dryRun = process.argv.includes("--dry-run");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.");

const keys = encryptionKeys();
console.log(`\nClés configurées : ${keys.map((item) => item.id).join(", ")}`);
console.log(`Clé de chiffrement courante : ${keys[0]!.id}${dryRun ? "   (simulation)" : ""}\n`);

const db = createClient(url, serviceRoleKey);
const { data: connections, error } = await db.from("bank_connections").select("id,display_name,provider");
if (error) throw new Error(`Connexions illisibles : ${error.message}`);

/**
 * Rechiffre une valeur, et vérifie que la nouvelle se relit à l'identique avant de la rendre.
 *
 * On écrase ici des identifiants bancaires qu'aucune sauvegarde ne restaure : une valeur
 * corrompue obligerait l'utilisateur à reconnecter sa banque. Le contrôle coûte un déchiffrement
 * et supprime ce risque — mieux vaut échouer bruyamment que d'écrire quelque chose d'illisible.
 */
function reencrypt(ciphertext: string): string {
  const plain = decryptToken(ciphertext);
  const rewritten = encryptToken(plain);
  if (decryptToken(rewritten) !== plain) throw new Error("le jeton réécrit ne se relit pas à l'identique");
  return rewritten;
}

let examined = 0, rotated = 0, alreadyCurrent = 0, missing = 0;
const failures: string[] = [];

for (const connection of connections ?? []) {
  examined++;
  const { data, error: readError } = await db.rpc("bank_get_connection_secret", { p_connection_id: connection.id });
  if (readError) { failures.push(`${connection.id} : lecture — ${readError.message}`); continue; }

  const secret = data?.[0];
  if (!secret) { missing++; continue; }

  const stale = needsRotation(secret.access_token_ciphertext)
    || (secret.refresh_token_ciphertext ? needsRotation(secret.refresh_token_ciphertext) : false);
  if (!stale) { alreadyCurrent++; continue; }

  try {
    // Déchiffré puis rechiffré : c'est la seule façon de changer de clé, et elle impose que
    // l'ancienne soit encore présente dans la configuration. La retirer avant d'avoir lancé ce
    // script rendrait les jetons définitivement illisibles.
    const access = reencrypt(secret.access_token_ciphertext);
    const refresh = secret.refresh_token_ciphertext ? reencrypt(secret.refresh_token_ciphertext) : null;

    if (!dryRun) {
      const { error: writeError } = await db.rpc("bank_save_connection_secret", {
        p_connection_id: connection.id,
        p_access_token_ciphertext: access,
        p_refresh_token_ciphertext: refresh,
        p_access_token_expires_at: secret.access_token_expires_at
      });
      if (writeError) { failures.push(`${connection.id} : écriture — ${writeError.message}`); continue; }
    }
    rotated++;
    console.log(`  ${dryRun ? "à réécrire" : "réécrit   "}  ${connection.display_name ?? connection.id}`);
  } catch (failure) {
    // Nommer la connexion, jamais le contenu : un échec de déchiffrement signale une clé
    // manquante dans la configuration, et le message doit aider à la retrouver.
    failures.push(`${connection.display_name ?? connection.id} : ${failure instanceof Error ? failure.message : "échec"}`);
  }
}

console.log(`\n${examined} connexion(s) examinée(s)`);
console.log(`  ${rotated} ${dryRun ? "à réécrire" : "réécrite(s)"}`);
console.log(`  ${alreadyCurrent} déjà sur la clé courante`);
if (missing) console.log(`  ${missing} sans jeton enregistré`);

if (failures.length) {
  console.log(`\n${failures.length} échec(s) :`);
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  console.log("\nUne clé manquante dans BANK_TOKEN_ENCRYPTION_KEYS explique le plus souvent ces échecs.");
  process.exit(1);
}

if (!dryRun && rotated) {
  console.log("\nTous les jetons portent désormais la clé courante.");
  console.log("L'ancienne clé peut être retirée de BANK_TOKEN_ENCRYPTION_KEYS, puis redéployée.");
}
console.log();
