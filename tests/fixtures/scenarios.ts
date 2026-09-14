import type { Movement, ScenarioInput } from "./build-summary";

/**
 * Neuf situations, choisies pour ce qu'elles cassent.
 *
 * Un jeu d'essai n'a pas d'intérêt s'il ne montre que le cas heureux : c'est aux bords qu'une
 * interface se déchire — un mois sans rien, un solde négatif, un nom de marchand qui fait
 * quatre-vingts caractères, un montant à six chiffres, une devise qui n'est pas celle du compte.
 */
const TODAY = new Date("2026-09-15T12:00:00Z");

/** Une année d'opérations ordinaires, pour que les comparaisons et la prévision aient de quoi. */
function year(options: { salary?: number; rent?: number; noise?: number } = {}): Movement[] {
  const rows: Movement[] = [];
  const { salary = 2450, rent = 780, noise = 1 } = options;
  for (let back = 13; back >= 0; back--) {
    const date = new Date(Date.UTC(2026, 8 - back, 1));
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    if (salary) {
      rows.push({ date: `${month}-28`, merchant: "SALAIRE MENSUEL", amount: salary, category: "Income", subcategory: "Salary", recurring: true });
      // Une entrée en début de mois aussi : sans elle, un jeu d'essai arrêté au quinze n'aurait
      // jamais de revenu encaissé, et la carte des flux ne serait jamais éprouvée qu'à zéro.
      rows.push({ date: `${month}-04`, merchant: "CAF", amount: 292, category: "Income", subcategory: "Other" });
    }
    if (rent) rows.push({ date: `${month}-05`, merchant: "LOYER RESIDENCE", amount: -rent, category: "Housing", subcategory: "Rent", recurring: true });
    rows.push({ date: `${month}-08`, merchant: "SPOTIFY", amount: -11.99, category: "Subscriptions", subcategory: "Streaming", recurring: true });
    rows.push({ date: `${month}-12`, merchant: "SFR MOBILE", amount: -24.99, category: "Utilities", subcategory: "Mobile", recurring: true });
    // Le quotidien varie d'un mois à l'autre : c'est cette variation qui donne sa largeur à la
    // bande de la prévision, et une variation nulle la rendrait faussement rassurante.
    const swing = [1, 1.4, 0.7, 1.2, 0.85, 1.6, 0.9, 1.1, 1.3, 0.75, 1.05, 1.5, 0.95, 1.2][back % 14] * noise;
    for (const [day, merchant, amount, category] of [
      [3, "CARREFOUR MARKET", -84.2, "Groceries"], [7, "BOULANGERIE MARTIN", -12.4, "Groceries"],
      [9, "TOTAL ENERGIES", -62.5, "Transport"], [14, "LE COMPTOIR", -38.9, "Restaurants"],
      [17, "PHARMACIE DU CENTRE", -24.1, "Health"], [21, "MONOPRIX", -97.3, "Groceries"],
      [24, "SNCF CONNECT", -45, "Transport"], [27, "AMAZON", -56.8, "Shopping"]
    ] as const) {
      rows.push({ date: `${month}-${String(day).padStart(2, "0")}`, merchant, amount: Math.round(amount * swing * 100) / 100, category });
    }
  }
  return rows.filter((row) => row.date <= "2026-09-15");
}

