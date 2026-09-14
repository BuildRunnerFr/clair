# Espace connecté — audit approfondi et corrections

## Avis global

L’application a une base métier utile, mais sa crédibilité dépend d’abord de l’explication des montants et de la portée des actions. Une interface financière agréable qui affiche une devise incorrecte, masque une conversion absente ou modifie tout un commerçant sans choix explicite perd rapidement la confiance de son utilisateur. Ce travail privilégie ces problèmes, puis la présentation des écrans.

- **Transactions : conserver une page dédiée.** C’est l’endroit où vérifier un montant, chercher un commerçant et corriger une opération. La catégorisation y reste intégrée.
- **Budgets : conserver une page dédiée.** Décider de limites est un travail différent de consulter les opérations. La page se concentre maintenant sur les limites actives, les dépassements et les dépenses sans limite. Le tableau de bord reste une synthèse.
- **Abonnements : conserver la synthèse dans le tableau de bord.** Un écran supplémentaire n’apporterait pas suffisamment tant que la confirmation, le masquage et la distinction par contrat ne sont pas modélisés. Les lignes sont maintenant reliées à leurs opérations.
- **Assistant : conserver comme complément.** Il ne remplace pas les écrans de contrôle ni les montants vérifiables. L’évaluation réseau du modèle n’a pas été relancée dans cet audit.

## Défauts corrigés dans les données et les calculs

| Constat | Effet | Correction |
| --- | --- | --- |
| `account` accepté dans la page mais jamais appliqué à la recherche | Une liste censée être filtrée par compte pouvait montrer tous les comptes | Filtre SQL par compte, sélecteur visible et conservation dans la pagination |
| Sommes utilisant `amountBase ?? amount` puis un seul symbole | Une livre non convertie pouvait être additionnée à des euros | Unité choisie pour chaque opération ; totaux séparés par devise si conversion absente |
| Opérations en attente incluses dans les débits de la liste | Écart de périmètre avec les budgets SQL | Totaux comptabilisés séparés des mouvements en attente ; filtre de statut |
| Devise des budgets confondue avec le filtre de devise d’origine | Le RPC renvoyait des euros que la page pouvait afficher en livres ; certaines dépenses étaient exclues | Limites dans la devise du profil, appel global sans filtre de devise d’origine |
| Conversions manquantes silencieuses | Reste budgété potentiellement trop élevé | Comptage des dépenses exclues et avertissement si les totaux sont incomplets |
| Lecture de l’historique non paginée | Analyse pouvant s’arrêter aux 1 000 premières lignes de Supabase | Lecture paginée avec tri stable ; test à 1 001 lignes |
| Normalisation identique de trajets Uber et Uber Eats | Repas classés en transport | Alias et règle distincts pour Uber Eats |
| Règles mémorisées reconnues comme sous-chaînes | Une règle pouvait déborder vers un autre commerçant | Correspondance exacte sur le nom normalisé, cohérente avec les corrections d’historique |
| Détection acceptant des opérations futures, en attente ou invalides | Preuve de récurrence artificielle | Rejet de ces entrées avant la détection |
| Récurrences anciennes conservées jusqu’à une nouvelle synchronisation | Présentation d’une détection périmée comme actuelle | Vérification de fraîcheur à la lecture |
| Purge des récurrences par le seul nom | Ancienne devise ou ancien sens conservé pour le même commerçant | Purge selon la clé complète marchand/devise/sens |
| Total annuel d’abonnements additionnant toutes les devises | Coût affiché sous une unité incorrecte | Totaux distincts et tri par coût annuel à devise égale |

Les récurrences restent des **estimations**. Une cadence ne prouve ni un contrat actif ni une résiliation. Le texte utilisateur le précise désormais. Le coût annuel repose sur le dernier montant observé : 52 semaines, 12 mois ou une année selon la fréquence.

## Changements des parcours

### Transactions

- Compte, catégorie, mois, recherche et statut dans les filtres.
- Accès direct aux opérations à catégoriser et remise à zéro des filtres.
- Un paramètre incorrect ne supprime plus les autres filtres valides.
- Retour à une page existante si la pagination dépasse le nombre de résultats.
- Totaux explicitement limités aux lignes affichées, avec débits et crédits bruts, virements compris.
- Catégories et sous-catégories traduites sans changer les codes stockés.
- Année dans les dates historiques.
- Correction limitée à une opération par défaut. Le classement de tout le commerçant, passé et futur, demande un choix explicite.
- Actualisation des transactions, budgets et tableau de bord après correction ; erreur visible si l’écriture échoue ou si la ligne n’existe plus.
- Boutons de mutation désactivés pendant l’envoi.

