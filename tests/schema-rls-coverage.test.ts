import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Toute table publique est protégée, quelle que soit la migration qui l'a créée.
 *
 * Le contrôle existant ne lisait que la première migration. Il attestait donc de la sécurité
 * du schéma initial et de rien d'autre : les vingt-neuf migrations suivantes ont ajouté des
 * tables — instantanés de solde, compteurs d'usage, journal d'événements, profils — sans
 * qu'aucun test ne vérifie qu'elles étaient closes. Une seule oubliée suffirait à exposer les
 * données de tous les comptes à n'importe quelle session authentifiée.
 *
 * Le test lit donc l'ensemble des migrations, y relève chaque création de table, et exige pour
 * chacune la ligne de RLS, le retrait des droits anonymes et au moins une politique.
 */
const directory = new URL("../supabase/migrations/", import.meta.url);
const sql = readdirSync(directory)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(new URL(name, directory), "utf8"))
  .join("\n");

const created = [...sql.matchAll(/create table (?:if not exists )?public\.([a-z_]+)/g)].map((match) => match[1]!);
const tables = [...new Set(created)];

describe("cloisonnement du schéma", () => {
  it("relève toutes les tables créées", () => {
    // Un garde-fou qui ne trouverait rien passerait au vert sans rien vérifier.
    expect(tables.length).toBeGreaterThanOrEqual(10);
  });

  it.each(tables)("active la RLS sur %s", (table) => {
    expect(sql).toContain(`alter table public.${table} enable row level security`);
  });

  it.each(tables)("retire les droits anonymes sur %s", (table) => {
    // Les révocations sont parfois groupées — « revoke all on public.a, public.b from anon » —
    // d'où la recherche du nom de la table n'importe où dans l'énumération.
    expect(sql).toMatch(new RegExp(`revoke [a-z, ]+ on [^;]*\\bpublic\\.${table}\\b[^;]*from [^;]*\\banon\\b`));
  });

  it.each(tables)("définit au moins une politique sur %s", (table) => {
    expect(sql).toMatch(new RegExp(`create policy [^;]+ on public\\.${table}`));
  });

  it.each(tables)("réserve chaque politique de %s aux sessions authentifiées", (table) => {
    // C'est la garantie réelle : sans rôle explicite, une politique s'applique à PUBLIC, donc
    // aussi au rôle anonyme. Elle ne laisse rien passer tant qu'elle compare à auth.uid(), qui
    // est nul sans session — mais la protection tient alors à la forme du prédicat plutôt qu'au
    // rôle, et une politique future écrite autrement ouvrirait la table sans que rien le signale.
    const policies = [...sql.matchAll(new RegExp(`create policy ([^;]+? on public\\.${table}\\b[^;]+);`, "g"))];
    expect(policies.length).toBeGreaterThan(0);
    for (const [, body] of policies) {
      expect(body, `politique sans rôle sur ${table} : ${body?.slice(0, 90)}`).toMatch(/\bto authenticated\b|\bto service_role\b/);
    }
  });

  it("n’ouvre aucune politique au rôle anonyme", () => {
    expect(sql).not.toMatch(/create policy[^;]+\bto anon\b/is);
  });

  it("n’expose aucune fonction finance_ ou bank_ au rôle anonyme", () => {
    // Ces fonctions lisent des données bancaires en s'appuyant sur auth.uid() : accessibles
    // sans session, elles s'exécuteraient avec un identifiant nul.
    const granted = [...sql.matchAll(/grant execute on function public\.((?:finance|bank|consume)_[a-z_]+)[^;]*to ([^;]+);/g)];
    expect(granted.length).toBeGreaterThan(5);
    for (const [, name, roles] of granted) {
      expect(roles, `${name} est accordée à ${roles}`).not.toMatch(/\banon\b|\bpublic\b/);
    }
  });
});
