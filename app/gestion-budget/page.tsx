import { publicMetadata } from "@/lib/site";
import { GuideShell } from "@/components/guide";

export const metadata = publicMetadata("/gestion-budget", "Gérer son budget automatiquement, sans tableur — Clair", "Pourquoi les budgets tenus à la main sont abandonnés, comment fixer une limite mensuelle qui tient, et ce qu'une prévision de fin de mois peut réellement annoncer.");

export default function BudgetManagement() {
  return <GuideShell
    current="/gestion-budget"
    title="Gérer son budget sans le tenir"
    lead="La plupart des budgets échouent au même endroit : la saisie. Un budget qui se remplit tout seul à partir de vos opérations bancaires demande une autre méthode pour fixer les limites — et donne une information qu'un tableur ne donne pas."
  >
    <section>
      <h2>Pourquoi un budget tenu à la main est abandonné</h2>
      <p>Ce n'est pas un manque de discipline, c'est une question de coût. Tenir un budget à la
        main demande de recopier chaque opération, de la ranger, et de recommencer chaque
        semaine. Le bénéfice arrive au bout de plusieurs mois — il faut de l'historique pour que
        les chiffres disent quelque chose — alors que l'effort, lui, est immédiat et
        hebdomadaire. Presque tout le monde s'arrête avant que le bénéfice arrive.</p>
      <p>Un budget alimenté par la banque inverse le rapport : l'effort est nul, et
        l'historique se constitue tout seul pendant que vous ne faites rien.</p>
    </section>

    <section>
      <h2>Fixer une limite qui tient</h2>
      <p>C'est là que la plupart des applications laissent l'utilisateur seul. On vous demande
        un montant pour les courses, vous inventez trois cents euros, vous le dépassez le 20, et
        vous cessez de regarder.</p>
      <p>Une limite tient quand elle part de ce que le poste vous coûte réellement. Trois
        repères suffisent à la choisir :</p>
      <ul className="guide-bullets">
        <li><strong>Votre moyenne sur les mois couverts</strong> — pas sur six mois arbitraires,
          seulement sur ceux dont on a les données.</li>
        <li><strong>Votre étendue habituelle</strong>, c'est-à-dire l'écart entre vos mois
          creux et vos mois pleins. Un poste qui varie de trois cents à cinq cents euros ne se
          plafonne pas à trois cent cinquante.</li>
        <li><strong>Ce qui est déjà engagé</strong> : les prélèvements récurrents tombent que
          vous le vouliez ou non, et n'ont rien à faire dans la part sur laquelle vous pouvez
          agir.</li>
      </ul>
      <p>Une limite fixée ainsi est tenable, donc tenue. Une limite fixée au hasard est
        franchie, puis ignorée.</p>
    </section>

    <section>
      <h2>Le reste à vivre, et ce qu'une prévision peut dire</h2>
      <p>La question qu'on se pose vraiment n'est pas « combien ai-je dépensé » mais « est-ce
        que ça passe jusqu'à la fin du mois ». Y répondre demande trois choses : le solde réel
        d'aujourd'hui, les prélèvements qui vont encore tomber avec leur date, et une estimation
        du reste — les dépenses libres, celles qui ne se prévoient pas à l'euro près.</p>
      <p>Les deux premières sont connues. La troisième est une estimation, et elle doit être
        présentée comme telle : une fourchette plutôt qu'un nombre, et rien du tout quand
        l'historique ne permet pas de conclure. Une prévision affichée avec l'aplomb d'une
        mesure sur un compte trop jeune pour la porter est pire que pas de prévision.</p>
    </section>

    <section>
      <h2>L'alerte avant le dépassement, pas après</h2>
      <p>Apprendre le 31 qu'on a dépassé son budget de quarante euros n'a aucune utilité :
        l'argent est dépensé. Le seul moment où un budget agit, c'est quand il prévient à
        l'approche de la limite, pendant qu'il reste des décisions à prendre.</p>
      <p>Cela suppose que le budget connaisse le rythme du mois : dépenser 70 % de son budget
        courses au 25 du mois est normal, le dépenser au 10 ne l'est pas.</p>
    </section>

    <section>
      <h2>Les questions qu'on nous pose</h2>
      <h3>Faut-il un budget par catégorie ou un budget global ?</h3>
      <p>Par catégorie, mais pas sur toutes. Deux ou trois postes sur lesquels vous pouvez
        réellement agir — courses, restaurants, plaisirs — valent mieux que douze budgets dont
        dix sont subis. Le loyer n'a pas besoin d'un budget.</p>
      <h3>Et si un mois est exceptionnel ?</h3>
      <p>C'est précisément ce que l'étendue habituelle sert à dire. Un mois au-dessus de votre
        fourchette est signalé comme tel ; un mois haut mais dans la fourchette ne mérite pas
        d'alarme, et une application qui en déclenche une vous apprend à ignorer ses alertes.</p>
    </section>
  </GuideShell>;
}
