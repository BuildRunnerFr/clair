import { describe, expect, it } from "vitest";
import { createTranslate, isLocale, negotiateLocale } from "@/lib/i18n/catalogue";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";

describe("traduction", () => {
  const t = createTranslate({ "budgets.title": "Budgets mensuels", "budgets.left": "Il reste {count} jours" });

  it("rend le texte de la clé", () => {
    expect(t("budgets.title")).toBe("Budgets mensuels");
  });

  it("remplace les marques par leurs valeurs", () => {
    expect(t("budgets.left", { count: 12 })).toBe("Il reste 12 jours");
  });

  it("laisse une marque sans valeur plutôt que de l’effacer", () => {
    // « Il reste  jours » est grammaticalement correct et faux : on ne le remarquerait pas.
    expect(t("budgets.left")).toBe("Il reste {count} jours");
    expect(t("budgets.left", { autre: 1 })).toBe("Il reste {count} jours");
  });

  it("rend la clé quand elle manque, pour que l’oubli se voie", () => {
    // Un vide passe inaperçu jusqu'à ce qu'un utilisateur le signale ; une clé affichée se
    // remarque à la première relecture de l'écran.
    expect(t("budgets.absent")).toBe("budgets.absent");
  });

  it("se replie sur le catalogue de secours avant de rendre la clé", () => {
    const partial = createTranslate({ "a.b": "traduit" }, { "a.b": "français", "c.d": "secours" });
    expect(partial("a.b")).toBe("traduit");
    expect(partial("c.d")).toBe("secours");
  });
});

describe("choix de la langue", () => {
  it("retient la première langue connue annoncée", () => {
    expect(negotiateLocale("en-GB,en;q=0.9,fr;q=0.8")).toBe("en");
    expect(negotiateLocale("fr-FR,fr;q=0.9")).toBe("fr");
  });

  it("ignore les langues qu’on ne traduit pas", () => {
    expect(negotiateLocale("de-DE,de;q=0.9,en;q=0.5")).toBe("en");
  });

  it("retombe sur le français faute d’en-tête exploitable", () => {
    expect(negotiateLocale(null)).toBe("fr");
    expect(negotiateLocale("")).toBe("fr");
    expect(negotiateLocale("de,es,it")).toBe("fr");
  });

  it("reconnaît les codes valides", () => {
    expect(isLocale("fr")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isLocale(42)).toBe(false);
  });
});

describe("catalogues", () => {
  it("couvrent les mêmes clés", () => {
    // Une clé traduite d'un seul côté produit un mélange de langues sur le même écran, ce qui
    // se voit bien plus qu'une traduction absente.
    const frKeys = Object.keys(fr).sort();
    const enKeys = Object.keys(en).sort();
    expect(enKeys).toEqual(frKeys);
  });

  it("ne contiennent aucune séquence d’échappement littérale", () => {
    // Constaté en production : « \u201cHow much… » s'affichait tel quel, un anti-slash de trop
    // ayant transformé le guillemet en texte. Invisible au relecteur francophone.
    for (const [key, value] of [...Object.entries(fr), ...Object.entries(en)]) {
      expect(value, `échappement littéral : ${key}`).not.toMatch(/\\u[0-9a-fA-F]{4}/);
    }
  });

  it("n’ont aucune valeur vide", () => {
    for (const [key, value] of [...Object.entries(fr), ...Object.entries(en)]) {
      expect(value, `clé vide : ${key}`).not.toBe("");
    }
  });

  it("emploient les mêmes marques de part et d’autre", () => {
    // Une marque oubliée dans une traduction fait disparaître un nombre de la phrase.
    const marks = (value: string) => (value.match(/\{(\w+)\}/g) ?? []).sort();
    for (const key of Object.keys(fr)) {
      expect(marks((en as Record<string, string>)[key]!), `marques différentes : ${key}`)
        .toEqual(marks((fr as Record<string, string>)[key]!));
    }
  });
});
