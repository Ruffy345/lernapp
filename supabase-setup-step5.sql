-- Schritt 5: Karteikarten mit Spaced Repetition

create table if not exists flashcards (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  question text not null,
  answer text not null,
  stage integer not null default 0,
  next_review_date date not null default current_date,
  created_at timestamptz not null default now()
);

alter table flashcards enable row level security;

create policy "Nutzer sieht eigene Karteikarten"
  on flashcards for select
  using (auth.uid() = user_id);

create policy "Nutzer legt eigene Karteikarten an"
  on flashcards for insert
  with check (auth.uid() = user_id);

create policy "Nutzer aktualisiert eigene Karteikarten"
  on flashcards for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Nutzer löscht eigene Karteikarten"
  on flashcards for delete
  using (auth.uid() = user_id);
