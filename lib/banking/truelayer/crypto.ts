import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export function randomOAuthState() { return randomBytes(32).toString("base64url"); }
export function hashOAuthState(state: string) { return createHash("sha256").update(state).digest("hex"); }

/**
 * Chiffrement des jetons bancaires, avec des clés versionnées.
 *
 * Une clé unique ne se change pas : la remplacer rendrait illisibles tous les jetons existants
 * et imposerait à chaque utilisateur de reconnecter sa banque. Autant dire qu'en cas de fuite,
 * on ne la changerait pas — ce qui est exactement le problème.
 *
 * L'identifiant de clé est porté par la valeur chiffrée et non par une colonne. Il ne peut donc
 * jamais se désynchroniser d'elle, et deux jetons d'une même ligne peuvent être sur des clés
 * différentes le temps d'une rotation, ce qu'une colonne unique interdirait.
 *
 * Configuration :
 *   BANK_TOKEN_ENCRYPTION_KEYS = "v2:<base64>,v1:<base64>"   — la première chiffre, toutes déchiffrent
 *   BANK_TOKEN_ENCRYPTION_KEY  = "<base64>"                  — forme historique, toujours acceptée
 */

const KEY_ID = /^[a-z0-9_-]{1,16}$/;

/** Deux lectures de chaîne suffisent : inutile d'exiger tout l'environnement Node. */
type EnvSource = Record<string, string | undefined>;

export interface EncryptionKey {
  id: string;
  key: Buffer;
}

/**
 * Les clés disponibles, la première servant à chiffrer.
 *
 * Lues à chaque appel plutôt que mises en cache : une rotation prend effet au redéploiement,
 * et un cache de module survivrait à la mise à jour de la variable dans une instance déjà tiède.
 */
export function encryptionKeys(env: EnvSource = process.env): EncryptionKey[] {
  const versioned = env.BANK_TOKEN_ENCRYPTION_KEYS?.trim();
  if (versioned) {
    const keys = versioned.split(",").map((entry) => parseKey(entry.trim()));
    if (!keys.length) throw new Error("BANK_TOKEN_ENCRYPTION_KEYS ne contient aucune clé.");
    const ids = new Set(keys.map((item) => item.id));
    if (ids.size !== keys.length) throw new Error("BANK_TOKEN_ENCRYPTION_KEYS contient deux fois le même identifiant.");
    return keys;
  }

  const single = env.BANK_TOKEN_ENCRYPTION_KEY?.trim();
  if (!single) throw new Error("Clé de chiffrement bancaire manquante.");
  return [{ id: "legacy", key: decodeKey(single) }];
}

function parseKey(entry: string): EncryptionKey {
  const separator = entry.indexOf(":");
  if (separator <= 0) throw new Error("Clé mal formée : attendu « identifiant:clé ».");
  const id = entry.slice(0, separator);
  if (!KEY_ID.test(id)) throw new Error(`Identifiant de clé invalide : ${id}`);
  return { id, key: decodeKey(entry.slice(separator + 1)) };
}

function decodeKey(value: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("La clé de chiffrement bancaire doit contenir 32 octets.");
  return key;
}

export function encryptToken(value: string, env?: EnvSource) {
  const [current] = encryptionKeys(env);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", current!.key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [current!.id, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptToken(value: string, env?: EnvSource) {
  const keys = encryptionKeys(env);
  const parts = value.split(".");

  if (parts.length === 4) {
    const [id, iv, tag, encrypted] = parts as [string, string, string, string];
    const match = keys.find((candidate) => candidate.id === id);
    if (!match) throw new Error(`Jeton chiffré avec une clé absente de la configuration : ${id}`);
    return open(match.key, iv, tag, encrypted);
  }

  if (parts.length === 3) {
    // Format d'avant les versions. On essaie chaque clé : GCM authentifie, donc une mauvaise clé
    // échoue au lieu de rendre des octets faux. Le tâtonnement est ici sans ambiguïté, et ne
    // concerne que les jetons écrits avant cette évolution.
    const [iv, tag, encrypted] = parts as [string, string, string];
    for (const candidate of keys) {
      try {
        return open(candidate.key, iv, tag, encrypted);
      } catch {
        continue;
      }
    }
    throw new Error("Aucune clé configurée ne déchiffre ce jeton.");
  }

  throw new Error("Token bancaire chiffré invalide.");
}

/** Vrai si la valeur n'est pas chiffrée avec la clé courante, et mérite d'être réécrite. */
export function needsRotation(value: string, env?: EnvSource): boolean {
  const [current] = encryptionKeys(env);
  const parts = value.split(".");
  return parts.length !== 4 || parts[0] !== current!.id;
}

function open(key: Buffer, iv: string, tag: string, encrypted: string): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
