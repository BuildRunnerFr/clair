export interface CategorizationReferenceCase {
  id: string;
  merchant: string;
  description: string;
  amount: number;
  currency: string;
  expectedCategory: string;
  expectedSubcategory: string;
}

// Synthetic/public merchant examples only. Never replace these with exported bank data.
export const CATEGORIZATION_REFERENCE_DATASET: readonly CategorizationReferenceCase[] = [
  { id: "utilities-electricity", merchant: "OVO ENERGY LTD", description: "OVO ENERGY MONTHLY BILL", amount: -82.14, currency: "GBP", expectedCategory: "Utilities", expectedSubcategory: "Electricity" },
  { id: "utilities-water", merchant: "THAMES WATER", description: "THAMES WATER BILL", amount: -38, currency: "GBP", expectedCategory: "Utilities", expectedSubcategory: "Water" },
  { id: "utilities-internet", merchant: "BT BROADBAND", description: "BT BROADBAND", amount: -31.99, currency: "GBP", expectedCategory: "Utilities", expectedSubcategory: "Internet" },
  { id: "utilities-mobile", merchant: "VODAFONE MOBILE", description: "VODAFONE MOBILE PLAN", amount: -18, currency: "EUR", expectedCategory: "Utilities", expectedSubcategory: "Mobile" },
  { id: "subscriptions-streaming", merchant: "NETFLIX", description: "NETFLIX.COM", amount: -12.99, currency: "EUR", expectedCategory: "Subscriptions", expectedSubcategory: "Streaming" },
  { id: "subscriptions-music", merchant: "SPOTIFY", description: "SPOTIFY PREMIUM", amount: -19.9, currency: "MYR", expectedCategory: "Subscriptions", expectedSubcategory: "Music" },
  { id: "subscriptions-software", merchant: "ADOBE CREATIVE CLOUD", description: "ADOBE SOFTWARE PLAN", amount: -59.99, currency: "GBP", expectedCategory: "Subscriptions", expectedSubcategory: "Software" },
  { id: "subscriptions-cloud", merchant: "DROPBOX", description: "DROPBOX CLOUD STORAGE", amount: -11.99, currency: "USD", expectedCategory: "Subscriptions", expectedSubcategory: "Cloud" },
  { id: "health-fitness", merchant: "PUREGYM", description: "PUREGYM MEMBERSHIP", amount: -24.99, currency: "GBP", expectedCategory: "Health", expectedSubcategory: "Fitness" },
  { id: "health-pharmacy", merchant: "BOOTS PHARMACY", description: "BOOTS PHARMACY", amount: -16.5, currency: "GBP", expectedCategory: "Health", expectedSubcategory: "Pharmacy" },
  { id: "transport-uber", merchant: "UBER TRIP", description: "UBER HELP UBER COM", amount: -14.2, currency: "GBP", expectedCategory: "Transport", expectedSubcategory: "Ride Hailing" },
  { id: "transport-grab", merchant: "GRAB", description: "GRAB RIDE", amount: -18.4, currency: "MYR", expectedCategory: "Transport", expectedSubcategory: "Ride Hailing" },
  { id: "transport-public", merchant: "TRANSPORT FOR LONDON", description: "TFL TRAVEL CHARGE", amount: -8.5, currency: "GBP", expectedCategory: "Transport", expectedSubcategory: "Public Transport" },
  { id: "transport-fuel", merchant: "SHELL SERVICE STATION", description: "SHELL FUEL", amount: -65, currency: "EUR", expectedCategory: "Transport", expectedSubcategory: "Fuel" },
  { id: "transport-parking", merchant: "NCP PARKING", description: "NCP CAR PARK", amount: -12, currency: "GBP", expectedCategory: "Transport", expectedSubcategory: "Parking" },
  { id: "travel-flight", merchant: "RYANAIR", description: "RYANAIR FLIGHT", amount: -129.99, currency: "EUR", expectedCategory: "Travel", expectedSubcategory: "Flights" },
  { id: "travel-hotel", merchant: "BOOKING COM", description: "HOTEL RESERVATION", amount: -220, currency: "GBP", expectedCategory: "Travel", expectedSubcategory: "Hotels" },
  { id: "travel-rail", merchant: "EUROSTAR", description: "EUROSTAR TICKET", amount: -95, currency: "EUR", expectedCategory: "Travel", expectedSubcategory: "Rail" },
  { id: "coffee-starbucks", merchant: "STARBUCKS 03842 LONDON", description: "STARBUCKS", amount: -4.8, currency: "GBP", expectedCategory: "Coffee", expectedSubcategory: "Coffee Shop" },
  { id: "food-fast", merchant: "MCDONALDS", description: "MCDONALDS", amount: -9.9, currency: "EUR", expectedCategory: "Food & Drink", expectedSubcategory: "Fast Food" },
  { id: "food-delivery", merchant: "DELIVEROO", description: "DELIVEROO ORDER", amount: -26.4, currency: "GBP", expectedCategory: "Food & Drink", expectedSubcategory: "Delivery" },
  { id: "restaurant", merchant: "NANDOS", description: "NANDOS RESTAURANT", amount: -32, currency: "GBP", expectedCategory: "Restaurants", expectedSubcategory: "Restaurant" },
  { id: "groceries-tesco", merchant: "TESCO", description: "TESCO SUPERMARKET", amount: -54.3, currency: "GBP", expectedCategory: "Groceries", expectedSubcategory: "Supermarket" },
  { id: "groceries-jaya", merchant: "JAYA GROCER", description: "JAYA GROCER SUPERMARKET", amount: -126.7, currency: "MYR", expectedCategory: "Groceries", expectedSubcategory: "Supermarket" },
  { id: "shopping-clothing", merchant: "UNIQLO", description: "UNIQLO CLOTHING", amount: -79.9, currency: "MYR", expectedCategory: "Shopping", expectedSubcategory: "Clothing" },
  { id: "shopping-marketplace", merchant: "AMAZON MARKETPLACE", description: "AMAZON MARKETPLACE ORDER", amount: -42, currency: "GBP", expectedCategory: "Shopping", expectedSubcategory: "Marketplace" },
  { id: "tax-local", merchant: "COUNCIL TAX", description: "LOCAL COUNCIL TAX", amount: -145, currency: "GBP", expectedCategory: "Taxes", expectedSubcategory: "Local Tax" },
  { id: "insurance-vehicle", merchant: "AVIVA CAR INSURANCE", description: "VEHICLE INSURANCE", amount: -55, currency: "GBP", expectedCategory: "Insurance", expectedSubcategory: "Vehicle" },
  { id: "income-salary", merchant: "SALARY PAYMENT", description: "MONTHLY SALARY", amount: 3200, currency: "GBP", expectedCategory: "Income", expectedSubcategory: "Salary" },
  { id: "donation-charity", merchant: "JUSTGIVING", description: "CHARITY DONATION", amount: -25, currency: "GBP", expectedCategory: "Gifts & Donations", expectedSubcategory: "Charity" }
] as const;
