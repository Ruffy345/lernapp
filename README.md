# Lernordner — Schritt 1: Login + Fächer-Verwaltung

## Was hier drin ist

- Login/Registrierung per E-Mail + Passwort (Supabase Auth)
- Fächer anlegen, mit optionalem Prüfungsdatum + Countdown-Anzeige
- Fächer löschen
- Alles synct automatisch über dein Supabase-Konto — funktioniert auf iPad, Handy, Laptop gleich

## Einrichtung

### 1. Supabase-Projekt anlegen (kostenlos)

1. Auf https://supabase.com registrieren, neues Projekt erstellen
2. Im Dashboard: **Project Settings → API** → dort findest du `Project URL` und den `anon public` Key
3. Kopiere `.env.example` zu `.env` und trage beide Werte ein

### 2. Datenbank-Tabelle anlegen

1. Im Supabase-Dashboard: **SQL Editor → New query**
2. Inhalt von `supabase-setup.sql` einfügen und ausführen
3. Das legt die `subjects`-Tabelle an, inkl. Sicherheitsregeln, sodass wirklich nur du deine eigenen Fächer sehen kannst

### 3. Lokal starten

```bash
npm install
npm run dev
```

Öffnet sich standardmäßig auf `http://localhost:5173`.

### 4. Später kostenlos hosten

Wenn's lokal läuft: Projekt auf GitHub pushen, dann bei **Vercel** oder **Netlify** einbinden (beide kostenlos für dieses Projekt). Die `.env`-Werte trägst du dort als "Environment Variables" im Projekt-Dashboard ein (nicht die `.env`-Datei mit hochladen — die steht deshalb schon in keiner `.gitignore`, die musst du noch anlegen, siehe unten).

**Wichtig:** Leg eine `.gitignore`-Datei mit folgendem Inhalt an, bevor du zu GitHub pushst:

```
node_modules
.env
dist
```

## Nächste Schritte

Das ist bewusst nur Schritt 1 aus dem Bauplan (Login + Fächer-Verwaltung). Als Nächstes kommt der Dokumenten-Upload dazu — meld dich, wenn dieser Teil bei dir läuft, dann bauen wir weiter.
