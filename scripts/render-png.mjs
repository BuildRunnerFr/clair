// Rend une page locale en image, par le protocole DevTools d'un Chrome déjà lancé en mode
// débogage. Sert à fabriquer les images de marque et la carte de partage — voir brand/README.md.
//
//   google-chrome --headless=new --remote-debugging-port=9222 --disable-gpu about:blank &
//   node scripts/render-png.mjs <url> <sortie.png> [largeur] [hauteur]
import { writeFileSync } from "node:fs";
const [, , url, sortie, largeurArg, hauteurArg] = process.argv;
const largeur = Number(largeurArg ?? 512), hauteur = Number(hauteurArg ?? largeur);

const list = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = list.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
await new Promise((r) => ws.addEventListener("open", r));
const send = (m, p = {}) => new Promise((res) => { const n = ++id; pending.set(n, (x) => res(x.result ?? x.error)); ws.send(JSON.stringify({ id: n, method: m, params: p })); });

await send("Emulation.setDeviceMetricsOverride", { width: largeur, height: hauteur, deviceScaleFactor: 1, mobile: false });
await send("Page.enable");
await send("Page.navigate", { url });
// Les polices Google arrivent après le premier rendu : sans cette attente, le glyphe sort en
// police de repli et la marque n'est plus la marque.
await new Promise((r) => setTimeout(r, 4000));
const shot = await send("Page.captureScreenshot", { clip: { x: 0, y: 0, width: largeur, height: hauteur, scale: 1 } });
writeFileSync(sortie, Buffer.from(shot.data, "base64"));
ws.close();
