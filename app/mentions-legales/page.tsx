import { publicMetadata } from "@/lib/site";
import { HOST, isPublisherComplete, publisher } from "@/lib/legal/publisher";

export const metadata = publicMetadata("/mentions-legales", "Mentions légales — Clair", "Identité de l’éditeur, hébergement et contact de Clair.");

/**
 * Mentions légales, au sens de l'article 6 de la LCEN.
 *
 * Rédigées en français seulement, alors que le reste du site est bilingue. Ce n'est pas un
 * oubli : un texte qui engage juridiquement ne se traduit pas à la légère, et une traduction
 * approximative d'une clause vaut pire que son absence. La version anglaise viendra quand elle
 * sera relue par quelqu'un dont c'est le métier.
 */
export default function LegalNotice() {
  const details = publisher();
  const complete = isPublisherComplete(details);

  return <main className="legal" lang="fr">
    <a className="legal-back" href="/">← Clair</a>
    <h1>Mentions légales</h1>

    <section>
      <h2>Éditeur du site</h2>
      {complete ? <dl className="legal-list">
        <div><dt>Éditeur</dt><dd>{details.name}</dd></div>
        {details.status && <div><dt>Statut</dt><dd>{details.status}</dd></div>}
        {details.siret && <div><dt>SIRET</dt><dd>{details.siret}</dd></div>}
        <div><dt>Adresse</dt><dd>{details.address}</dd></div>
        <div><dt>Contact</dt><dd><a href={`mailto:${details.email}`}>{details.email}</a></dd></div>
        {details.director && <div><dt>Directeur de la publication</dt><dd>{details.director}</dd></div>}
        {details.vat && <div><dt>TVA</dt><dd>{details.vat}</dd></div>}
      </dl> : <p className="legal-pending">
        Les informations d’identification de l’éditeur sont en cours de constitution et seront
        publiées ici dès que le statut juridique sera enregistré. Dans l’intervalle, toute demande
        peut être adressée via la page de contact du service.
      </p>}
    </section>

    <section>
      <h2>Hébergement</h2>
      <dl className="legal-list">
        <div><dt>Hébergeur</dt><dd>{HOST.name}</dd></div>
        <div><dt>Adresse</dt><dd>{HOST.address}</dd></div>
        <div><dt>Lieu d’exécution</dt><dd>{HOST.region}</dd></div>
        <div><dt>Site</dt><dd><a href={`https://${HOST.site}`} rel="noreferrer">{HOST.site}</a></dd></div>
      </dl>
    </section>

    <section>
      <h2>Nature du service</h2>
      <p>
        Clair est un service d’agrégation et de visualisation de dépenses personnelles. Il permet
        à un utilisateur de consulter, classer et analyser les opérations de ses propres comptes
        bancaires.
      </p>
      <p>
        <strong>Clair n’est pas un établissement bancaire, ni un établissement de paiement.</strong>{" "}
        Le service ne détient aucun fonds, n’exécute aucune opération de paiement et ne peut
        initier aucun virement. L’accès aux comptes est en lecture seule.
      </p>
      <p>
        L’accès aux données de compte est fourni par TrueLayer Ireland Limited, prestataire de
        services d’information sur les comptes agréé et supervisé à ce titre. L’utilisateur
        s’authentifie directement auprès de sa banque ; ses identifiants bancaires ne transitent
        à aucun moment par Clair et n’y sont jamais stockés.
      </p>
    </section>

    <section>
      <h2>Propriété intellectuelle</h2>
      <p>
        Le nom, l’interface et le code du service sont la propriété de leur éditeur. Les noms des
        établissements bancaires cités le sont à titre informatif, pour indiquer quels comptes
        peuvent être connectés ; ils demeurent la propriété de leurs titulaires respectifs et leur
        mention n’implique aucun partenariat ni approbation.
      </p>
    </section>

    <section>
      <h2>Données personnelles</h2>
      <p>
        Le traitement des données personnelles est décrit dans la{" "}
        <a href="/confidentialite">politique de confidentialité</a>, qui précise ce qui est
        collecté, à qui les données sont transmises, combien de temps elles sont conservées et
        comment exercer ses droits.
      </p>
    </section>
  </main>;
}
