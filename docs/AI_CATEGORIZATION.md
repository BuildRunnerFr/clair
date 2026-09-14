# Catégorisation automatique — OpenAI

L’intégration utilise un seul provider réel, OpenAI, derrière `AIProvider`. Le modèle par défaut est `gpt-5.6-luna` via `POST /v1/responses`, avec Structured Outputs, `store: false`, effort de raisonnement `none`, timeout de 12 secondes et un seul retry pour les erreurs réseau, 429 ou 5xx. Il peut être configuré côté serveur avec `OPENAI_CATEGORIZATION_MODEL`; seuls Luna, Terra et l’ancien `gpt-5-mini` sont autorisés afin d’éviter une sélection arbitraire depuis l’environnement.

## Priorités

1. règle utilisateur manuelle;
2. règle utilisateur mémorisée par l’IA;
3. règle globale intégrée à l’application;
4. classification OpenAI en direct;
5. `Uncategorized`.

Une réponse IA avec une confiance supérieure ou égale à `0.90` est appliquée et mémorisée comme règle. Entre `0.70` inclus et `0.90`, elle est appliquée uniquement à la transaction. Sous `0.70`, la transaction reste `Uncategorized`.

Les transactions sont regroupées par commerçant normalisé. Au maximum 25 commerçants inconnus sont envoyés pendant une exécution, avec trois appels concurrents. Une nouvelle exécution traite le groupe suivant. Une erreur IA ne fait jamais échouer la synchronisation bancaire.

## Données transmises

Le payload contient uniquement le commerçant normalisé, une description nettoyée et tronquée, la valeur absolue du montant, la devise ISO et la taxonomie autorisée. Les emails, URLs, IBAN et longues suites numériques sont remplacés avant l’appel. Aucun identifiant utilisateur ou bancaire, token, numéro de compte, numéro de carte ou `raw_data` n’est transmis.

Les prompts complets et réponses ne sont jamais loggés. Les logs agrégés indiquent seulement le nombre d’appels, d’erreurs, de commerçants et la durée. Le `reason` est validé mais n’est pas stocké sur chaque transaction.

## Historique et corrections

La page `/categorization` traite jusqu’à 1 000 transactions `Uncategorized` par action. Les règles sont vérifiées avant OpenAI, puis les transactions sont mises à jour par lots. Si plus de 1 000 lignes ou 25 commerçants inconnus restent présents, relancer l’action.

Une correction manuelle crée ou remplace la règle utilisateur du commerçant normalisé, puis met à jour ses transactions existantes. Sa priorité reste supérieure aux règles IA lors des futures synchronisations.

## Jeu de référence

`npm run test:ai-eval` exécute 30 cas synthétiques et publics sur Luna, avec trois appels concurrents. Aucune transaction Supabase ni donnée utilisateur n’est utilisée. Le test mesure la précision de la catégorie, la précision catégorie + sous-catégorie et la précision des décisions appliquées automatiquement. Les seuils actuels sont respectivement 85 %, 75 % et 90 %. Ce test est volontairement exclu de `npm test` car il contacte OpenAI et consomme des crédits.

Les cas inspirés des formes de libellés Sandbox doivent être réécrits avec des valeurs entièrement fictives dans `lib/ai/anonymized-reference-dataset.ts`. Aucun export bancaire ou identifiant fournisseur ne doit y être copié. La page `/categorization` exécute un audit sur les seuls comptes TrueLayer, conserve le rapport détaillé dans l’état local de la page et permet de contrôler ou remplacer les règles IA.
