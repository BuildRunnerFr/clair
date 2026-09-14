import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Le site vitrine doit avoir un style pour chaque classe qu'il pose.
 *
 * Ce test existe pour la même raison que son voisin sur la mise en page mobile : une feuille de
 * style n'a pas de compilateur. J'ai réécrit la page d'accueil section par section, le typage
 * est passé, le rendu est parti — et une bonne moitié de la page s'affichait sans mise en forme,
 * parce que les classes du balisage n'avaient encore aucune règle en face. Rien, dans l'outillage,
 * ne signale une classe orpheline.
 *
 * La seconde vérification est plus sournoise. Le thème sombre relève l'accent en bleu clair ;
 * une encre blanche écrite en dur par-dessus tombait à 2,5 pour un, c'est-à-dire au-dessous du
 * seuil de lisibilité, sur le bouton principal de toute l'application. L'encre à poser sur
 * l'accent est un jeton, et doit le rester.
 */
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const sources = ["../app/page.tsx", "../components/landing-preview.tsx", "../components/landing-nav.tsx"]
  .map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");

/** Les classes littérales du balisage, `className="a b"` comme `? "a" : "b"`. */
function classesUsed(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(/className=(?:"([^"]*)"|\{[^}]*\})/g)) {
    const attribute = match[0];
    for (const literal of attribute.matchAll(/"([^"]*)"/g)) {
      for (const name of literal[1].split(/\s+/)) if (name) found.add(name);
    }
  }
  return [...found];
}

describe("le site vitrine est habillé", () => {
  it("donne une règle à chaque classe posée dans le balisage", () => {
    const orphans = classesUsed(sources).filter((name) => !new RegExp(`\\.${name}[^a-zA-Z0-9_-]`).test(css));
    expect(orphans).toEqual([]);
  });

  it("garde ses sections dans la colonne commune", () => {
    // Le fond des bandes traverse la fenêtre, leur contenu non : chaque enveloppe doit figurer
    // dans la liste qui porte la mesure, faute de quoi sa section se colle aux bords.
    const container = css.match(/([^}]*)\{\s*\n?\s*width: min\(1120px, 100%\); margin-inline: auto; padding-inline: var\(--s5\);/);
    expect(container).not.toBeNull();
    for (const selector of [".landing-bar-inner", ".landing-hero", ".landing-banks", ".landing-section",
      ".landing-security-inner", ".landing-final-inner", ".landing-footer-inner"]) {
      expect(container![1]).toContain(selector);
    }
  });

  it("n’écrit jamais d’encre blanche en dur sur l’accent", () => {
    const onAccent = [...css.matchAll(/background: var\(--green(?:-strong)?\);\s*color: ([^;]+);/g)];
    expect(onAccent.length).toBeGreaterThan(3);
    for (const match of onAccent) expect(match[1].trim()).toBe("var(--invert-ink)");
  });

  it("garde l’encre discrète lisible sur toutes les surfaces, dans les deux thèmes", () => {
    /* Les valeurs sont relues dans la feuille plutôt qu'écrites ici : un jeton de surface qu'on
       éclaircit doit faire échouer ce test, pas passer inaperçu. Le premier bloc « :root » porte
       le thème clair, le second — celui de la préférence système — le thème sombre.

       Ce test a été élargi après coup : il ne couvrait que trois fonds, et --muted tombait à 4,41
       sur le vert pâle et 4,39 sur le rouge pâle, deux surfaces qui ne portent que du petit
       texte. Le panneau sombre est exclu parce qu'il a son encre à lui, --panel-muted. */
    const SURFACES = ["paper", "card", "raised", "sunken", "green-soft", "gold-soft", "warn-soft", "danger-soft"];
    for (const [theme, block] of Object.entries(themeBlocks())) {
      const muted = token(block, "muted");
      expect(muted, `--muted absent du thème ${theme}`).toBeDefined();
      let checked = 0;
      for (const surface of SURFACES) {
        const background = token(block, surface);
        if (!background) continue;
        checked++;
        expect(contrast(muted!, background), `--muted sur --${surface} (${theme})`).toBeGreaterThanOrEqual(4.5);
      }
      // Sans ce compte, une expression de découpage cassée ferait passer le test en ne
      // vérifiant rien : toutes les surfaces seraient introuvables, et la boucle vide.
      expect(checked, `surfaces trouvées dans le thème ${theme}`).toBe(SURFACES.length);
      const panel = token(block, "panel-bg"), panelInk = token(block, "panel-muted");
      if (panel && panelInk) expect(contrast(panelInk, panel), `--panel-muted (${theme})`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Le bloc clair et le bloc sombre, découpés sur leurs sélecteurs respectifs. */
function themeBlocks(): Record<string, string> {
  const light = css.slice(css.indexOf(":root {"), css.indexOf("@media (prefers-color-scheme: dark)"));
  const dark = css.slice(css.indexOf(':root:not([data-theme="light"])'), css.indexOf(":root[data-theme=\"dark\"]"));
  return { clair: light, sombre: dark };
}

function token(block: string, name: string): string | undefined {
  return new RegExp(`--${name}: (#[0-9a-f]{6});`).exec(block)?.[1];
}
