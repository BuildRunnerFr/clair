# Audit sécurité et expérience connectée — 7 septembre 2026

## Résultat et périmètre

Audit du code, tests automatisés, compilation de production, consultation HTTP non destructive du domaine clairfinances.com et recette Chrome des composants réellement utilisés par les pages connectées, avec données fictives. Ce travail ne constitue pas un pentest exhaustif ni une certification de sécurité. Les parcours bancaires réels, les mutations avec une session de production, les politiques Supabase effectivement déployées et la restauration des sauvegardes ne sont pas validés ici.

## Corrections de sécurité

- Next.js passe de 16.3.2 à 16.3.3. Le bulletin officiel du 25 août contient notamment une vulnérabilité critique du traitement AVIF, dont l’exploitation dépend de la configuration et du contenu accepté. Aucune exploitation de ce projet n’a été constatée. Le registre npm annonçait zéro vulnérabilité avant cette mise à jour : son résultat seul était insuffisant.
- Vérification de l’origine et des métadonnées de navigation avant les mutations des API compte, assistant et connexion/synchronisation bancaire. Les sessions par cookies sans preuve d’origine sont refusées. Les actions serveur bénéficient aussi des protections du framework.
- Corps JSON limités à 16 Kio même sans Content-Length sur les API JSON concernées.
- Propriété des conversations contrôlée avant consommation de quota et appel au modèle ; identifiant contrôlé également sur la page assistant.
- Une instruction donnée au modèle ne suffit plus à enregistrer un budget. L’outil émet une proposition ; l’utilisateur confirme explicitement dans Budgets, via une action authentifiée. Cela réduit le risque d’écriture induite par une injection de prompt.
- Réponses privées/API non stockables et non indexables ; politique de référent restrictive pour les retours d’authentification et bancaires.
- Suppression de l’accès administrateur pour lire les méthodes de connexion du compte : utilisation des identités de l’utilisateur authentifié.
- Routes de recette réservées au développement, même si le drapeau de données fictives est activé accidentellement en production. En-tête X-Powered-By désactivé.
- Validation stricte des dates de naissance : rejet des dates impossibles normalisées par JavaScript.

Sources : [bulletin officiel Next.js](https://nextjs.org/blog/august-2026-security-release) ; [recommandations OWASP contre les requêtes intersites](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

## Expérience client

- Tableau de bord : prélèvements et échéances remontés immédiatement sous les indicateurs ; alignement sur ordinateur, empilement sur téléphone.
- Transactions : champs de filtre de même hauteur, mois aligné, application explicite des filtres. Les débits et crédits portent sur tous les résultats filtrés, indépendamment de la pagination. Ce sont des flux bruts incluant les virements, pas la consommation nette ; opérations en attente séparées et aucune addition de devises différentes.
- Reclassement : catégorie et sous-catégorie dans deux contrôles distincts ; aucun enregistrement au changement de sélection. Portée explicite, limitée par défaut à l’opération, puis bouton de confirmation.
- Assistant : bouton Nouvelle séparé d’un sélecteur de conversations avec bouton Ouvrir ; contrôles adaptés aux petits écrans. Propositions budgétaires affichées avec lien de confirmation.
- Compte : sections informations, identification, connexions bancaires, langue/apparence et suppression mieux structurées ; états des connexions affichés, liens de gestion explicites. Le changement de mot de passe et la suppression restent accessibles avec un profil incomplet.
- Onboarding : prénom et pays en premier, étapes suivantes expliquées, informations supplémentaires facultatives repliées ; accès au compte et à la déconnexion.
- Graphique : précision minimale des graduations explicitée pour éviter une divergence serveur/navigateur et une erreur d’hydratation.

## Vérifications

- 512 tests réussis, 1 test d’évaluation IA réelle ignoré. Couverture ajoutée pour origine, taille JSON, propriété des conversations, absence d’écriture par le modèle, cache privé, total au-delà de 1 000 opérations et dates impossibles.
- Compilation Next.js 16.3.3 avec vérification TypeScript réussie.
- 24 vues : transactions, budgets, assistant, compte, bienvenue, tableau de bord en 320, 390, 768 et 1 440 px. Contrôle des débordements, position des panneaux, sélection de catégorie sans navigation et captures visuelles. Ce sont des émulations Chrome, pas des essais physiques Safari/iOS.
- 18 chemins HTTP publics : pages privées redirigées vers la connexion ; fichiers .env/.git et pages de recette inaccessibles ; endpoints cron masqués sans autorisation. HSTS, anti-framing, nosniff et CSP présents.
- Recherche de motifs de secrets dans 297 fichiers suivis : aucune correspondance détectée ; seul .env.example est suivi. Historique Git complet non audité.
- Recherche exacte de quatre valeurs privées de l’environnement local dans 38 fichiers publics compilés : aucune correspondance ; aucune source map publique dans cette compilation. Cela ne couvre pas les secrets inconnus ou les anciens déploiements.

## Avis et priorités suivantes

1. Conserver Budgets comme espace de pilotage : les transactions expliquent les mouvements, les budgets servent à décider de limites. Le lien depuis l’assistant donne désormais à cette page une fonction de confirmation claire.
2. Renforcer ensuite l’authentification sensible : MFA et authentification récente avant suppression, revue des sessions et alertes de connexion. Vérifier en environnement dédié l’isolation réelle entre deux comptes Supabase et les sauvegardes/restaurations.
3. Passer la CSP à des nonces ou hashes pour retirer script-src unsafe-inline. La CSP actuelle limite déjà les destinations et l’intégration en iframe, mais cette permission réduit sa protection contre certaines injections.
4. Faire évoluer les totaux filtrés vers une agrégation SQL protégée par RLS si le volume augmente. Le calcul actuel est complet, mais parcourt les projections monétaires des opérations correspondantes ; son coût croît avec l’historique.
5. Continuer le travail métier sur l’identification des abonnements entre plusieurs comptes, la concurrence des synchronisations et la conservation historique des limites budgétaires. Afficher la confiance des prélèvements détectés et permettre de corriger leur fréquence reste une amélioration utile.
6. Ajouter une recette avec comptes de test authentifiés, connexion bancaire sandbox et tests iOS/Safari. Les contrôles actuels ne prouvent pas le succès des écritures de bout en bout en production.
