const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
// Feste, stabile Modelle statt einem "-latest"-Alias, der aktuell auf ein
// Preview-Modell zeigen kann (weniger Serverkapazität, häufiger überlastet).
// gemini-3.5-flash-lite ist laut Google extra für Dokumenten-Verarbeitung
// empfohlen — genau unser Anwendungsfall. gemini-2.5-flash ganz am Ende als
// Notreserve (wird laut Google am 16.10.2026 abgeschaltet, danach entfernen).
const MODELS = ["gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-2.5-flash"];

function endpointFor(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
}

function checkKey() {
  if (!API_KEY) {
    throw new Error("Kein Gemini-API-Key gefunden. Prüfe VITE_GEMINI_API_KEY in deiner .env-Datei.");
  }
}

async function callGemini(parts, retriesPerModel = 2) {
  let lastError;

  for (const model of MODELS) {
    for (let attempt = 1; attempt <= retriesPerModel; attempt++) {
      const response = await fetch(endpointFor(model), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts }] }),
      });

      if (response.ok) {
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n").trim();

        if (!text) {
          throw new Error("Gemini hat keine verwertbare Antwort geschickt. Evtl. Sicherheitsfilter oder leeres Dokument.");
        }
        return text;
      }

      const isOverloaded = response.status === 503 || response.status === 429;
      const errText = await response.text();
      lastError = new Error(`Gemini-Anfrage fehlgeschlagen (${response.status}, Modell ${model}): ${errText.slice(0, 300)}`);

      if (!isOverloaded) {
        // Anderer Fehlertyp (z.B. ungültiger Key) — Modellwechsel würde nichts bringen.
        throw lastError;
      }

      if (attempt < retriesPerModel) {
        // Kurz warten und beim selben Modell nochmal versuchen.
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }
      // Nach den Versuchen bei diesem Modell: weiter zum nächsten Modell in MODELS.
    }
  }

  throw lastError;
}

// Wird EINMAL beim Hochladen aufgerufen: liest die Datei (inkl. Handschrift)
// und gibt den reinen, transkribierten Text zurück. Danach wird nur noch
// dieser gespeicherte Text verwendet, nicht mehr die Originaldatei.
export async function extractText(base64Data, mimeType) {
  checkKey();

  const isPdf = mimeType === "application/pdf";
  const pageInstruction = isPdf
    ? "\n- WICHTIG: Setze vor dem Inhalt jeder Seite eine eigene Zeile exakt in diesem Format: \"### Seite N\" (N = Seitenzahl, bei 1 beginnend). So bleibt nachvollziehbar, von welcher Seite welcher Inhalt stammt."
    : "";

  const prompt = `Transkribiere den vollständigen Inhalt dieses Dokuments wortgetreu, formatiert als Markdown. Falls es Handschrift enthält, lies sie so genau wie möglich.

Regeln:
- Überschriften mit #, ##, ###
- Tabellen als Markdown-Tabellen (mit | und -), auch wenn sie im Original als Formular/Raster mit handschriftlichen Antworten vorliegen — trage die Antworten in die passende Zelle ein
- Diagramme/Baumstrukturen als eingerückte Liste beschreiben, die die Struktur nachbildet
- Aufzählungen mit -, nummerierte Listen mit 1. 2. 3.
- Gedichte/Zitate: Zeilenumbrüche exakt beibehalten${pageInstruction}
- Gib NUR das Markdown zurück — keine Einleitung, keine Kommentare, keine Zusammenfassung`;

  return callGemini([{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } }]);
}

// Wird bei JEDER Frage zu einem Dokument aufgerufen — bekommt nur noch den
// gespeicherten Text, nie wieder die Originaldatei.
export async function explainFromText(extractedText, subjectName) {
  checkKey();

  const prompt = `Du bist ein geduldiger Lern-Tutor. Hier ist der Inhalt eines Dokuments aus dem Fach "${subjectName}" (als Markdown):

---
${extractedText}
---

Erkläre den Inhalt verständlich, in eigenen Worten, so als würdest du einem Schüler/einer Schülerin das Thema zum ersten Mal beibringen. Antworte als Markdown mit dieser Struktur:
## Überblick
Kurzer Überblick, worum es geht (1-2 Sätze)

## Die wichtigsten Punkte
Verständlich erklärt, ggf. mit Unterpunkten

## Beispiel
Falls sinnvoll, ein einfaches Beispiel

Antworte auf Deutsch.`;

  return callGemini([{ text: prompt }]);
}

