import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getClaims: async () => ({ data: null }) } }) }));
vi.mock("@/lib/supabase/env", () => ({ getSupabaseEnv: () => ({ url: "https://example.supabase.co", publishableKey: "test" }) }));
import { updateSession } from "@/lib/supabase/proxy";

describe("navigation sans session", () => {
  it.each(["/dashboard", "/transactions", "/budgets", "/assistant", "/compte", "/compte/mot-de-passe", "/bienvenue"])("conserve la destination et les filtres pour %s", async (path) => {
    const response = await updateSession(new NextRequest(`https://clairfinances.com${path}?month=2026-09`));
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe(`${path}?month=2026-09`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
  it.each(["/", "/gestion-budget", "/login", "/dashboard-example"])("laisse accessible %s", async (path) => {
    const response = await updateSession(new NextRequest(`https://clairfinances.com${path}`));
    expect(response.headers.get("location")).toBeNull();
  });
});

it("ne met pas en cache les routes d’API", async () => {
  const response = await updateSession(new NextRequest("https://clairfinances.com/api/assistant"));
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
});
