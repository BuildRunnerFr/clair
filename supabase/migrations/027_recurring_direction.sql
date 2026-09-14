-- Les encaissements réguliers, rangés avec les prélèvements.
--
-- Un salaire se reconnaît exactement comme un abonnement — même cadence, même stabilité du
-- montant — et seule la direction du montant les distingue. La détection est donc la même, et
-- la table qui la conserve peut être la même : une colonne de sens suffit.
--
-- La prévision de solde a besoin des deux. Une courbe qui ne descend que des prélèvements sans
-- jamais remonter du salaire décrit une ruine, pas un mois.
--
-- Le défaut vaut 'debit' : les lignes existantes sont toutes des abonnements, et rien n'a besoin
-- d'être réécrit. La détection est de toute façon rejouée à chaque synchronisation.
alter table public.subscriptions
  add column if not exists direction text not null default 'debit'
  check (direction in ('debit', 'credit'));

create index if not exists subscriptions_user_direction_idx
  on public.subscriptions (user_id, direction) where active;
