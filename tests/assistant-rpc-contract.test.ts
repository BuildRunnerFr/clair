import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Chaque fonction SQL appelée doit exister, avec les paramètres employés.
 *
 * C'est le défaut que rien n'attrapait. Un nom de fonction mal orthographié, un paramètre
 * renommé dans une migration, un « p_month » écrit « p_mois » : le typage laisse passer — les
 * arguments d'une RPC sont un objet libre — et l'erreur ne se voit qu'à l'exécution, sur le
 * compte d'un utilisateur, sous la forme d'un assistant qui répond « la requête a échoué ».
 *
 * Le test lit les migrations et les appels, et les confronte. Il ne prouve pas que la réponse
 * est juste ; il prouve que la question est posable.
 */
const racine = new URL("../", import.meta.url);
const sql = readdirSync(new URL("supabase/migrations", racine))
  .filter((nom) => nom.endsWith(".sql"))
  .map((nom) => readFileSync(new URL(`supabase/migrations/${nom}`, racine), "utf8"))
  .join("\n");

/** Les paramètres déclarés pour une fonction, dans la dernière migration qui la définit. */
function parametresDeclares(fonction: string): Set<string> {
  const declarations = [...sql.matchAll(new RegExp(`create or replace function public\\.${fonction}\\s*\\(([^)]*)\\)`, "g"))];
  const derniere = declarations.at(-1);
  if (!derniere) return new Set();
  return new Set([...derniere[1]!.matchAll(/\b(p_[a-z_]+)\b/g)].map((m) => m[1]!));
}

const sources = ["lib/ai/assistant/finance-tools.ts", "lib/db/supabase-analytics-repository.ts"]
  .map((chemin) => ({ chemin, code: readFileSync(new URL(chemin, racine), "utf8") }));

describe("les appels aux fonctions SQL", () => {
  it("ne visent que des fonctions déclarées par une migration", () => {
    for (const { chemin, code } of sources) {
      for (const appel of code.matchAll(/\.rpc\("([a-z_]+)"/g)) {
        const nom = appel[1]!;
        expect(sql, `${chemin} appelle ${nom}`).toContain(`function public.${nom}`);
      }
    }
  });

  it("n’emploient que des paramètres qui existent", () => {
    for (const { chemin, code } of sources) {
      for (const appel of code.matchAll(/\.rpc\("([a-z_]+)",\s*\{([^}]*)\}/g)) {
        const nom = appel[1]!;
        const declares = parametresDeclares(nom);
        if (!declares.size) continue;
        for (const employe of appel[2]!.matchAll(/\b(p_[a-z_]+)\s*:/g)) {
          expect(declares, `${chemin} · ${nom}(${employe[1]})`).toContain(employe[1]!);
        }
      }
    }
  });

  it("ne lit que des colonnes existantes sur les tables interrogées directement", () => {
    const types = readFileSync(new URL("types/supabase.ts", racine), "utf8");
    const code = readFileSync(new URL("lib/ai/assistant/finance-tools.ts", racine), "utf8");
    for (const requete of code.matchAll(/\.from\("([a-z_]+)"\)\s*\n?\s*\.select\("([^"]+)"\)/g)) {
      const [table, colonnes] = [requete[1]!, requete[2]!];
      const bloc = new RegExp(`${table}: \\{[\\s\\S]*?Row: \\{([\\s\\S]*?)\\}`).exec(types);
      expect(bloc, `table ${table} absente des types`).not.toBeNull();
      for (const colonne of colonnes.split(",").map((c) => c.trim()).filter(Boolean)) {
        expect(bloc![1], `${table}.${colonne}`).toContain(`${colonne}:`);
      }
    }
  });
});
