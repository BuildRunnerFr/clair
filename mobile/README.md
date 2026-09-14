# Clair — application mobile

Expo et React Native, partageant le code métier de l'application web sans le dupliquer.

## Démarrer

```bash
cp .env.example .env      # puis renseigner les deux valeurs Supabase
npm install
npm start                 # puis « i » pour iOS, « a » pour Android
```

## Pourquoi le web n'a pas bougé

Un monorepo canonique aurait placé les deux applications dans `apps/`. Cela imposait de déplacer
l'application Next.js — donc de reconfigurer Vercel, les chemins Supabase et les scripts — sur une
application déjà en production. Le risque n'était pas justifié par le bénéfice.

Le web reste donc à la racine et le mobile lit le code partagé un cran au-dessus, via
`watchFolders` dans `metro.config.js` et les alias de `tsconfig.json` :

```
../lib/       calculs métier, 47 modules purs
../types/     types de la base
../messages/  catalogues de traduction
```

`disableHierarchicalLookup` est indispensable : sans lui, un module partagé résoudrait ses
dépendances contre celles du web — dont Next.js, que React Native ne sait pas charger.

## Ce qui est partagé, et ce qui ne l'est pas

| Partagé tel quel | Propre au mobile |
|---|---|
| Détection d'abonnements, comparaison au mois type, conversion de devises, catégorisation | L'interface, entièrement |
| Les 253 clés de traduction | Le stockage de session, dans le trousseau du système |
| Les types de la base | La navigation |

Les 19 modules marqués `server-only` ne franchissent pas la frontière, et c'est voulu : ils
portent la clé de service, le secret TrueLayer et la clé OpenAI. Le mobile atteint ces opérations
par les routes HTTP — `/api/banking/sync`, `/api/categorization`, `/api/account` — que le web
expose précisément pour cela.

## Les données

Les vingt fonctions Postgres sont en `security invoker` et filtrent sur `auth.uid()`. Un
téléphone authentifié les appelle exactement comme un navigateur, sans backend intermédiaire.
C'est ce qui rend ce portage abordable.

## Ce qui reste à faire

- Les écrans, au-delà du premier
- L'authentification : Google et Apple en natif, puis les liens profonds pour la confirmation
  d'adresse et le retour bancaire (`associatedDomains` et `intentFilters` sont déjà déclarés
  dans `app.json`, le domaine doit encore servir les fichiers de vérification)
- La suppression de compte dans l'application, qu'Apple exige (règle 5.1.1(v)) — la route
  `DELETE /api/account` existe déjà pour ça
