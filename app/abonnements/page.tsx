import { publicMetadata } from "@/lib/site";
import { GuideShell } from "@/components/guide";

export const metadata = publicMetadata("/abonnements", "Retrouver ses abonnements et prélèvements récurrents — Clair", "Comment repérer automatiquement les prélèvements récurrents sur un compte bancaire, calculer leur coût annuel, et détecter les augmentations de tarif.");

export default function Subscriptions() {
  return <GuideShell
    current="/abonnements"
    title="Retrouver ses abonnements sur son compte bancaire"
    lead="Un abonnement se souscrit en une minute et se paie pendant des années. Le repérer ne demande pas de mémoire : un prélèvement récurrent laisse une trace régulière sur un relevé, et cette régularité se mesure."
  >
    <section>
      <h2>Pourquoi on les perd de vue</h2>
      <p>Trois mécanismes se combinent, et aucun ne relève de l'étourderie.</p>
      <ul className="guide-bullets">
        <li><strong>Le montant est petit.</strong> Douze euros par mois ne déclenchent aucune
          alerte mentale. Cent quarante-quatre euros par an, si — mais ce nombre n'apparaît
          jamais sur un relevé.</li>
        <li><strong>Le libellé est opaque.</strong> Le nom qui apparaît sur le compte est
          souvent celui de la société qui encaisse, pas celui du service auquel vous avez
          souscrit.</li>
        <li><strong>Le prix monte discrètement.</strong> Une hausse d'un ou deux euros passe
          inaperçue sur une ligne isolée ; elle ne se voit qu'en comparant deux prélèvements à
          douze mois d'écart.</li>
      </ul>
    </section>

    <section>
      <h2>Comment on repère un prélèvement récurrent</h2>
      <p>La détection ne cherche pas des noms connus dans une liste — une liste ne contient
        jamais l'assurance de votre région ni le club de sport de votre rue. Elle cherche une
        régularité, ce qui fonctionne pour n'importe quel marchand.</p>
      <p>Trois critères, appliqués aux opérations d'un même commerçant :</p>
      <ol className="guide-steps">
        <li>
          <h3>Un intervalle constant</h3>
          <p>Les écarts entre deux prélèvements successifs doivent se ressembler : autour de
            trente jours pour un abonnement mensuel, de trois cent soixante-cinq pour un
            abonnement annuel. Une tolérance est nécessaire, parce qu'un prélèvement tombant un
            dimanche est passé le lundi.</p>
        </li>
        <li>
          <h3>Un montant stable</h3>
          <p>Pour un débit, l'amplitude doit rester faible d'une échéance à l'autre. Ce critère
            distingue un abonnement d'un commerçant chez qui vous passez régulièrement mais pour
            des montants variables.</p>
        </li>
        <li>
          <h3>Assez d'occurrences</h3>
          <p>Deux prélèvements ne font pas une cadence — deux dates suffisent toujours à tracer
            une droite. Il en faut plusieurs avant d'affirmer qu'un rythme existe.</p>
        </li>
      </ol>
      <p>Une remarque qui a son importance : le critère de montant stable ne vaut que pour les
        <em> débits</em>. Un salaire varie de plusieurs dizaines de pour cent d'un mois sur
        l'autre — primes, heures, régularisations — tout en étant parfaitement régulier dans le
        temps. Lui appliquer la règle des dépenses reviendrait à ne jamais reconnaître un
        revenu.</p>
    </section>

    <section>
      <h2>Ce que la détection permet ensuite</h2>
      <ul className="guide-bullets">
        <li><strong>Le coût annuel.</strong> Chaque abonnement ramené à ce qu'il pèse sur douze
          mois. C'est le seul chiffre qui permette d'arbitrer.</li>
        <li><strong>Les hausses.</strong> Un prélèvement qui passe de 9,99 € à 13,99 € est
          signalé, avec l'écart et la date.</li>
        <li><strong>Les échéances à venir.</strong> Ce qui va encore tomber d'ici la fin du
          mois, et à quelle date — ce qui change le sens du solde qu'on lit aujourd'hui.</li>
      </ul>
    </section>

    <section>
      <h2>Ce que Clair ne peut pas faire</h2>
      <p>Résilier. Un accès en lecture seule ne permet aucune action sur votre compte, et c'est
        la contrepartie de sa sûreté : ce qui ne peut pas déplacer d'argent ne peut pas non plus
        arrêter un prélèvement. La résiliation se fait chez le marchand, ou par opposition
        auprès de votre banque.</p>
      <p>Un service qui promettrait de résilier à votre place demanderait des droits que Clair
        ne demande pas — et n'aurait plus grand-chose à dire sur la sécurité de son accès.</p>
    </section>
  </GuideShell>;
}
