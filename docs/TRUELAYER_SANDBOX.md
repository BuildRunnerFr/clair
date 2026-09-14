# TrueLayer Data API v1 — Sandbox uniquement

Cette intégration est volontairement verrouillée sur `truelayer-sandbox.com`. Elle demande uniquement `info accounts balance transactions offline_access` et affiche seulement le provider `uk-cs-mock`. Aucun paiement, direct debit ou standing order n’est demandé.

## Configuration

Dans TrueLayer Console Sandbox, ajouter exactement cette Redirect URI :

```text
http://localhost:3000/api/banking/truelayer/callback
```

Dans `.env.local`, configurer les identifiants Sandbox, puis ajouter les deux secrets serveur nécessaires au stockage isolé :

```dotenv
TRUELAYER_CLIENT_ID=sandbox-...
TRUELAYER_CLIENT_SECRET=...
TRUELAYER_REDIRECT_URI=http://localhost:3000/api/banking/truelayer/callback
TRUELAYER_ENV=sandbox
SUPABASE_SERVICE_ROLE_KEY=...
BANK_TOKEN_ENCRYPTION_KEY=...
```

Générer la clé de chiffrement une seule fois avec `openssl rand -base64 32`. Une rotation nécessite de rechiffrer les tokens existants.

## Flux

Le bouton du dashboard envoie un POST serveur. Un état aléatoire de 256 bits est haché avant stockage, lié à `auth.uid()`, expire après dix minutes et est consommé atomiquement une seule fois. Le callback ne fait confiance à aucun `user_id` fourni par le navigateur.

Les access et refresh tokens sont chiffrés en AES-256-GCM. Les ciphertexts vivent dans `private.bank_connection_secrets`, schéma non exposé à la Data API. Quatre RPC `SECURITY DEFINER`, exécutables uniquement avec la service-role serveur, donnent au backend l’accès minimal nécessaire. La service-role et la clé de chiffrement ne doivent jamais être utilisées dans un composant client.

## Data v1 et identifiant de connexion

TrueLayer Data API v1 ne fournit pas de ressource `connection_id`. L’application calcule donc un identifiant opaque stable à partir des IDs de comptes autorisés. Ce hash sert seulement à l’idempotence des métadonnées; ce n’est ni un token ni un identifiant bancaire affiché.

Pour les transactions, `normalised_provider_transaction_id` est prioritaire, puis `provider_transaction_id`. Une même clé est upsertée : une opération pending devenue settled met à jour la ligne. Si un provider Sandbox ne fournit aucun identifiant stable et change aussi `transaction_id`, un rapprochement heuristique futur sera nécessaire.

## Synchronisation et performances

La première synchronisation relit au maximum 90 jours. Les suivantes repartent de `last_synced_at - 3 jours`, ce qui couvre les corrections rétroactives et le passage pending vers settled sans reparcourir tout l’historique.

Les lectures settled et pending sont parallélisées avec une concurrence maximale de quatre requêtes. Chaque appel HTTP expire après 20 secondes. Data API v1 renvoie normalement toute la plage sans pagination; le provider sait néanmoins suivre un `next_cursor` si le Sandbox en fournit un, avec une limite de 20 pages.

Les transactions sont comparées et upsertées dans Supabase par lots de 200. Une synchronisation de quelques centaines de lignes produit ainsi quelques requêtes SQL au lieu d’un SELECT et d’un UPSERT séquentiels par transaction. Un verrou PostgreSQL atomique, limité à la connexion et valable dix minutes, bloque les doubles synchronisations; un verrou expiré peut être repris automatiquement.

Le serveur écrit un événement `[bank-sync]` contenant uniquement les durées, nombres d’appels, pages, comptes et transactions. Aucun identifiant de compte, libellé bancaire, token ou secret n’est journalisé.

## Limites avant Live

- Stockage provisoire adapté au Sandbox; utiliser un coffre managé ou une stratégie de chiffrement avec rotation/KMS avant Live.
- Le verrou PostgreSQL expire après dix minutes et n’est pas prolongé par heartbeat; ce délai est volontairement supérieur à la durée normale attendue en Sandbox.
- Pas de webhook ni de synchronisation planifiée.
- Pas de gestion des cartes, uniquement des comptes.
- Les consentements expirés nécessitent une reconnexion manuelle.
- L’environnement Live est rejeté par validation et aucun endpoint Live n’existe dans le provider.

## Passage en production (live)

Le code sait viser la production, mais refuse de le faire sur une seule variable
d'environnement. `TRUELAYER_ENV=live` est rejeté seul : une bascule accidentelle
(un `.env` recopié d'un environnement à l'autre, une faute de frappe) ferait lire de vrais
comptes bancaires sous un vrai consentement.

### Ce que le code exige

| Condition | Pourquoi |
|---|---|
| `TRUELAYER_LIVE_CONFIRMED=i-understand-this-reads-real-bank-accounts` | Une valeur qu'on ne peut pas poser par accident |
| `TRUELAYER_REDIRECT_URI` en `https` | Un code d'autorisation transitant en clair est interceptable, et il s'échange contre un jeton d'accès |
| `BANK_TOKEN_ENCRYPTION_KEY` : 32 octets réels | Vérifié au démarrage plutôt qu'à la première écriture, pour échouer avant d'avoir un jeton à protéger |
| Clé non constante | Une clé de remplissage a la bonne taille et aucune entropie |

Ces règles ne s'appliquent pas au sandbox : les imposer localement rendrait le développement
impraticable sans rien protéger. Elles sont couvertes par `tests/truelayer-live-config.test.ts`.

### Sélection de la banque

En sandbox, `providers` est fixé à `uk-cs-mock`. En live, il est laissé vide afin que
TrueLayer affiche son propre sélecteur — c'est là que l'utilisateur choisit sa banque,
Revolut incluse. `TRUELAYER_PROVIDERS` permet de le restreindre si nécessaire.

### Ce qui reste à traiter avant d'exposer l'application à d'autres utilisateurs

Ces points ne bloquent pas un usage personnel, mais doivent être tranchés avant toute
ouverture plus large :

- **La clé de chiffrement est une variable d'environnement.** Elle protège les jetons au
  repos, mais quiconque lit l'environnement du serveur la lit aussi. Un coffre ou un KMS
  déplacerait ce secret hors de portée du processus applicatif.
- **Aucune rotation de clé.** Les jetons sont chiffrés avec une clé unique et permanente ;
  une rotation demanderait un déchiffrement/rechiffrement de `private.bank_connection_secrets`.
- **Pas de révocation côté fournisseur.** Supprimer une connexion efface le secret local,
  mais ne révoque pas le consentement chez TrueLayer.
- **Pas de journal d'audit** des accès aux jetons.
- **Le consentement expire** (typiquement 90 jours) : l'application doit inviter à
  reconnecter plutôt que d'échouer silencieusement en synchronisation.
