import { notFound } from "next/navigation";
import Script from "next/script";
import { Dashboard } from "@/components/dashboard";
import { SCENARIOS } from "@/tests/fixtures/scenarios";
import { buildAccounts, buildSummary } from "@/tests/fixtures/build-summary";
import { detectRecurringIncome, detectSubscriptions } from "@/lib/subscriptions/detect";

const PROBE = `(function(){
  var q = new URLSearchParams(location.search);
  var W = Number(q.get('l') || 390);
  if (!q.get('vue')) document.body.style.width = W + 'px';
  if (q.get('nuit')) document.documentElement.dataset.theme = 'dark';
  if (q.get('ouvrir')) setTimeout(function(){ var b = document.querySelector('.filter-toggle'); if (b) b.click(); }, 300);
  setTimeout(function(){
    var nav = document.querySelector('.main-nav');
    var boxes = [].slice.call(document.querySelectorAll('a,button,select,input,summary,textarea,.value,.label,strong,dd,.merchant,.amount,.bar-row span,.top-merchant span'))
      .filter(function(e){ return !nav || !nav.contains(e); })
      .map(function(el){ var r = el.getBoundingClientRect();
        return { el: el, r: r, n: el.tagName.toLowerCase() + '.' + String(el.className||'').split(' ')[0] + ' «' + (el.textContent||'').trim().slice(0,26) + '»' }; })
      .filter(function(b){
        if (b.r.width <= 0 || b.r.height <= 0) return false;
        if (b.el.checkVisibility && !b.el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true,contentVisibilityAuto:true})) return false;
        return true;
      });
    var out = [];
    for (var i = 0; i < boxes.length; i++) for (var j = i + 1; j < boxes.length; j++) {
      var a = boxes[i], b = boxes[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      var ox = Math.min(a.r.right,b.r.right) - Math.max(a.r.left,b.r.left);
      var oy = Math.min(a.r.bottom,b.r.bottom) - Math.max(a.r.top,b.r.top);
      if (ox > 2 && oy > 2) out.push('SUPERPOSE ' + Math.round(ox) + 'x' + Math.round(oy) + ' : ' + a.n + ' | ' + b.n);
    }
    boxes.forEach(function(b){ if (b.r.right > W + 1) out.push('DEPASSE de ' + Math.round(b.r.right - W) + 'px : ' + b.n); });
    // Un texte rogné par son conteneur, invisible mais perdu.
    boxes.forEach(function(b){
      if (b.el.scrollWidth > b.el.clientWidth + 2 && getComputedStyle(b.el).overflow !== 'visible') out.push('TRONQUE : ' + b.n);
    });
    if (document.body.scrollWidth > W + 1) out.push('PAGE LARGE DE ' + document.body.scrollWidth + 'px POUR ' + W);
    // Des valeurs qu'une interface ne devrait jamais montrer.
    var text = document.body.innerText;
    ['NaN', 'Infinity', 'undefined', 'null', '[object'].forEach(function(bad){ if (text.indexOf(bad) >= 0) out.push('TEXTE SUSPECT : ' + bad); });
    var pre = document.createElement('pre'); pre.id = 'sonde';
    pre.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff;color:#000;font:11px/1.4 monospace;padding:8px;margin:0;white-space:pre-wrap;overflow:auto';
    pre.textContent = 'HAUTEUR ' + document.body.scrollHeight + 'px\\n' + (out.length ? out.join('\\n') : 'RAS');
    if (!q.get('vue')) document.body.appendChild(pre);
  }, 700);
})()`;

export default async function Banc({ params }: { params: Promise<{ scenario: string }> }) {
  // Le banc n'existe que là où les données d'essai sont autorisées : en production la variable
  // vaut false, et la route répond « introuvable ». Un écran de test joignable sur le domaine
  // public finirait par être pris pour l'application.
  if (process.env.NODE_ENV !== "development" || process.env.ENABLE_MOCK_IMPORT !== "true") notFound();
  const { scenario: name } = await params;
  const scenario = SCENARIOS.find((item) => item.name === name);
  if (!scenario) notFound();

  const summary = buildSummary(scenario);
  const accounts = buildAccounts(scenario);
  const flows = scenario.movements.map((item) => ({
    merchantName: item.merchant, amount: item.amount,
    currency: item.currency ?? summary.baseCurrency, transactionDate: `${item.date}T10:00:00.000Z`
  }));
  const month = `${scenario.today.getUTCFullYear()}-${String(scenario.today.getUTCMonth() + 1).padStart(2, "0")}`;

  return <>
    <Dashboard
      summary={summary} accounts={accounts}
      categories={summary.byCategory.map((item) => item.name)}
      currencies={[...new Set(accounts.map((item) => item.currency))]}
      subscriptions={detectSubscriptions(flows, scenario.today)}
      incomes={detectRecurringIncome(flows, scenario.today)}
      filters={{ month, currency: null }}
      email="client@example.test" firstName="Camille"
      connections={[{ id: "c1", userId: "u1", provider: "truelayer", providerConnectionId: "v1:a", displayName: "Revolut", status: "active", environment: "sandbox", accountCount: accounts.length, lastError: null, syncCursor: null, lastSyncedAt: scenario.today.toISOString(), authorizedAt: null, lastSyncDurationMs: 2400, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: scenario.today.toISOString() }]}
    />
    <Script id="local-layout-probe" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: PROBE }} />
  </>;
}
