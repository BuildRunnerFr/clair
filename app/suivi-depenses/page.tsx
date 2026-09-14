import { publicMetadata } from "@/lib/site";
import { GuideShell } from "@/components/guide";

export const metadata = publicMetadata("/suivi-depenses", "Suivi de dépenses automatique : comment ça marche — Clair", "Un suivi de dépenses automatique lit vos opérations bancaires et les classe sans saisie. Ce qui se passe vraiment, ce que ça montre, et ce que ça ne sait pas faire.");

export default function SpendingTracking() {
  return <GuideShell
    current="/suivi-depenses"
    title="Le suivi de dépenses automatique, expliqué"
    lead="Un suivi automatique lit les opérations que votre banque transmet, leur attribue une catégorie, et les compare à vos mois passés. Vous ne saisissez rien. Voici ce que cela recouvre exactement, et où sont les limites."
  >
    <section>
      <h2>Ce que « automatique » veut dire</h2>
      <p>Trois travaux disparaissent, et il faut les distinguer parce qu'ils n'ont ni la même
        difficulté ni la même fiabilité.</p>
      <ol className="guide-steps">
        <li>
          <h3>La collecte</h3>
          <p>Votre banque transmet vos opérations à travers une interface prévue par la
            directive européenne sur les services de paiement. C'est la partie la plus sûre :
            les montants, les dates et les libellés viennent de la banque elle-même, sans
            recopie et sans interprétation.</p>
        </li>
        <li>
          <h3>Le classement</h3>
          <p>Chaque opération reçoit une catégorie. C'est la partie qui peut se tromper, et
            c'est pour cela qu'une correction doit valoir pour toutes les opérations suivantes
            du même commerçant — sans quoi vous corrigez le même libellé tous les mois.</p>
        </li>
        <li>
          <h3>La mise en perspective</h3>
          <p>Un montant seul n'apprend rien. Six cent douze euros de logement, c'est beaucoup
            ou c'est normal selon vos mois précédents ; c'est cette comparaison qui transforme
            un relevé en information.</p>
        </li>
      </ol>
    </section>

    <section>
      <h2>Comment une dépense reçoit sa catégorie</h2>
      <p>Un libellé bancaire est écrit pour un système comptable, pas pour un lecteur :
        <em> CB MONOPRIX 0938</em>, <em>SARL LE PETIT COIN</em>, <em>PRLV SEPA ORANGE SA</em>.
        Le classement consiste à retrouver le commerçant derrière la chaîne, puis à ranger ce
        commerçant dans une catégorie.</p>
      <p>Dans Clair, l'opération se fait en deux temps. Ce qui a déjà été vu est reconnu
        immédiatement, sans appel extérieur : un commerçant classé une fois reste classé. Ce
        qui est inconnu part vers un modèle de langage, avec <strong>le libellé masqué, le
        montant et la devise</strong> — jamais un nom de tiers, un IBAN ni une référence de
        virement. Le modèle propose une catégorie, elle est enregistrée, et le commerçant
        rejoint ce qui est déjà connu.</p>
      <p>La conséquence pratique : les premiers jours demandent quelques corrections, puis le
        classement se stabilise. Une correction ne corrige pas une ligne, elle corrige une
        règle.</p>
    </section>

    <section>
      <h2>Ce qu'on lit une fois les dépenses classées</h2>
      <p>Le classement n'est pas une fin : il rend possibles trois lectures qu'un relevé
        n'autorise pas.</p>
      <ul className="guide-bullets">
        <li><strong>La répartition du mois.</strong> Quels postes pèsent, dans quel ordre, et
          pour combien — la question à laquelle personne ne sait répondre de tête.</li>
        <li><strong>La comparaison à date égale.</strong> Le 12 du mois, votre mois en cours ne
          se compare pas à des mois complets : il se compare à vos mois précédents <em>au
          douzième jour</em>. C'est la seule comparaison qui ait un sens en cours de mois.</li>
        <li><strong>L'étendue de l'ordinaire.</strong> Plutôt qu'une moyenne, une fourchette :
          entre tel et tel montant, vous êtes dans votre ordinaire. Une moyenne fait passer
          pour anormal un mois qui ne l'est pas.</li>
      </ul>
    </section>

    <section>
      <h2>Ce que le suivi automatique ne fait pas</h2>
      <p>Trois limites, qu'il vaut mieux connaître avant de commencer qu'après.</p>
      <ul className="guide-bullets">
        <li><strong>L'historique n'est pas illimité.</strong> Au-delà de quatre-vingt-dix jours,
          les banques n'ouvrent l'accès aux opérations anciennes que dans les quelques minutes
          qui suivent votre authentification. Passé ce délai, il faut se reconnecter pour
          obtenir davantage de profondeur.</li>
        <li><strong>Le liquide échappe au suivi.</strong> Un retrait apparaît comme un retrait ;
          ce que vous en faites ensuite n'est visible nulle part.</li>
        <li><strong>Le classement reste une hypothèse.</strong> Un commerçant qui vend à la fois
          de l'alimentation et de l'électroménager est rangé dans une seule catégorie. La
          correction manuelle existe pour cette raison.</li>
      </ul>
    </section>
  </GuideShell>;
}
