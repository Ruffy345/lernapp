-- Schritt 2: Dokumenten-Upload
-- Im Supabase-Dashboard: SQL Editor -> New query -> dies ausführen.

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  uploaded_at timestamptz not null default now()
);

alter table documents enable row level security;

create policy "Nutzer sieht eigene Dokumente"
  on documents for select
  using (auth.uid() = user_id);

create policy "Nutzer legt eigene Dokumente an"
  on documents for insert
  with check (auth.uid() = user_id);

create policy "Nutzer löscht eigene Dokumente"
  on documents for delete
  using (auth.uid() = user_id);

-- ACHTUNG: Bevor dieser Teil funktioniert, musst du im Supabase-Dashboard
-- unter "Storage" manuell einen neuen Bucket namens "documents" anlegen
-- (als PRIVATE Bucket, nicht public!). Erst danach diese Policies ausführen:

create policy "Nutzer lädt eigene Dateien hoch"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Nutzer sieht eigene Dateien"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Nutzer löscht eigene Dateien"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
