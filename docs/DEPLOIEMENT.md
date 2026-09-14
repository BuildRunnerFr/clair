# Déploiement Vercel

## Pourquoi la région est fixée

`vercel.json` épingle la région `dub1` (Dublin). Le projet Supabase est en `eu-west-1`, en
Irlande, et chaque rendu de page enchaîne sept RPC vers cette base. Sans cette contrainte,
Vercel déploie par défaut aux États-Unis et chaque affichage du tableau de bord paie sept
allers-retours transatlantiques. Si tu changes de région Supabase, change celle-ci aussi.

## Ordre des opérations

L'ordre compte : l'URL de production doit exister avant d'être déclarée à TrueLayer et à
Supabase.

### 1. Premier déploiement

Importer le dépôt dans Vercel. Le build ne demande aucun réglage particulier
(`next build`, Node 22). Ce déploiement servira uniquement à obtenir l'URL.

### 2. Variables d'environnement Vercel

À déclarer dans *Settings → Environment Variables*, pour l'environnement Production.
Aucune ne doit être préfixée `NEXT_PUBLIC_` en dehors des trois premières, qui sont
publiques par construction.

| Variable | Valeur |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | l'URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | la clé publiable |
| `NEXT_PUBLIC_APP_URL` | **l'URL de production en https** |
| `SUPABASE_SERVICE_ROLE_KEY` | clé service role |
| `BANK_TOKEN_ENCRYPTION_KEY` | **secret** — `openssl rand -base64 32`, **différente de celle du sandbox** |
| `BANK_TOKEN_ENCRYPTION_KEYS` | **secret** — facultatif, remplace la précédente le jour d'une rotation (voir plus bas) |
| `ENABLE_MOCK_IMPORT` | `false` |
| `TRUELAYER_ENV` | `live` |
| `TRUELAYER_CLIENT_ID` | identifiant de production |
| `TRUELAYER_CLIENT_SECRET` | secret de production |
| `TRUELAYER_REDIRECT_URI` | `https://<domaine>/api/banking/truelayer/callback` |
| `TRUELAYER_LIVE_CONFIRMED` | `i-understand-this-reads-real-bank-accounts` |
| `TRUELAYER_PROVIDERS` | `fr-ob-all fr-stet-all` — voir ci-dessous |
| `CRON_SECRET` | **secret** — `openssl rand -base64 32`, protège la synchronisation planifiée |
| `RESEND_API_KEY` | **secret** — alerte d'exploitation ; sans elle rien n'est envoyé et rien ne casse |
| `ALERT_EMAIL_TO` | adresse qui reçoit les alertes — celle de l'exploitant, jamais celle d'un utilisateur |
| `ALERT_EMAIL_FROM` | facultatif — `alertes@clairfinances.com` une fois le domaine vérifié chez Resend |
| `LEGAL_PUBLISHER_NAME` | nom de l'éditeur — **obligatoire pour publier les mentions légales** |
| `LEGAL_PUBLISHER_ADDRESS` | adresse de l'éditeur |
| `LEGAL_CONTACT_EMAIL` | adresse de contact pour l'exercice des droits |
| `LEGAL_PUBLISHER_STATUS` | facultatif — « micro-entrepreneur », « SASU »… |
| `LEGAL_PUBLISHER_SIRET` | facultatif — dès qu'il existe |
| `LEGAL_PUBLICATION_DIRECTOR` | facultatif — la personne physique responsable |
| `LEGAL_VAT_MENTION` | facultatif — `TVA non applicable, article 293 B du CGI` en franchise |
| `OPENAI_API_KEY` | optionnel — sans elle, seules les règles locales catégorisent |
| `OPENAI_CATEGORIZATION_MODEL` | optionnel |

`NEXT_PUBLIC_APP_URL` n'est pas cosmétique : le lien de connexion envoyé par e-mail est
construit à partir de cette valeur. Laissée sur `localhost`, elle envoie à chaque
utilisateur un lien vers sa propre machine.

### 2 bis. Choisir les banques proposées

`TRUELAYER_PROVIDERS` filtre la liste que TrueLayer présente au moment de connecter une
banque. Laissée vide, elle affiche les 90 fournisseurs de tous les pays — dont une quinzaine
de « Revolut » identiques à l'œil, et rien n'indique lequel est français. C'est ce qui
produisait l'erreur « country not supported ».

Le filtre s'écrit `<pays>-<type>-<fournisseur>`, plusieurs valeurs séparées par une espace.
Le piège est le `<type>` : ce n'est pas une catégorie mais le préfixe de l'identifiant du
fournisseur, et la France en compte **deux**.

