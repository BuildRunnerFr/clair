/**
 * A token accepted by nobody, for a fraction of a second.
 *
 * Supabase signs an access token with the issuing node's clock, and the node validating it
 * tolerates no skew on `iat`. When the very first request follows the login by milliseconds —
 * which is exactly what `/auth/confirm` → `/dashboard` does — a validator running a hair
 * behind sees a token issued in the future and rejects it. The session is valid; it is simply
 * not yet valid *there*.
 *
 * The condition disappears on its own within a second, which is why reloading the page always
 * worked. Absorbing it once at login is better than retrying in every reader, because the
 * error can surface on any query and only this moment knows a token was just minted.
 */
const NOT_YET_VALID = /issued at future|not yet valid|token used before issued/i;

export function isTokenNotYetValid(error: unknown): boolean {
  if (!error) return false;
  const message = typeof error === "string" ? error : (error as { message?: string }).message ?? "";
  return NOT_YET_VALID.test(message);
}

/**
 * Polls a cheap authenticated read until the freshly issued token is accepted.
 *
 * Only retries the clock-skew signature: any other failure returns immediately, so a genuine
 * authorisation problem is never hidden behind a delay. Returns whether the session became
 * usable — a caller should continue regardless, since the next page will surface a real
 * problem far better than a login that refuses to complete.
 */
export async function waitForSessionReady(
  // PromiseLike et non Promise : le constructeur de requête Supabase est un thenable,
  // pas une Promise complète.
  probe: () => PromiseLike<{ error: unknown }>,
  { attempts = 4, delayMs = 200 }: { attempts?: number; delayMs?: number } = {}
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const { error } = await probe();
    if (!error) return true;
    if (!isTokenNotYetValid(error)) return false;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}
