# Préparation Open Banking — aucun fournisseur connecté

## Modèle

`bank_connections` contient uniquement l’identité logique d’une connexion, son statut et son état de synchronisation. Aucun access token, refresh token, secret client, identifiant Revolut ou numéro de carte n’est prévu dans cette table.

`BankProvider` conserve le contrat par plage de dates et expose facultativement `getTransactionsIncremental`. Un fournisseur avec curseur retourne une page, un prochain curseur et `hasMore`. Sans curseur, la stratégie relit trois jours avant `last_synced_at` afin de capter les opérations mises à jour ou passées de pending à settled.

## Mapping

`mapExternalTransaction` est la frontière entre le format fournisseur et le format interne. Il :

- normalise le commerçant ;
- convertit la date en ISO UTC ;
- conserve le montant signé et la devise d’origine ;
- limite les métadonnées à une liste blanche ;
- laisse la catégorisation au moteur de règles.

L’unicité `(user_id, account_id, provider_transaction_id)` rend le chevauchement temporel idempotent. Lors de l’intégration réelle, il faudra décider si une transaction pending et sa version settled partagent le même identifiant; sinon, un identifiant de rapprochement supplémentaire sera nécessaire.

## Futurs secrets serveur uniquement

Les champs suivants ne doivent pas être ajoutés aux tables publiques exposées par la Data API : access token, refresh token, client secret, clé de signature, consent token et payload d’autorisation. Ils devront être stockés dans un coffre ou un schéma privé chiffré, accessibles uniquement à un backend dédié. Aucun de ces champs n’est implémenté aujourd’hui.

## Séquence future

1. Charger la connexion appartenant à l’utilisateur.
2. Verrouiller ou sérialiser la synchronisation concurrente.
3. Choisir curseur ou plage avec chevauchement.
4. Paginer jusqu’à `hasMore = false`.
5. Normaliser et upsert les comptes puis transactions.
6. Mettre à jour le curseur uniquement après succès complet.
7. En cas d’échec, conserver l’ancien curseur pour permettre une reprise idempotente.
