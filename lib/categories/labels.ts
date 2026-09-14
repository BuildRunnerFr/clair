import type { CategoryName } from "./taxonomy";
const FR: Record<CategoryName, string> = {
  Housing: "Logement", Groceries: "Courses", Transport: "Transport", "Food & Drink": "Repas et boissons",
  Restaurants: "Restaurants", Coffee: "Cafés", Shopping: "Achats", Subscriptions: "Abonnements",
  Travel: "Voyages", Health: "Santé", Entertainment: "Loisirs", Utilities: "Factures",
  Education: "Éducation", "Personal Care": "Soins personnels", Insurance: "Assurances",
  "Financial Services": "Services financiers", Taxes: "Impôts", "Gifts & Donations": "Cadeaux et dons",
  Income: "Revenus", Transfers: "Virements", Other: "Autres", Uncategorized: "À catégoriser"
};
export function categoryLabel(category: string, locale: string) {
  return locale.startsWith("fr") ? FR[category as CategoryName] ?? category : category;
}

const SUBCATEGORIES_FR: Record<string, string> = {
  Rent: "Loyer", Mortgage: "Crédit immobilier", Maintenance: "Entretien", Other: "Autres",
  Supermarket: "Supermarché", "Convenience Store": "Épicerie", Market: "Marché",
  "Ride Hailing": "VTC", "Public Transport": "Transports en commun", Fuel: "Carburant", Parking: "Stationnement", Taxi: "Taxi", Flights: "Vols",
  Restaurant: "Restaurant", "Fast Food": "Restauration rapide", Coffee: "Café", Delivery: "Livraison", "Coffee Shop": "Café",
  Clothing: "Vêtements", Electronics: "Électronique", Marketplace: "Place de marché", Home: "Maison",
  Streaming: "Streaming", Software: "Logiciels", Music: "Musique", Cloud: "Stockage en ligne", Membership: "Adhésion",
  Hotels: "Hôtels", Rail: "Train", Activities: "Activités", Medical: "Consultations", Pharmacy: "Pharmacie", Dental: "Dentaire", Fitness: "Sport",
  Cinema: "Cinéma", Games: "Jeux", Events: "Événements", Books: "Livres", Electricity: "Électricité", Gas: "Gaz", Water: "Eau", Internet: "Internet", Mobile: "Téléphone",
  Tuition: "Scolarité", Courses: "Formation", Hair: "Coiffure", Beauty: "Beauté", Wellness: "Bien-être", Health: "Santé", Vehicle: "Véhicule", Travel: "Voyage",
  "Bank Fees": "Frais bancaires", Interest: "Intérêts", Investment: "Investissement", "Income Tax": "Impôt sur le revenu", "Local Tax": "Impôts locaux", Gifts: "Cadeaux", Charity: "Dons",
  Salary: "Salaire", Refund: "Remboursement", "Internal Transfer": "Virement interne", "Bank Transfer": "Virement bancaire"
};
export function subcategoryLabel(value: string, locale: string) {
  return locale.startsWith("fr") ? SUBCATEGORIES_FR[value] ?? value : value;
}
