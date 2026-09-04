-- In Supabase: SQL Editor -> "New query" -> dies einfügen und ausführen.

create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  exam_date date,
  created_at timestamptz not null default now()
);

alter table subjects enable row level security;

-- Nur der eingeloggte Nutzer darf seine eigenen Fächer sehen/bearbeiten/löschen.
create policy "Nutzer sieht eigene Fächer"
  on subjects for select
  using (auth.uid() = user_id);

create policy "Nutzer legt eigene Fächer an"
  on subjects for insert
  with check (auth.uid() = user_id);

create policy "Nutzer bearbeitet eigene Fächer"
  on subjects for update
  using (auth.uid() = user_id);

create policy "Nutzer löscht eigene Fächer"
  on subjects for delete
  using (auth.uid() = user_id);
