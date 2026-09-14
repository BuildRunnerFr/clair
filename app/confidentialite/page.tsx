import { publicMetadata } from "@/lib/site";
import { isPublisherComplete, PROCESSORS, publisher } from "@/lib/legal/publisher";

export const metadata = publicMetadata("/confidentialite", "Politique de confidentialité — Clair", "Comment Clair utilise et protège vos données, et comment exercer vos droits.");

/** Dernière révision de fond du texte. Une politique sans date ne se vérifie pas. */
const UPDATED = "4 septembre 2026";

/**
 * Politique de confidentialité.
 *
 * Écrite à partir du code plutôt que d'un gabarit : chaque destinataire nommé correspond à un
 * appel réel, et chaque durée de conservation à un comportement effectif. C'est la partie qu'un
 * modèle générique ne peut pas produire, et c'est celle qui décide si la déclaration est sincère.
 *
 * En français seulement, pour la même raison que les mentions légales : une clause mal traduite
 * vaut pire que pas de traduction.
 */
export default function Privacy() {
  const details = publisher();
  const contact = isPublisherComplete(details) ? details.email : null;

  return <main className="legal" lang="fr">
    <a className="legal-back" href="/">← Clair</a>
    <h1>Politique de confidentialité</h1>
    <p className="legal-updated">Dernière mise à jour : {UPDATED}</p>

    <section>
      <h2>Ce que le service collecte</h2>
      <ul className="legal-bullets">
        <li><strong>Votre adresse email</strong>, saisie à la création du compte ou transmise par Google ou Apple si vous passez par eux.</li>
        <li>
          <strong>Votre profil</strong> : prénom, et pays de résidence. Le prénom sert à vous
          adresser la parole ; le pays décide des banques qui vous sont proposées, la couverture
          bancaire étant nationale. Vous pouvez y ajouter, sans y être tenu, un nom, une date de
          naissance — vérifiée seulement pour confirmer votre majorité, qu’un service financier
          suppose — et un genre, dont rien dans l’application ne dépend et qui offre une réponse
          « je préfère ne pas le dire ». Ces informations se modifient et se suppriment depuis
          votre compte, et ne sont transmises à aucun tiers.
        </li>
        <li><strong>Vos opérations bancaires</strong> : date, montant, devise, libellé, nom du compte, et la catégorie que le service leur attribue.</li>
        <li><strong>Les soldes</strong> de vos comptes, tels que votre banque les communique.</li>
        <li><strong>Ce que vous créez</strong> : budgets, corrections de catégorie, conversations avec l’assistant.</li>
        <li><strong>Des données techniques</strong> : journaux d’erreurs et de synchronisation, qui ne contiennent ni libellé d’opération, ni montant, ni nom.</li>
      </ul>
      <p>
        Aucun traceur publicitaire, aucune mesure d’audience, aucun cookie autre que ceux
        strictement nécessaires à la session et au choix de langue.
      </p>
    </section>

    <section>
      <h2>Ce que le service ne collecte pas</h2>
      <p>
        <strong>Vos identifiants bancaires.</strong> Vous les saisissez chez votre banque, jamais
        ici. Elle délivre en retour un jeton d’accès en lecture seule, que Clair conserve chiffré
        et que vous pouvez révoquer à tout moment. Ce jeton ne permet aucune opération de
        paiement : techniquement, le service ne peut rien déplacer.
      </p>
    </section>

    <section>
      <h2>Pourquoi ces données sont traitées</h2>
      <p>
        Pour exécuter le service que vous demandez : afficher vos dépenses, les classer, les
        comparer, et répondre à vos questions à leur sujet. La base légale est l’exécution du
        contrat qui nous lie dès la création de votre compte. Aucune donnée n’est utilisée à des
        fins publicitaires, ni cédée, ni vendue.
      </p>
    </section>

    <section>
      <h2>À qui les données sont transmises</h2>
      <p>
        Le service s’appuie sur les prestataires suivants. Chacun n’accède qu’à ce qui lui est
        nécessaire, et pour le seul compte de l’éditeur.
      </p>
      <div className="legal-table-scroll">
        <table className="legal-table">
          <thead><tr><th>Prestataire</th><th>Rôle</th><th>Données concernées</th><th>Lieu</th></tr></thead>
          <tbody>
            {PROCESSORS.map((processor) => <tr key={processor.name}>
              <td>{processor.name}</td>
              <td>{processor.role}</td>
              <td>{processor.data}</td>
              <td>{processor.location}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <p>
        <strong>Le cas d’OpenAI mérite d’être détaillé</strong>, car c’est le seul destinataire
        situé hors de l’Union européenne. Le classement d’une dépense et les réponses de
        l’assistant lui sont soumis, mais uniquement après masquage : le nom d’un tiers, un IBAN,
        une référence d’opération et toute suite de chiffres sont retirés du libellé avant l’envoi.
        Un virement reçu de « Marie Dupont » est transmis comme un virement, sans le nom. Votre
        adresse email ne lui est jamais transmise, et aucune donnée n’est utilisée pour entraîner
        de modèle.
      </p>
    </section>

    <section>
      <h2>Combien de temps</h2>
      <ul className="legal-bullets">
        <li><strong>Vos données de compte</strong> sont conservées tant que votre compte existe.</li>
        <li><strong>La suppression est immédiate et totale.</strong> Elle efface transactions, budgets, conversations et jetons bancaires, et révoque l’accès accordé à chacune de vos banques. Il n’existe aucune sauvegarde permettant de les restaurer.</li>
        <li><strong>Les journaux techniques</strong> ne contiennent aucune donnée personnelle identifiante et sont conservés à des fins de diagnostic.</li>
      </ul>
    </section>

    <section>
      <h2>Vos droits</h2>
      <p>
        Vous disposez d’un droit d’accès, de rectification, d’effacement, de limitation, de
        portabilité et d’opposition sur vos données.
      </p>
      <p>
        <strong>L’effacement s’exerce directement dans l’application</strong>, depuis la page
        « Mon compte », sans avoir à écrire à quiconque ni à justifier votre décision. Il prend
        effet immédiatement.
      </p>
      {contact
        ? <p>Pour les autres droits, écrivez à <a href={`mailto:${contact}`}>{contact}</a>.</p>
        : <p className="legal-pending">L’adresse de contact sera publiée ici dès l’enregistrement du statut juridique de l’éditeur.</p>}
      <p>
        Vous pouvez également introduire une réclamation auprès de la CNIL, autorité de contrôle
        française : <a href="https://www.cnil.fr" rel="noreferrer">cnil.fr</a>.
      </p>
    </section>

    <section>
      <h2>Sécurité</h2>
      <ul className="legal-bullets">
        <li>Le cloisonnement entre comptes est appliqué par la base de données elle-même, et non par le code de l’application : une erreur de programmation ne peut pas exposer les données d’un autre utilisateur.</li>
        <li>Les jetons d’accès bancaire sont chiffrés, conservés dans un espace séparé du reste des données, et la clé de chiffrement peut être remplacée sans vous demander de reconnecter votre banque.</li>
        <li>Les échanges sont chiffrés de bout en bout, et le site n’est accessible qu’en HTTPS.</li>
      </ul>
    </section>

    <section>
      <h2>Modifications</h2>
      <p>
        Toute évolution de cette politique sera publiée sur cette page, avec une date de mise à
        jour. Un changement affectant la nature des traitements vous sera signalé dans
        l’application.
      </p>
    </section>
  </main>;
}
