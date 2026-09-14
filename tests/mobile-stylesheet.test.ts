import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * La feuille de style garde ce qui rend l'application utilisable au doigt.
 *
 * Ce test existe parce que rien ne m'a arrêté : en supprimant les styles d'une page devenue
 * inutile, j'ai emporté le bloc mobile entier — barre d'onglets en bas, colonne unique,
 * lisibilité des graphiques, cibles tactiles. Les accolades restaient équilibrées, le typage
 * passait, les trois cent soixante-huit tests passaient, le déploiement réussissait. Le seul
 * signal a été une capture d'écran envoyée par l'utilisateur quarante minutes plus tard, montrant
 * un téléphone qui affichait la mise en page d'un ordinateur : deux colonnes de données
 * imbriquées et illisibles.
 *
 * Une feuille de style n'a pas de compilateur. Ces quelques affirmations en tiennent lieu pour
 * ce qui ne doit jamais disparaître par accident.
 */
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

/** Une déclaration présente dans un bloc `@media` de largeur maximale, quel qu'il soit. */
function inMobileBlock(declaration: string): boolean {
  const blocks = [...css.matchAll(/@media \(max-width: \d+px\)\s*\{/g)];
  return blocks.some((match) => {
    let depth = 0;
    for (let index = match.index!; index < css.length; index++) {
      if (css[index] === "{") depth++;
      else if (css[index] === "}") {
        depth--;
        if (depth === 0) return css.slice(match.index!, index).includes(declaration);
      }
    }
    return false;
  });
}

describe("la feuille garde sa mise en page mobile", () => {
  it("équilibre ses accolades", () => {
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(clean.split("{").length).toBe(clean.split("}").length);
  });

  it("pose la navigation en bas de l’écran", () => {
    expect(inMobileBlock("position: fixed; inset: auto 0 0 0")).toBe(true);
    expect(inMobileBlock(".main-nav")).toBe(true);
  });

  it("replie la grille sur une seule colonne", () => {
    // Sans cette règle, un téléphone reçoit la grille à douze colonnes du bureau : deux colonnes
    // de données de cent quatre-vingts pixels, imbriquées et illisibles.
    expect(inMobileBlock(".metric, .wide, .side { grid-column: 1 / -1; }")).toBe(true);
  });

  it("réserve la place des bandes système", () => {
    expect(css).toContain("env(safe-area-inset-top)");
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain("--tabbar:");
  });

  it("grossit les étiquettes des graphiques, qui se réduisent avec leur cadre", () => {
    expect(inMobileBlock(".chart-axis { font-size:")).toBe(true);
  });

  it("porte les cibles tactiles au-dessus de quarante pixels", () => {
    expect(inMobileBlock(".theme-option { min-width: 44px")).toBe(true);
    expect(inMobileBlock(".small-button, .danger-button { min-height: 44px")).toBe(true);
  });

  it("aplatit les listes répétées en sections", () => {
    expect(inMobileBlock('.grid > .card:not(.metric):not([data-tour="balances"])')).toBe(true);
  });

  it("ne déclare aucune classe que personne n’emploie", async () => {
    const { execSync } = await import("node:child_process");
    // `--others --exclude-standard` compte aussi les fichiers pas encore indexés : sans cela, une
    // page neuve écrite mais pas encore ajoutée fait échouer le test sur des classes qu'elle
    // emploie pourtant, et on cherche le défaut dans la feuille de style.
    const sources = execSync("cat $(git ls-files --cached --others --exclude-standard '*.tsx' '*.ts' | grep -v '^tests/')", { encoding: "utf8", cwd: new URL("..", import.meta.url).pathname });
    // Ces deux familles se construisent par interpolation : `budget-${niveau}`, `chat-${rôle}`.
    const built = new Set(["budget-over", "budget-warning", "budget-ok", "budget-none", "chat-user", "chat-assistant"]);
    const declared = [...new Set([...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/\.([a-z][a-z0-9-]{2,})/g)].map((m) => m[1]!))];
    const orphans = declared.filter((name) => !built.has(name) && !sources.includes(name));
    expect(orphans, `classes sans usage : ${orphans.join(", ")}`).toEqual([]);
  });
});
