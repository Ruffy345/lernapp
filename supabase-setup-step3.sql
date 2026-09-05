-- Schritt 3 (Nachbesserung): Text wird einmalig beim Hochladen erkannt und gespeichert,
-- statt bei jeder Frage die Originaldatei erneut an Gemini zu schicken.

alter table documents
  add column if not exists extracted_text text,
  add column if not exists extraction_error text;
