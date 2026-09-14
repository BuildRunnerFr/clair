import "server-only";

/**
 * L'alerte d'exploitation, envoyée à celui qui tient le service — jamais à l'utilisateur.
 *
 * Une synchronisation qui échoue la nuit ne produit aucun signal : l'utilisateur voit ses
 * dépenses cesser de se mettre à jour et suppose que c'est normal, l'exploitant ne voit rien du
 * tout. Le journal de l'hébergeur est éphémère, et `npm run health` suppose qu'on pense à le
 * lancer — c'est-à-dire qu'on soupçonne déjà un problème.
 *
 * Le corps d'une alerte ne porte que des nombres — combien de connexions, combien d'échecs. Ni
 * adresse, ni identifiant, ni libellé bancaire : ce message part chez un tiers, et l'incident
 * qu'il signale se diagnostique de toute façon dans la base, où les données sont déjà.
 *
 * Le silence reste ambigu, et il faut le dire : ce dispositif signale ce qui échoue, pas ce qui
 * ne tourne plus. Une tâche planifiée qui cesserait d'être déclenchée n'enverrait aucune alerte,
 * puisqu'elle n'enverrait rien. Le seul remède est une surveillance extérieure qui s'inquiète de
 * ne pas être appelée ; elle reste à poser.
 */
const RESEND_URL = "https://api.resend.com/emails";

export interface Alert {
  subject: string;
  body: string;
}

/**
 * Vrai si l'alerte est partie. Faux si elle n'était pas configurée ou si l'envoi a échoué —
 * dans les deux cas sans lever : une alerte est le dernier endroit où l'on peut se permettre de
 * faire tomber ce qu'on surveille.
 */
export async function sendAlert(alert: Alert, http: typeof fetch = fetch): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  const to = process.env.ALERT_EMAIL_TO?.trim();
  if (!key || !to) {
    console.info("[alerte] non configurée, rien envoyé", { subject: alert.subject });
    return false;
  }
  // Tant qu'un domaine n'est pas vérifié chez Resend, seule cette adresse d'expédition est
  // acceptée, et seulement vers l'adresse du compte. C'est donc le repli, pas le choix.
  const from = process.env.ALERT_EMAIL_FROM?.trim() || "Clair <onboarding@resend.dev>";

  try {
    const response = await http(RESEND_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: alert.subject, text: alert.body }),
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) {
      // Le corps dit ce que Resend refuse — domaine non vérifié, destinataire interdit. Sans
      // lui, une alerte qui ne part jamais ressemble à un service qui va bien.
      const detail = await response.text().then((body) => body.slice(0, 200)).catch(() => "");
      console.warn("[alerte] refusée", { status: response.status, detail });
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[alerte] envoi impossible", { message: error instanceof Error ? error.message : "inconnue" });
    return false;
  }
}
