# Clair — suivi financier personnel

Application Next.js de suivi financier personnel avec authentification par email et mot de passe, fournisseurs OAuth et stockage PostgreSQL/Supabase. TrueLayer Data API v1 prend en charge Sandbox et Live avec validation de configuration ; `MockBankProvider` reste disponible pour les démonstrations. La catégorisation automatique peut utiliser un modèle OpenAI côté serveur après les règles locales.

Voir `docs/AUDIT-2026-09-07.md` pour les vérifications UX, navigation, SEO et les limites de validation.

## Prérequis

- Node.js 20.9+
- un projet Supabase
- facultatif : Supabase CLI pour exécuter les tests RLS locaux

## Configuration Supabase manuelle

1. Créer un projet sur Supabase.
2. Dans **SQL Editor**, exécuter les migrations dans l’ordre. Pour le projet déjà opérationnel avec TrueLayer Sandbox, exécuter maintenant uniquement `supabase/migrations/005_dynamic_currencies_sync_lock.sql`.
3. Dans **Authentication > Providers > Email**, laisser Email activé. Aucun autre provider n’est nécessaire.
4. Dans **Authentication > URL Configuration** :
   - Site URL locale : `http://localhost:3000`
   - Redirect URL locale : `http://localhost:3000/auth/confirm`
   - ajouter ensuite les mêmes URLs pour le domaine Vercel.
5. Dans **Authentication > Email Templates > Magic Link**, utiliser un lien PKCE compatible SSR :

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email">Se connecter</a>
```

Le lien ouvre une page intermédiaire qui ne consomme pas le token lors du `GET`. L’utilisateur doit confirmer avec le bouton, puis une Server Action appelle `verifyOtp`. Ce deuxième geste empêche les scanners d’emails qui préchargent les liens de consommer le token à la place de l’utilisateur. Dans Resend, laisser le click tracking désactivé pour les emails d’authentification.

6. Depuis le dialogue **Connect** du projet, récupérer la Project URL et la Publishable key. Pour TrueLayer Sandbox uniquement, récupérer aussi la service-role key; elle doit rester exclusivement côté serveur et ne doit jamais recevoir un préfixe `NEXT_PUBLIC_`.

## Variables d’environnement

Créer `.env.local` à partir de `.env.example` :

```bash
cp .env.example .env.local
```

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_APP_URL=http://localhost:3000
ENABLE_MOCK_IMPORT=true
TRUELAYER_CLIENT_ID=sandbox-...
TRUELAYER_CLIENT_SECRET=...
TRUELAYER_REDIRECT_URI=http://localhost:3000/api/banking/truelayer/callback
TRUELAYER_ENV=sandbox
SUPABASE_SERVICE_ROLE_KEY=...
BANK_TOKEN_ENCRYPTION_KEY=...
OPENAI_API_KEY=...
OPENAI_CATEGORIZATION_MODEL=gpt-5.6-luna
```

La Project URL et la Publishable key sont conçues pour le navigateur; la sécurité des données métier repose sur la session Auth et les policies RLS. Le client secret TrueLayer, la service-role et la clé de chiffrement sont exclusivement serveur. Générer cette dernière une seule fois avec `openssl rand -base64 32`.

## Lancer et valider

```bash
npm install
npm run dev
```

Ouvrir `http://localhost:3000`, créer un compte depuis le formulaire de connexion, confirmer son email si demandé et compléter son profil. L’import de démonstration est disponible lorsque `ENABLE_MOCK_IMPORT=true`.

```bash
npm test
npm run lint
npm run build
```

Avec Supabase CLI et Docker, les tests SQL RLS peuvent aussi être exécutés sur la base locale :

```bash
supabase start
supabase db reset
supabase test db
```

## Fonctionnement

