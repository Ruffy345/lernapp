const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
// "gemini-flash-latest" ist ein Alias, der automatisch auf das aktuell
// empfohlene schnelle Gemini-Modell zeigt, statt eine feste Version fix zu
// verdrahten, die irgendwann abgeschaltet wird.
const MODEL = "gemini-flash-latest";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

function checkKey() {
  if (!API_KEY) {
    throw new Error("Kein Gemini-API-Key gefunden. Prüfe VITE_GEMINI_API_KEY in deiner .env-Datei.");
  }
}

async function callGemini(parts) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }] }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini-Anfrage fehlgeschlagen (${response.status}): ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n").trim();

  if (!text) {
    throw new Error("Gemini hat keine verwertbare Antwort geschickt. Evtl. Sicherheitsfilter oder leeres Dokument.");
  }

  return text;
}

// Wird EINMAL beim Hochladen aufgerufen: liest die Datei (inkl. Handschrift)
// und gibt den reinen, transkribierten Text zurück. Danach wird nur noch
// dieser gespeicherte Text verwendet, nicht mehr die Originaldatei.
export async function extractText(base64Data, mimeType) {
  checkKey();

  const prompt = `Transkribiere den vollständigen Inhalt dieses Dokuments wortgetreu als reinen Text. Falls es Handschrift enthält, lies sie so genau wie möglich. Gib NUR den transkribierten Text zurück — keine Zusammenfassung, keine Kommentare, keine Einleitung. Behalte Struktur (Überschriften, Absätze, Aufzählungen) so gut wie möglich bei.`;

  return callGemini([{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } }]);
}

// Wird bei JEDER Frage zu einem Dokument aufgerufen — bekommt nur noch den
// gespeicherten Text, nie wieder die Originaldatei.
export async function explainFromText(extractedText, subjectName) {
  checkKey();

  const prompt = `Du bist ein geduldiger Lern-Tutor. Hier ist der Inhalt eines Dokuments aus dem Fach "${subjectName}":

---
${extractedText}
---

Erkläre den Inhalt verständlich, in eigenen Worten, so als würdest du einem Schüler/einer Schülerin das Thema zum ersten Mal beibringen. Struktur:
1. Kurzer Überblick, worum es geht (1-2 Sätze)
2. Die wichtigsten Punkte, verständlich erklärt
3. Falls sinnvoll: ein einfaches Beispiel

Antworte auf Deutsch.`;

  return callGemini([{ text: prompt }]);
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