export const SCENARIOS: ScenarioInput[] = [
  {
    name: "salarie-regulier",
    today: TODAY,
    accounts: [{ id: "a1", name: "Compte courant", currency: "EUR", balance: 2418.36, overdraft: 500 }],
    movements: year(),
    budgets: [{ category: "Groceries", limit: 400 }, { category: "Restaurants", limit: 150 }, { category: "Transport", limit: 120 }]
  },
  {
    name: "sans-revenu-detecte",
    today: TODAY,
    // Le cas réel : tout ce qui entre porte un libellé de virement, rien n'est reconnu comme
    // récurrent, et une prévision de solde n'aurait aucun sens.
    accounts: [{ id: "a1", name: "Camille Martin", currency: "EUR", balance: 301.67 }],
    movements: [
      ...year({ salary: 0, rent: 0, noise: 1.8 }),
      { date: "2026-09-04", merchant: "FROM CAF", amount: 292, category: "Transfers" },
      { date: "2026-08-05", merchant: "FROM CAF", amount: 463.82, category: "Transfers" }
    ],
    budgets: [{ category: "Restaurants", limit: 200 }]
  },
  {
    name: "decouvert",
    today: TODAY,
    accounts: [{ id: "a1", name: "Compte courant", currency: "EUR", balance: -342.18, overdraft: 800, available: 457.82 }],
    movements: year({ salary: 0, rent: 950, noise: 1.7 }),
    budgets: [{ category: "Groceries", limit: 250 }]
  },
  {
    name: "premier-mois",
    today: new Date("2026-09-03T12:00:00Z"),
    // Trois jours d'existence : aucun mois de comparaison, aucune tendance, aucune prévision.
    accounts: [{ id: "a1", name: "Compte courant", currency: "EUR", balance: 1204.5 }],
    movements: [
      { date: "2026-09-01", merchant: "CARREFOUR MARKET", amount: -42.18, category: "Groceries" },
      { date: "2026-09-02", merchant: "SPOTIFY", amount: -11.99, category: "Subscriptions" },
      { date: "2026-09-03", merchant: "BOULANGERIE MARTIN", amount: -3.2, category: "Groceries", pending: true }
    ]
  },
  {
    name: "mois-vide",
    today: TODAY,
    // Un mois sans la moindre dépense : tous les agrégats valent zéro, et chaque carte doit
    // savoir le dire sans afficher « NaN » ni un tiret muet.
    accounts: [{ id: "a1", name: "Compte courant", currency: "EUR", balance: 5000 }],
    movements: year().filter((row) => !row.date.startsWith("2026-09")),
    budgets: [{ category: "Groceries", limit: 400 }]
  },
  {
    name: "multi-devises",
    today: TODAY,
    accounts: [
      { id: "a1", name: "Compte courant", currency: "EUR", balance: 1840.22 },
      { id: "a2", name: "Compte Londres", currency: "GBP", balance: 620.5 },
      { id: "a3", name: "Livret A", currency: "EUR", balance: 12400 }
    ],
    movements: [
      ...year(),
      { date: "2026-09-10", merchant: "TESCO EXPRESS", amount: -34.2, category: "Groceries", currency: "GBP" },
      { date: "2026-09-11", merchant: "TFL TRAVEL CHARGE", amount: -8.9, category: "Transport", currency: "GBP" }
    ],
    budgets: [{ category: "Groceries", limit: 400 }]
  },
  {
    name: "libelles-extremes",
    today: TODAY,
    accounts: [{ id: "a1", name: "Compte de dépôt professionnel principal — succursale", currency: "EUR", balance: 187423.91 }],
    movements: [
      ...year({ salary: 12500, rent: 3200 }),
      { date: "2026-09-09", merchant: "ASSURANCES DU LITTORAL EUI FRANCE INTERMEDIAIRE SERVICES LIMITED DIRECT", amount: -1284.57, category: "Insurance" },
      { date: "2026-09-10", merchant: "SÀRL ÉTABLISSEMENTS MÜLLER & FILS — DÉPÔT N°4", amount: -98765.43, category: "Other" },
      { date: "2026-09-11", merchant: "A", amount: -0.01, category: "Other" }
    ],
    budgets: [{ category: "Insurance", limit: 1000 }]
  },
  {
    name: "budgets-depasses",
    today: TODAY,
    accounts: [{ id: "a1", name: "Compte courant", currency: "EUR", balance: 640.11 }],
    movements: year({ noise: 1.9 }),
    budgets: [
      { category: "Groceries", limit: 120 }, { category: "Restaurants", limit: 40 },
      { category: "Transport", limit: 60 }, { category: "Shopping", limit: 30 }, { category: "Health", limit: 20 }
    ]
  },
  {
    name: "multi-banques",
    today: TODAY,
    accounts: [
      { id: "a1", name: "Société Générale", currency: "EUR", balance: 3120.4, overdraft: 1000 },
      { id: "a2", name: "Revolut", currency: "EUR", balance: 218.75 },
      { id: "a3", name: "Livret A", currency: "EUR", balance: 8400 },
      { id: "a4", name: "Compte joint", currency: "EUR", balance: 1560.9 }
    ],
    movements: [
      ...year(),
      { date: "2026-09-06", merchant: "VIREMENT INTERNE", amount: -500, category: "Transfers", account: "a1" },
      { date: "2026-09-06", merchant: "VIREMENT INTERNE", amount: 500, category: "Transfers", account: "a3" }
    ],
    budgets: [{ category: "Groceries", limit: 500 }, { category: "Housing", limit: 900 }]
  }
];
