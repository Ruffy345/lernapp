-- Schritt 6: Themen-Ebene zwischen Fach und Dokument

create table if not exists topics (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table topics enable row level security;

create policy "Nutzer sieht eigene Themen"
  on topics for select
  using (auth.uid() = user_id);

create policy "Nutzer legt eigene Themen an"
  on topics for insert
  with check (auth.uid() = user_id);

create policy "Nutzer aktualisiert eigene Themen"
  on topics for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Nutzer löscht eigene Themen"
  on topics for delete
  using (auth.uid() = user_id);

alter table documents
  add column if not exists topic_id uuid references topics(id) on delete set null;
