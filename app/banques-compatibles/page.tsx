import { publicMetadata } from "@/lib/site";
import { GuideShell } from "@/components/guide";
import { BANKS } from "@/components/landing-preview";

export const metadata = publicMetadata("/banques-compatibles", "Banques compatibles : les établissements couverts par Clair", "Comment vérifier si votre banque est disponible dans Clair, quelles données sont récupérées et quand renouveler votre connexion.");

export default function SupportedBanks() {
  return <GuideShell
    current="/banques-compatibles"
    title="Les banques compatibles avec Clair"
    lead="Vérifiez la disponibilité de votre établissement au moment de la connexion. Vos identifiants restent chez votre banque et l’accès demandé est limité à la lecture de vos comptes."
  >
    <section>
      <h2>Retrouver votre banque</h2>
      <p>Les établissements ci-dessous sont présentés à titre de repère. La liste proposée lors de la connexion fait foi : la disponibilité dépend du pays, du type de compte et du fournisseur bancaire. En mode démonstration, seuls des comptes fictifs sont accessibles.</p>
      <ul className="guide-banks">
        {BANKS.map((bank) => <li key={bank.id}>{bank.name}</li>)}
      </ul>
      <p>Pour chacun, la même chose est récupérée : les comptes détenus, leur solde, leur
        découvert autorisé lorsqu'il est communiqué, et les opérations avec leur date, leur
        montant, leur devise et leur libellé. Rien d'autre — ni bénéficiaires enregistrés, ni
        moyens de paiement, ni documents.</p>
      <p className="guide-callout">Votre banque n'est pas dans cette liste ?
        {" "}<a href="mailto:contact@clairfinances.com?subject=Ma%20banque%20n%E2%80%99est%20pas%20dans%20la%20liste">Dites-le-nous</a> :
        c'est ce qui décide de l'ordre dans lequel les suivantes sont ajoutées.</p>
    </section>

    <section>
      <h2>Comment la connexion fonctionne</h2>
      <p>Elle repose sur la deuxième directive européenne sur les services de paiement, qui
        oblige les banques à ouvrir l'accès aux données de compte à un prestataire agréé, sur
        autorisation explicite du client. Concrètement :</p>
      <ol className="guide-steps">
        <li>
          <h3>Vous choisissez votre banque</h3>
          <p>La suite se passe sur le site de votre banque, pas ici.</p>
        </li>
        <li>
          <h3>Vous vous authentifiez chez elle</h3>
          <p>Avec vos moyens habituels, y compris la validation forte sur votre téléphone. Vos
            identifiants ne transitent à aucun moment par Clair, qui ne les voit jamais.</p>
        </li>
        <li>
          <h3>Elle délivre un accès en lecture</h3>
          <p>Un jeton, limité à la consultation, conservé chiffré. Il ne permet ni virement, ni
            prélèvement, ni modification de quoi que ce soit sur votre compte.</p>
        </li>
      </ol>
    </section>

    <section>
      <h2>Combien de temps dure une connexion</h2>
      <p>La durée dépend de votre banque et de son parcours d’autorisation. La date et les
        conditions affichées lors de la connexion font référence. Lorsque l’accès expire,
        Clair vous invite à reconnecter la banque pour reprendre la synchronisation.</p>
      <p>L’historique disponible dépend également de l’établissement. Certaines banques ne
        donnent accès aux opérations anciennes que pendant une courte fenêtre après votre
        authentification. Clair tente alors de récupérer jusqu’à deux ans d’historique,
        sans garantir que chaque banque fournisse cette profondeur.</p>
      <p>Vous pouvez consulter les <a href="https://truelayer.com/legal/enduser_tos/">conditions
        d’utilisation de TrueLayer</a> pour les modalités de l’accès aux comptes.</p>
    </section>

    <section>
      <h2>Plusieurs banques sur le même compte</h2>
      <p>Rien ne s'y oppose, et c'est le cas d'usage principal : un compte courant dans une
        banque de réseau, un compte de paiement dans une néobanque. Les opérations sont
        rassemblées, les soldes additionnés par devise, et les prélèvements récurrents détectés
        banque par banque pour qu'un même abonnement payé depuis deux comptes ne soit pas compté
        deux fois.</p>
      <p>Les devises étrangères sont ramenées à votre devise de restitution au taux du jour de
        la dépense, et non au taux d'aujourd'hui : une dépense de l'an dernier ne change pas de
        montant parce que le change a bougé depuis.</p>
    </section>

    <section>
      <h2>Révoquer l'accès</h2>
      <p>De deux endroits, et les deux fonctionnent : depuis Clair, où la suppression de votre
        compte révoque les consentements auprès de chaque banque avant d'effacer vos données ;
        ou depuis votre banque, dans l'espace où elle liste les services auxquels vous avez
        donné accès. Aucune démarche, aucun délai, aucune justification à fournir.</p>
    </section>
  </GuideShell>;
}