| Type | Ce qu'il couvre en France |
|---|---|
| `ob` | Revolut, Wise — les néobanques, en Open Banking |
| `stet` | Banque Populaire, BNP Paribas, Caisse d'Épargne, Crédit Agricole, Crédit Mutuel, Hello bank!, Société Générale — les banques traditionnelles, sur la norme PSD2 française |

`fr-ob-all` seul ne propose donc que Revolut et Wise. Pour les banques physiques il faut
`fr-stet-all`, d'où la valeur recommandée :

```
TRUELAYER_PROVIDERS=fr-ob-all fr-stet-all
```

La liste à jour se vérifie sans authentification :

```
curl -s https://auth.truelayer.com/api/providers \
  | python3 -c "import json,sys; [print(p['provider_id'], '—', p['display_name']) for p in json.load(sys.stdin) if p['country']=='fr']"
```

Cette liste est la seule source fiable : l'écran d'autorisation de TrueLayer construit son
choix côté navigateur, et son API de fournisseurs ignore le paramètre `providers`. Un filtre
mal écrit ne se voit donc qu'en cliquant sur « Connecter une banque ».

Plusieurs banques françaises courantes n'y figurent pas du tout — LCL, La Banque Postale,
Boursorama, Fortuneo, ING France entre autres. Aucun filtre ne les fera apparaître.

### 2 ter. Connexion Google et Apple

Le lien magique reste disponible, mais il impose un aller-retour par email à **chaque nouvel
appareil** — ce n'est pas un réglage de session trop court : `jwt_expiry` vaut une heure et la
rotation des jetons de rafraîchissement est active, donc une session dure des mois. C'est le
procédé lui-même qui frotte.

Le code est prêt : les boutons apparaissent sur `/login` et la route `/auth/callback` échange le
code contre une session. Il reste à déclarer les fournisseurs. **Tant que ce n'est pas fait, les
boutons renvoient une erreur** — le lien magique, lui, continue de fonctionner.

#### Google — gratuit

