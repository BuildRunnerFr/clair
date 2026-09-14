-- Deux banques sur un même compte, et deux synchronisations qui se croisent.
--
-- La détection des récurrences est rejouée à chaque synchronisation, sur toutes les
-- transactions de l'utilisateur, puis l'ensemble est réécrit : suppression, puis insertion.
-- Le verrou de synchronisation est pris par connexion — il le faut, deux banques doivent
-- pouvoir se synchroniser en même temps —, si bien que rien n'empêchait les deux réécritures
-- de s'entrelacer.
--
--   A supprime · B supprime · A insère · B insère  →  chaque abonnement en double.
--
-- Aucune contrainte ne s'y opposait : la table n'avait qu'un index sur user_id. L'utilisateur
-- aurait vu Spotify deux fois et un coût annuel doublé, sans rien avoir fait d'anormal — juste
-- cliqué sur deux boutons de synchronisation à quelques secondes d'intervalle.
--
-- La clé naturelle est le marchand, sa devise et le sens du flux : un même marchand peut
-- prélever en euros et en livres, et un même nom peut désigner un débit et un crédit.
delete from public.subscriptions a
using public.subscriptions b
where a.user_id = b.user_id
  and a.merchant_name = b.merchant_name
  and a.currency = b.currency
  and a.direction = b.direction
  and a.ctid > b.ctid;

create unique index if not exists subscriptions_user_merchant_key
  on public.subscriptions (user_id, merchant_name, currency, direction);
