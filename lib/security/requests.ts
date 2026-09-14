/** Les API à cookies ne doivent accepter aucune mutation initiée par une autre origine. */
export function mutationOriginError(request: Request): Response | null {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  const ownOrigin = new URL(request.url).origin;
  if ((origin !== null && origin !== ownOrigin) || site === "cross-site" || site === "same-site"
    || (request.headers.has("cookie") && origin === null && site !== "same-origin")) {
    return Response.json({ error: "origin_not_allowed" }, { status: 403 });
  }
  return null;
}

/** Borne aussi les corps sans Content-Length, avant de parser le JSON. */
export async function readSmallJson(request: Request, limit = 16_384): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  let size = 0;
  let text = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); return null; }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch { return null; }
  finally { reader.releaseLock(); }
}
