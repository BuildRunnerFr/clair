-- Un prélèvement récurrent se juge sur ce qui sera débité la prochaine fois, pas sur la
-- moyenne de ce qui l'a été. Un loyer passé de 600 à 615 € s'affichait à 605 € : un
-- montant qui n'a jamais été prélevé et ne le sera jamais.
--
-- La moyenne est conservée : elle reste la bonne grandeur pour un montant qui varie
-- naturellement, comme une facture d'énergie.
alter table public.subscriptions
  add column if not exists latest_amount numeric(14, 2),
  add column if not exists previous_amount numeric(14, 2);

-- Rattrape les lignes déjà écrites, faute de quoi elles afficheraient un montant vide.
update public.subscriptions set latest_amount = average_amount where latest_amount is null;
