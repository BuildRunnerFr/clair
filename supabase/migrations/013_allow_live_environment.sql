-- La contrainte de 004 figeait l'environnement à 'sandbox' au niveau de la base, en écho au
-- garde-fou applicatif qui refusait alors le live. Ce garde-fou a été remplacé par des
-- conditions vérifiées (reconnaissance explicite, https, clé de chiffrement réelle) ; la
-- contrainte doit suivre, sinon une connexion live échoue à l'écriture après une
-- authentification bancaire réussie — le pire moment pour découvrir le blocage.
--
-- La contrainte n'est pas supprimée mais resserrée sur les deux valeurs admises : laisser le
-- champ libre autoriserait n'importe quelle chaîne, et l'application filtre les connexions
-- sur cette colonne.
alter table public.bank_connections
  drop constraint if exists bank_connections_environment_check;

alter table public.bank_connections
  add constraint bank_connections_environment_check check (environment in ('sandbox', 'live'));
