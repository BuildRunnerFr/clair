import { describe, expect, it, vi } from "vitest";
import { mutationOriginError, readSmallJson } from "@/lib/security/requests";
import { isOldEnough } from "@/lib/profile/profile";
const request = (headers: Record<string, string> = {}, body = "{}") => new Request("https://clairfinances.com/api/assistant", { method: "POST", headers, body });
describe("origine des mutations à cookies", () => {
  it.each(["https://evil.example", "https://clairfinances.com.evil.example", "null", "http://clairfinances.com"])("rejette %s", origin => {
    expect(mutationOriginError(request({ origin, cookie: "session=test" }))?.status).toBe(403);
  });
  it("accepte une requête de la même origine", () => expect(mutationOriginError(request({ origin: "https://clairfinances.com", cookie: "session=test" }))).toBeNull());
  it("refuse un sous-domaine et les cookies sans preuve d’origine", () => {
    expect(mutationOriginError(request({ "sec-fetch-site": "same-site" }))?.status).toBe(403);
    expect(mutationOriginError(request({ cookie: "session=test" }))?.status).toBe(403);
    expect(mutationOriginError(request({ cookie: "session=test", "sec-fetch-site": "same-origin" }))).toBeNull();
  });
});
describe("corps JSON bornés", () => {
  it("refuse le texte de formulaire et les gros corps même sans Content-Length", async () => {
    expect(await readSmallJson(request({ "content-type": "text/plain" }))).toBeNull();
    expect(await readSmallJson(request({ "content-type": "application/json" }, JSON.stringify({ question: "x".repeat(17000) })))).toBeNull();
  });
  it("accepte un JSON petit et refuse un JSON cassé", async () => {
    expect(await readSmallJson(request({ "content-type": "application/json; charset=utf-8" }, '{"question":"Bonjour"}'))).toEqual({ question: "Bonjour" });
    expect(await readSmallJson(request({ "content-type": "application/json" }, '{'))).toBeNull();
  });
});
it("ne normalise pas une date impossible en date de naissance valide", () => expect(isOldEnough("1990-02-31")).toBe(false));
