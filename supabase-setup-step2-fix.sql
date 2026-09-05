-- Korrektur zu Schritt 2: Es fehlte eine Regel, die erlaubt, eigene
-- Dokumente zu AKTUALISIEREN (z.B. erkannten Text zu speichern). Ohne diese
-- Regel blockiert Supabase jedes Update automatisch, auch bei eigenen
-- Dokumenten — das führte zu den mysteriösen "Dokument nicht gefunden"-
-- Fehlern beim Speichern des erkannten Textes.

create policy "Nutzer aktualisiert eigene Dokumente"
  on documents for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
