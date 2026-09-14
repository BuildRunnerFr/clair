-- Nom de la banque derrière une connexion.
--
-- Jusqu'ici une connexion ne portait que « truelayer » et un identifiant haché. Tant qu'il n'y
-- en avait qu'une, cela suffisait ; dès qu'un utilisateur en ouvre une seconde, les deux
-- s'affichent à l'identique et rien ne dit laquelle synchroniser.
--
-- Le nom vient de l'agrégateur (endpoint /me), et reste nullable : une connexion existante n'en
-- a pas encore, et l'absence de nom ne doit jamais empêcher une connexion de fonctionner.
alter table public.bank_connections add column if not exists display_name text;