export async function generateSummary(documents, subjectName) {
  checkKey();

  const combined = documents
    .map((doc) => `# Dokument: ${doc.file_name}\n\n${doc.extracted_text}`)
    .join("\n\n---\n\n");

  const prompt = `Du bist ein Lern-Tutor. Hier sind alle bisherigen Dokumente aus dem Fach "${subjectName}":

---
${combined}
---

Erstelle eine übersichtliche, nach Themen gegliederte Zusammenfassung als Markdown (## für Themen, - für Stichpunkte). Fasse zusammen, was inhaltlich wichtig ist — dopple keine Inhalte, die in mehreren Dokumenten vorkommen.

WICHTIG — Quellenverweise: Am Ende JEDES Stichpunkts fügst du einen Verweis auf die Quelle als Markdown-Link in genau diesem Format ein: [Quelle: Dateiname, Seite N](doc://Dateiname/N)
- Dateiname = exakt der Name aus "# Dokument: ..."
- N = die Seitenzahl aus der nächstgelegenen "### Seite N"-Markierung im jeweiligen Dokument (falls keine Seitenmarkierung vorhanden ist, nutze N=1)
- Beispiel: - Sprache ist doppelt strukturiert (Laute + Syntax). [Quelle: Deutsch.pdf, Seite 3](doc://Deutsch.pdf/3)

Antworte auf Deutsch, nur das Markdown, keine Einleitung.`;

  return callGemini([{ text: prompt }]);
}

export async function generateFlashcards(documents, subjectName) {
  checkKey();

  const combined = documents
    .map((doc) => `# Dokument: ${doc.file_name}\n\n${doc.extracted_text}`)
    .join("\n\n---\n\n");

  const prompt = `Du bist ein Lern-Tutor. Hier ist der Stoff aus dem Fach "${subjectName}":

---
${combined}
---

Erstelle 8 bis 15 Karteikarten (Frage/Antwort-Paare) zu den wichtigsten Fakten und Konzepten. Fragen kurz und präzise, Antworten kurz und auf den Punkt.

Antworte AUSSCHLIESSLICH mit einem gültigen JSON-Array in genau diesem Format, ohne Markdown-Codeblock (keine \`\`\`), ohne Einleitung, ohne Kommentare:
[{"question": "...", "answer": "..."}]

Auf Deutsch.`;

  const raw = await callGemini([{ text: prompt }]);
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error("Gemini hat kein gültiges Karten-Format geliefert. Versuch's nochmal.");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Keine Karteikarten erhalten.");
  }

  return parsed.filter((c) => c.question && c.answer);
}

export async function classifyTopic(existingTopicNames, extractedText, subjectName) {
  checkKey();

  const topicList = existingTopicNames.length ? existingTopicNames.join(", ") : "(noch keine)";
  const excerpt = extractedText.slice(0, 4000);

  const prompt = `Du ordnest ein neues Dokument einem Thema/Kapitel innerhalb des Fachs "${subjectName}" zu.

Bestehende Themen in diesem Fach: ${topicList}

Inhalt des neuen Dokuments (Ausschnitt):
---
${excerpt}
---

Passt der Inhalt zu einem der bestehenden Themen? Falls ja, antworte NUR mit dem exakten, bestehenden Themennamen (genau gleich geschrieben). Falls nicht, schlage einen neuen, kurzen, treffenden Themennamen vor (2-4 Wörter, auf Deutsch).

Antworte NUR mit dem Themennamen selbst — keine Anführungszeichen, keine Erklärung, kein zusätzlicher Satz.`;

  const result = await callGemini([{ text: prompt }]);
  return result.trim().replace(/^["']|["']$/g, "");
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