### Budgets

- Indicateurs « limites cumulées », « dépenses sous budget » et « restant », compacts sur téléphone.
- Budgets actifs triés par consommation ; lien vers les opérations comptabilisées de la catégorie et du mois.
- Modification et suppression repliées pour privilégier la lecture.
- Catégories dépensées sans limite séparées des budgets configurés.
- Création possible avant les premières opérations, dans la devise du profil.
- Revenus, virements et catégorie non classée retirés des nouvelles limites proposées.
- Validation serveur de la devise et de la catégorie ; retours lisibles après sauvegarde, suppression ou erreur.
- Moyenne historique présentée comme moyenne des mois avec dépenses, et non comme moyenne de tous les mois.
- Explication de la portée temporelle : les limites sont récurrentes et leur modification affecte aussi la comparaison des mois précédents. Ce ne sont pas des enveloppes historisées mois par mois.

## Vérifications

- Suite complète : 498 tests réussis, un test réseau OpenAI ignoré. Tests ajoutés pour les conversions, les attentes, le filtrage, l’historique de plus de 1 000 lignes, les budgets, la catégorisation, la fraîcheur des récurrences et les actions serveur.
- Compilation de production et contrôle TypeScript.
- Chrome : composants réels Transactions, Budgets et Récurrences, à 320, 390, 768 et 1440 px. Thème sombre à 768 px, détails ouverts. Aucun débordement horizontal de page ou de contrôle dans les mesures finales.
- Vérification des liens des budgets vers les opérations, du choix de correction unitaire par défaut et de montants importants avec un libellé long.
- Mesures reproductibles dans `audit/connected-browser.json`.
- Route de démonstration locale `/banc/espace/[view]`, protégée par `NODE_ENV=development` et `ENABLE_MOCK_IMPORT=true`. Elle répond introuvable en production et ne contourne aucune authentification des pages réelles.

Les composants ont été exercés avec des données fictives. Les actions serveur ont été testées avec des repositories simulés. **Aucune écriture sur un compte bancaire réel, suppression de données réelles ni migration de production n’a été effectuée.** Ces tests ne remplacent pas une recette avec un compte de test et les services bancaires réels, ni l’exécution des tests SQL contre un PostgreSQL local.

## Limites encore importantes

1. **Récurrences par contrat et par compte.** La détection regroupe encore les opérations par commerçant et devise. Deux contrats chez le même commerçant, payés depuis plusieurs comptes, peuvent se perturber. Il faut une évolution du stockage pour conserver cette identité et permettre confirmation/masquage ; ajouter un bouton sans ce modèle serait trompeur.
2. **Synchronisations simultanées.** La réécriture des récurrences reste une séquence de requêtes, pas une transaction globale verrouillée par utilisateur. Le verrou par connexion ne suffit pas à certifier ce cas entre deux banques.
3. **Budgets historisés.** Une limite actuelle sert encore pour les mois précédents. Le comportement est maintenant explicite, mais des enveloppes mensuelles indépendantes demanderaient un changement de modèle et une reprise des limites existantes.
4. **Change et récurrences.** La synchronisation utilise les montants convertis quand ils sont disponibles. Un mouvement de taux peut donc être interprété comme une variation du prélèvement. La détection devrait à terme analyser la stabilité en devise d’origine et convertir séparément sa restitution.
5. **Virements et remboursements.** La liste annonce des débits/crédits bruts ; les budgets ne constituent pas un calcul de patrimoine net ni de consommation nette des remboursements. Un traitement métier plus fin exige des règles explicites de rapprochement, testées sur des jeux représentatifs.
6. **Recette intégrée.** Sans compte de test fourni, la session réelle, l’envoi d’email, le fournisseur bancaire et les écritures persistées de bout en bout ne sont pas validés ici. Les anciennes classifications erronées ne sont pas réécrites automatiquement par les nouvelles règles.

Ces sujets sont des évolutions de données et de produit, pas des problèmes que la seule mise en page peut résoudre.
