-- Schritt 4: Zusammenfassungen pro Fach, mit Quellenverweisen zurück zu den Dokumenten.

create table if not exists summaries (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  generated_at timestamptz not null default now()
);

alter table summaries enable row level security;

create policy "Nutzer sieht eigene Zusammenfassungen"
  on summaries for select
  using (auth.uid() = user_id);

create policy "Nutzer legt eigene Zusammenfassungen an"
  on summaries for insert
  with check (auth.uid() = user_id);

create policy "Nutzer aktualisiert eigene Zusammenfassungen"
  on summaries for update
  using (auth.uid() = user_id);
