# Sécurité

## Mesures actives

- Aucun identifiant Revolut ni numéro de carte n’est collecté. Les seuls credentials bancaires pris en charge sont les tokens TrueLayer Sandbox nécessaires à la Data API.
- Les repositories métier utilisent la publishable key et la session Auth; PostgreSQL applique donc RLS. Une service-role key est désormais requise uniquement dans les modules serveur isolés qui appellent les quatre RPC privées de l’intégration Sandbox.
- Toutes les tables métier, y compris `budgets` et `bank_connections`, ont RLS activé. L’accès `anon` est révoqué et les policies ciblent uniquement `authenticated` avec `auth.uid() = user_id`.
- Les écritures de transactions vérifient également que `account_id` appartient à l’utilisateur connecté, empêchant les références croisées entre utilisateurs.
- Les pages privées sont protégées dans le proxy et revérifient l’utilisateur avec `auth.getUser()` côté serveur. `getSession()` n’est jamais utilisé pour une décision d’autorisation.
- Les actions de magic link, logout et import sont exécutées côté serveur. L’email est validé avant envoi.
- `raw_data` est optionnel et limité par liste blanche à deux métadonnées primitives (`source`, `safeReference`). Le payload mock complet n’est pas stocké.
- Les doublons sont bloqués à la fois par l’upsert applicatif et par une contrainte unique PostgreSQL.
- Les paramètres du dashboard sont validés et les données ne sont jamais agrégées entre devises différentes.
- Les RPC financières sont `SECURITY INVOKER`, ne reçoivent aucun `user_id`, filtrent avec `auth.uid()` et ne sont exécutables que par `authenticated`.
- `bank_connections` ne contient aucun token. Son curseur de synchronisation n’est pas un secret d’authentification; les tokens Sandbox chiffrés vivent séparément dans le schéma `private`.

## Points opérationnels

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` est publique par conception; elle n’accorde aucun accès sans les policies. `SUPABASE_SERVICE_ROLE_KEY` reste exclusivement dans les variables serveur et n’est importée par aucun composant client.
- `ENABLE_MOCK_IMPORT` est une variable serveur. La laisser à `false` en production si les utilisateurs ne doivent pas importer le jeu de démonstration.
- Configurer strictement les URLs de redirection Auth dans Supabase pour éviter les redirections vers un domaine non approuvé.
- Le Magic Link arrive sur une page intermédiaire en lecture seule; seul le `POST` déclenché par le bouton consomme le token. La page est non indexable, non mise en cache et applique une politique de referrer restrictive.
- Désactiver le click tracking Resend pour éviter la réécriture des liens d’authentification.
- Pour la production, configurer un SMTP fiable, surveiller les limites d’envoi et envisager CAPTCHA/rate limiting sur les demandes de magic link.
- Les erreurs affichées lors de la connexion restent génériques afin de limiter l’énumération d’adresses email.

## Avant un passage en Live

TrueLayer n’est implémenté qu’en Sandbox. Une revue dédiée devra valider un coffre de secrets ou KMS, la rotation des clés, la révocation, la rétention, les logs d’audit et la liste blanche exacte des champs bancaires avant toute activation Live.

## TrueLayer Sandbox

- Le client secret, la service-role et la clé AES ne sont accessibles que dans des modules serveur et ne portent jamais le préfixe `NEXT_PUBLIC_`.
- Les tokens sont chiffrés AES-256-GCM puis stockés dans le schéma PostgreSQL `private`, non exposé par la Data API.
- Les RPC d’accès aux ciphertexts sont retirées à `public`, `anon` et `authenticated`, puis accordées uniquement à `service_role`.
- L’état OAuth brut n’est jamais stocké; seul son SHA-256 est conservé dix minutes et consommé atomiquement.
- Les codes OAuth, tokens et secrets ne sont jamais loggés. Les erreurs affichées sont génériques.
- Les métriques de synchronisation ne contiennent que des compteurs et durées; aucun identifiant fournisseur, commerçant ou détail de transaction n’est journalisé.
- Un verrou PostgreSQL lié à `auth.uid()` et à la connexion empêche deux synchronisations simultanées. Il expire automatiquement après dix minutes.
- Cette architecture reste provisoire pour le Sandbox. Un coffre managé, une rotation des clés et un audit dédié sont requis avant Live.

## Catégorisation OpenAI

- `OPENAI_API_KEY` est une variable exclusivement serveur et n’a jamais de préfixe `NEXT_PUBLIC_`.
- Le provider envoie uniquement un commerçant normalisé, une description nettoyée et tronquée, un montant, une devise et la taxonomie. Aucun payload TrueLayer brut, token, IBAN, numéro de compte ou identité utilisateur n’est envoyé.
- Les emails, URLs, IBAN et longues suites numériques manifestes sont masqués avant l’appel.
- La Responses API est appelée avec `store: false`, un timeout de douze secondes, un retry maximum et un JSON Schema strict. Zod effectue une seconde validation locale de la catégorie, sous-catégorie, confiance et longueur du motif.
- Une erreur IA est non bloquante pour la synchronisation bancaire. Aucun prompt ni résultat détaillé n’est journalisé; seules des métriques agrégées le sont.
- L’IA ne calcule aucun total, budget ou analytics financier.