- Le client Supabase SSR stocke la session dans des cookies et `proxy.ts` rafraîchit/valide les claims.
- Les pages `/dashboard` exigent une identité vérifiée côté serveur.
- L’action d’import vérifie de nouveau l’utilisateur, crée/upsert ses comptes mock puis synchronise ses transactions.
- La contrainte PostgreSQL `(user_id, account_id, provider_transaction_id)` et l’upsert rendent l’import idempotent.
- Le repository Supabase utilise la publishable key avec la session de l’utilisateur : il ne contourne jamais RLS.
- Le dashboard appelle des RPC PostgreSQL `SECURITY INVOKER` pour les totaux, catégories, budgets, commerçants et transactions récentes. Aucun montant n’est agrégé dans le navigateur.
- Le tableau de bord peut restituer les montants dans la devise de base du profil avec les taux historiques disponibles.
- Les budgets sont uniques par utilisateur, catégorie et devise. La colonne historique `categories.monthly_budget` reste présente pour compatibilité mais n’est plus utilisée.

## Budgets et analytics SQL

Après la migration 003, la page `/budgets` permet de définir, modifier et supprimer les limites mensuelles. Le formulaire « Ajouter un budget » propose un catalogue de catégories de référence même en l’absence de transaction. Les dépenses du mois, le reste et le pourcentage consommé sont calculés par `finance_budget_status`.

Les RPC disponibles sont :

- `finance_monthly_summary`
- `finance_spending_by_category`
- `finance_budget_status`
- `finance_top_merchants`
- `finance_spending_between`
- `finance_recent_transactions`

Elles ne prennent jamais de `user_id`; l’identité provient exclusivement de `auth.uid()`. Leur exécution est retirée à `public` et `anon`, puis accordée à `authenticated`.

## Préparation Open Banking

La migration 004 ajoute l’intégration TrueLayer Sandbox et son stockage privé chiffré. La migration 005 ajoute la découverte dynamique des devises et le verrou de synchronisation. Sur un projet V3 déjà migré, exécuter successivement `004_truelayer_sandbox.sql` puis `005_dynamic_currencies_sync_lock.sql`, compléter les variables serveur de `.env.example`, puis consulter `docs/TRUELAYER_SANDBOX.md`. Le mode Live exige les garde-fous de `lib/banking/truelayer/config-schema.ts` et la configuration décrite dans `docs/OPEN_BANKING.md`.

Les devises disponibles proviennent de l’union SQL des comptes, transactions et budgets du seul utilisateur connecté. Le choix explicite est conservé dans un cookie non sensible `finance_currency`; à défaut, la devise ayant l’activité transactionnelle la plus récente est sélectionnée. Les montants d’origine conservent leur code ISO ; la restitution dans la devise de base utilise le système de conversion historique.

La migration 006 ajoute la provenance des catégories et enrichit `merchant_rules`. Ajouter `OPENAI_API_KEY` dans l’environnement serveur pour activer la catégorisation automatique; `OPENAI_CATEGORIZATION_MODEL` vaut `gpt-5.6-luna` par défaut. Sans clé, les règles locales continuent de fonctionner et la synchronisation bancaire reste opérationnelle. Le jeu de référence réseau se lance séparément avec `npm run test:ai-eval`. Voir `docs/AI_CATEGORIZATION.md`.

## Déploiement Vercel

Ajouter les variables de `.env.example` dans Vercel, en gardant strictement les secrets sans préfixe `NEXT_PUBLIC_`. Régler `NEXT_PUBLIC_APP_URL` sur le domaine de déploiement et ajouter ce domaine ainsi que `/auth/confirm` aux Redirect URLs Supabase. Le mode Sandbox reste le choix de développement. Le mode Live exige une configuration fournisseur validée ; exécuter le contrôle de production avec les variables de l’environnement cible. Après validation du jeu de démonstration, régler `ENABLE_MOCK_IMPORT=false` si l’import ne doit plus être disponible en production.

Voir `SECURITY.md` avant tout ajout d’un fournisseur bancaire.