1. [console.cloud.google.com](https://console.cloud.google.com) → créer un projet.
2. *APIs & Services → OAuth consent screen* : type **External**, renseigner nom, email de
   support et email du développeur. Ajouter les liens vers la politique de confidentialité et
   les CGU — facultatif tant que l'application reste en test, exigé pour la publier.
3. *Credentials → Create credentials → OAuth client ID*, type **Web application**.
4. Dans **Authorized redirect URIs**, mettre l'URL de rappel **de Supabase**, et non celle du
   site : `https://<ref-projet>.supabase.co/auth/v1/callback`. C'est l'erreur la plus courante —
   Google renvoie vers Supabase, qui renvoie ensuite vers l'application.
5. Copier l'identifiant client et le secret.

#### Apple — nécessite un compte Apple Developer payant (99 $/an)

À faire de toute façon pour publier sur l'App Store, et **obligatoire** dès qu'un autre service
tiers est proposé sur iOS (règle 4.8 de l'App Store).

1. [developer.apple.com](https://developer.apple.com/account) → *Certificates, Identifiers &
   Profiles*.
2. *Identifiers* → créer un **App ID**, puis un **Services ID** : c'est ce dernier qui sert
   d'identifiant client.
3. Sur le Services ID, activer *Sign In with Apple* → *Configure* :
   - **Domains** : le domaine du site, sans schéma.
   - **Return URLs** : `https://<ref-projet>.supabase.co/auth/v1/callback`.
4. *Keys* → créer une clé avec *Sign In with Apple*, télécharger le fichier `.p8`. **Il n'est
   téléchargeable qu'une fois.** Noter le *Key ID* et le *Team ID*.
5. Supabase demande un secret client : il se génère à partir du `.p8`, du Key ID, du Team ID et
   du Services ID — la page du fournisseur Apple dans Supabase fournit le formulaire. Ce secret
   **expire au bout de six mois** et doit être régénéré : à noter quelque part, l'échéance passe
   inaperçue jusqu'à ce que plus personne ne puisse se connecter.

#### Supabase

*Authentication → Providers* : activer **Google** et **Apple**, coller les identifiants.

*Authentication → URL Configuration* → **Redirect URLs**, ajouter :

```
https://<domaine-de-production>/auth/callback
http://localhost:3000/auth/callback
```

Une URL absente de cette liste est silencieusement remplacée par la **Site URL** — c'est ce qui
renvoyait autrefois vers `localhost` depuis la production, sans aucun message d'erreur.

### 2 quater. Réglages email à vérifier dans Supabase

Le lien magique a été retiré de l'écran de connexion : il imposait un aller-retour par email à
chaque nouvel appareil. L'email reste indispensable pour deux choses, et **les deux dépendent de
réglages Supabase** :

*Authentication → Providers → Email* :

| Réglage | Valeur | Pourquoi |
|---|---|---|
| **Enable Email provider** | activé | Sans lui, ni création de compte ni mot de passe. |
| **Confirm email** | **activé** | C'est ce qui prouve que l'adresse appartient à qui s'inscrit. Désactivé, n'importe qui crée un compte au nom d'un autre et reçoit ses alertes budgétaires. |
| **Secure email change** | activé | Confirme le changement des deux côtés, ancienne et nouvelle adresse. |
| **Minimum password length** | `12` | Aligné sur la règle appliquée dans le code. |

L'envoi passe par le SMTP configuré (Resend). **Sans SMTP valide, la création de compte échoue
silencieusement** : le compte existe mais l'email de confirmation ne part pas, et l'utilisateur
ne peut jamais se connecter. Vérifier après tout changement de clé Resend.

Les liens de confirmation et de réinitialisation arrivent sur `/auth/confirm`, qui accepte les
types `signup`, `recovery`, `email` et `magiclink`. Un lien `recovery` mène ensuite à
`/compte/mot-de-passe` plutôt qu'au tableau de bord — l'utilisateur a une session valide mais
pas encore de mot de passe qu'il connaisse.

### 2 quinquies. Synchronisation planifiée

Sans elle, les données ne se rafraîchissent que si quelqu'un clique. Pour un usage personnel
cela passe ; dès qu'il y a des utilisateurs, personne ne clique — ils ouvrent l'application,
voient les dépenses d'il y a trois semaines, et concluent qu'elle ne fonctionne pas.

La tâche est déclarée dans `vercel.json` et appelle `GET /api/cron/sync` chaque jour à 6 h UTC.
Le plan Hobby de Vercel limite à **une exécution par jour** ; passer à pg_cron côté Supabase
lèvera cette limite le jour où elle gênera, sans rien changer au code — c'est la même route qui
sera appelée.

**Ce qui se marque « Sensitive » chez Vercel.** Tout ce qui est un identifiant : les clés de
service, les secrets bancaires, la clé de chiffrement, le secret du cron, la clé Resend. Une
variable marquée ainsi ne se relit plus depuis le tableau de bord — c'est le but, et c'en est
aussi la contrainte : perdue, elle se régénère chez le fournisseur, elle ne se retrouve pas. Le
reste — URL, drapeaux, adresses, noms de modèle — est de la configuration ordinaire, qu'on doit
pouvoir relire pour vérifier qu'elle est juste.

**`CRON_SECRET` est obligatoire.** Vercel envoie `Authorization: Bearer <CRON_SECRET>` à chaque
déclenchement. Sans ce secret la route refuse tout, y compris Vercel : une variable oubliée fait
échouer la tâche de façon visible plutôt que d'ouvrir en silence une route qui agit sur les
comptes de **tous** les utilisateurs. Un appelant non autorisé reçoit un 404, pas un 401 —
inutile de lui confirmer que la route existe.

Chaque exécution traite au plus 10 connexions, de la plus anciennement synchronisée à la plus
récente, et ignore celles synchronisées depuis moins de 6 heures. Les connexions laissées de
côté passent donc en tête à l'exécution suivante.

### 2 sexies. Rotation de la clé de chiffrement bancaire

Les jetons bancaires sont chiffrés en AES-256-GCM. Avec une clé unique, la changer rendrait
tous les jetons illisibles et imposerait à chaque utilisateur de reconnecter sa banque —
autrement dit, en cas de fuite, on ne la changerait pas. C'est exactement le problème.

La configuration accepte donc **plusieurs clés**, la première chiffrant et toutes déchiffrant :

```
BANK_TOKEN_ENCRYPTION_KEYS=v2:<clé base64>,v1:<clé base64>
```

`BANK_TOKEN_ENCRYPTION_KEY` reste pleinement acceptée, sous l'identifiant `legacy` : **rien n'est à
changer tant qu'aucune rotation n'est nécessaire.** `BANK_TOKEN_ENCRYPTION_KEYS`, si elle est
définie, a priorité sur elle.

#### Faire tourner une clé

1. Générer la nouvelle clé : `openssl rand -base64 32`
2. La placer **en tête** de `BANK_TOKEN_ENCRYPTION_KEYS`, en gardant l'ancienne derrière :
   `v2:<nouvelle>,v1:<ancienne>` — puis redéployer. Les nouveaux jetons portent `v2`, les
   anciens restent lisibles.
3. Réécrire les jetons existants : `npm run rotate:key -- --dry-run` pour voir, puis
   `npm run rotate:key`.
4. Une fois le script sans reste, **retirer l'ancienne clé** et redéployer.

⚠️ **Ne jamais retirer une clé avant l'étape 3.** Les jetons qu'elle a chiffrés deviendraient
définitivement illisibles, et chaque utilisateur devrait reconnecter sa banque.

Le script vérifie que chaque valeur réécrite se relit à l'identique avant de l'enregistrer : on
écrase des identifiants qu'aucune sauvegarde ne restaure. Il est idempotent — une exécution
interrompue se reprend en la relançant.

Une rotation ordinaire n'a rien d'urgent : les jetons d'accès expirent en une heure et sont
réécrits à chaque synchronisation. Le script sert aux jetons de rafraîchissement, qui vivent des
mois, et au cas qui compte — une clé compromise, à retirer aujourd'hui.

### 2 septies. Pages légales

`/mentions-legales` et `/confidentialite` sont en ligne et liées depuis le pied de page.

Leur contenu technique est complet et exact : destinataires réels des données, ce que chacun
voit, durées de conservation, droits et façon de les exercer. **Seule l'identité de l'éditeur
manque**, parce qu'elle dépend d'un statut juridique à enregistrer.

Tant que `LEGAL_PUBLISHER_NAME`, `LEGAL_PUBLISHER_ADDRESS` et `LEGAL_CONTACT_EMAIL` ne sont pas
définies, les pages affichent un encart disant que l'identification est en cours plutôt qu'un
gabarit à trous.

Pour une **micro-entreprise**, la mention « EI » ou « Entrepreneur individuel » doit accompagner
le nom depuis mai 2022, et le SIRET est obligatoire. Exemple de valeurs :

```
LEGAL_PUBLISHER_NAME       = Prénom NOM (EI)
LEGAL_PUBLISHER_STATUS     = Entrepreneur individuel — micro-entreprise
LEGAL_PUBLISHER_SIRET      = 000 000 000 00000
LEGAL_PUBLISHER_ADDRESS    = adresse de l'établissement déclarée à l'INSEE
LEGAL_CONTACT_EMAIL        = contact@clairfinances.com
LEGAL_PUBLICATION_DIRECTOR = Prénom NOM
LEGAL_VAT_MENTION          = TVA non applicable, article 293 B du CGI
``` Une mention légale incomplète est un manquement ; une mention légale affichant
« [VOTRE NOM] » est un manquement doublé d'un aveu de négligence — et c'est précisément ce que
regarde un classificateur venu vérifier si le site a un éditeur.

Ces pages sont volontairement en français seulement, alors que le reste du site est bilingue :
une clause mal traduite vaut pire que pas de traduction. La version anglaise viendra relue.

⚠️ **Ces textes n'ont pas été relus par un juriste.** Ils sont exacts sur les faits techniques,
ce qu'un modèle générique ne peut pas être, mais la qualification juridique du service et
l'étendue des obligations méritent un avis professionnel avant d'ouvrir le service au public.

### 3. Supabase — autoriser l'URL de redirection

*Authentication → URL Configuration* :

- **Site URL** : l'URL de production
- **Redirect URLs** : ajouter `https://<domaine>/auth/confirm`

Étape facile à oublier et dont l'omission ne se voit qu'à la première connexion réelle :
Supabase refuse toute redirection non déclarée, et le lien magique échoue sans autre
explication.

### 4. TrueLayer — enregistrer le callback

Dans la Console, environnement **Live** (les URL sont séparées par environnement) :
`https://<domaine>/api/banking/truelayer/callback`

### 5. Vérifier avant d'ouvrir

```bash
npx tsx --env-file=.env.production.local scripts/check-production-config.ts
```

Le script rejoue les règles que l'application applique elle-même au démarrage, et vérifie en
plus que le callback et l'application partagent la même origine, que l'import de
démonstration est désactivé, et qu'un `client_id` sandbox ne traîne pas dans une
configuration live. Il n'affiche jamais la valeur d'une variable.

## Après le premier déploiement réussi

- Rejouer un cycle complet : connexion par lien magique, connexion bancaire, synchronisation.
- Vérifier que la région appliquée est bien `dub1` dans les logs de fonction.
- Le consentement bancaire expire vers 90 jours ; l'application bascule alors la connexion en
  `reauthorization_required` et propose une reconnexion (voir `docs/TRUELAYER_SANDBOX.md`).

## Limites connues

- **Pas de Content-Security-Policy.** Les autres en-têtes sont posés dans `vercel.json`, mais
  une CSP demande de gérer les scripts inline de Next.js par nonce ; ajoutée à l'aveugle,
  elle casserait l'application. À traiter séparément.
- **La clé de chiffrement reste une variable d'environnement**, lisible par quiconque accède
  à l'environnement du serveur. Voir les limites listées dans `docs/TRUELAYER_SANDBOX.md`.
