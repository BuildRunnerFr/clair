-- Se souvenir d'avoir essayé, pour ne pas réessayer toujours les mêmes.
--
-- La catégorisation soumet à l'IA les marchands inconnus, vingt-cinq par passe, pris dans
-- l'ordre des transactions les plus récentes. Cet ordre est stable : un marchand que l'IA ne
-- sait pas classer reste non catégorisé, donc reste en tête, donc repasse à chaque fois — et
-- occupe indéfiniment une place que personne d'autre n'obtiendra jamais.
--
-- Constaté après la reprise de deux ans d'historique : 679 transactions, 369 marchands
-- distincts, aucun couvert par les 282 règles existantes. À vingt-cinq par passe et deux passes
-- par jour, il aurait fallu une semaine — à condition qu'aucun marchand ne bloque la file.
--
-- La date de tentative permet de servir d'abord ceux qu'on n'a jamais essayés, puis les plus
-- anciennement tentés. Elle est distincte de categorized_at, qui date un succès : on veut
-- pouvoir dire « essayé, sans résultat », ce qu'aucune des deux colonnes existantes n'exprimait.
alter table public.transactions
  add column if not exists categorization_attempted_at timestamptz;

-- L'index sert exactement la requête de rattrapage : les non catégorisées d'un utilisateur,
-- jamais tentées d'abord.
create index if not exists transactions_categorization_queue_idx
  on public.transactions (user_id, categorization_attempted_at nulls first)
  where category = 'Uncategorized';
