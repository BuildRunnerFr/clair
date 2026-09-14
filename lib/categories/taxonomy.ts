import { z } from "zod";

export const CATEGORY_TAXONOMY = {
  Housing: ["Rent", "Mortgage", "Maintenance", "Other"],
  Groceries: ["Supermarket", "Convenience Store", "Market", "Other"],
  Transport: ["Ride Hailing", "Public Transport", "Fuel", "Parking", "Taxi", "Flights", "Other"],
  "Food & Drink": ["Restaurant", "Fast Food", "Coffee", "Delivery", "Other"],
  Restaurants: ["Restaurant", "Fast Food", "Delivery", "Other"],
  Coffee: ["Coffee Shop", "Other"],
  Shopping: ["Clothing", "Electronics", "Marketplace", "Home", "Other"],
  Subscriptions: ["Streaming", "Software", "Music", "Cloud", "Membership", "Other"],
  Travel: ["Flights", "Hotels", "Rail", "Activities", "Other"],
  Health: ["Medical", "Pharmacy", "Dental", "Fitness", "Other"],
  Entertainment: ["Cinema", "Games", "Events", "Books", "Other"],
  Utilities: ["Electricity", "Gas", "Water", "Internet", "Mobile", "Other"],
  Education: ["Tuition", "Courses", "Books", "Other"],
  "Personal Care": ["Hair", "Beauty", "Wellness", "Other"],
  Insurance: ["Home", "Health", "Vehicle", "Travel", "Other"],
  "Financial Services": ["Bank Fees", "Interest", "Investment", "Other"],
  Taxes: ["Income Tax", "Local Tax", "Other"],
  "Gifts & Donations": ["Gifts", "Charity", "Other"],
  Income: ["Salary", "Refund", "Interest", "Other"],
  Transfers: ["Internal Transfer", "Bank Transfer", "Other"],
  Other: ["Other"],
  Uncategorized: ["Other"]
} as const;

export type CategoryName = keyof typeof CATEGORY_TAXONOMY;
export const CATEGORY_NAMES = Object.keys(CATEGORY_TAXONOMY) as CategoryName[];
export const categorySchema = z.enum(CATEGORY_NAMES as [CategoryName, ...CategoryName[]]);

export function isAllowedCategory(category: string, subcategory: string): category is CategoryName {
  return category in CATEGORY_TAXONOMY && (CATEGORY_TAXONOMY[category as CategoryName] as readonly string[]).includes(subcategory);
}

export function subcategoriesFor(category: CategoryName): readonly string[] {
  return CATEGORY_TAXONOMY[category];
}
