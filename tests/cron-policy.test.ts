import { describe, expect, it } from "vitest";
import { CRON_STALE_HOURS, isCronAuthorized, staleBefore } from "@/lib/banking/cron-policy";

describe("autorisation d’une exécution planifiée", () => {
  it("accepte le secret attendu", () => {
    expect(isCronAuthorized("Bearer s3cret-attendu", "s3cret-attendu")).toBe(true);
    expect(isCronAuthorized("bearer s3cret-attendu", "s3cret-attendu")).toBe(true);
  });

  it("refuse tout quand aucun secret n’est configuré", () => {
    // Une variable oubliée doit faire échouer la tâche de façon visible, jamais ouvrir la route
    // à tout le monde en silence — elle agit sur les comptes de tous les utilisateurs.
    expect(isCronAuthorized("Bearer n’importe quoi", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer n’importe quoi", "")).toBe(false);
    expect(isCronAuthorized("Bearer n’importe quoi", "   ")).toBe(false);
  });

  it("refuse un secret faux, absent ou mal formé", () => {
    expect(isCronAuthorized("Bearer mauvais", "attendu")).toBe(false);
    expect(isCronAuthorized("attendu", "attendu")).toBe(false); // sans le préfixe Bearer
    expect(isCronAuthorized(null, "attendu")).toBe(false);
    expect(isCronAuthorized("", "attendu")).toBe(false);
  });

  it("refuse un préfixe du bon secret", () => {
    expect(isCronAuthorized("Bearer attend", "attendu")).toBe(false);
    expect(isCronAuthorized("Bearer attendu-et-plus", "attendu")).toBe(false);
  });
});

describe("fraîcheur d’une connexion", () => {
  it("remonte de la durée prévue", () => {
    const now = new Date("2026-09-04T12:00:00Z");
    expect(staleBefore(now).toISOString()).toBe("2026-09-04T06:00:00.000Z");
    expect(CRON_STALE_HOURS).toBe(6);
  });
});
