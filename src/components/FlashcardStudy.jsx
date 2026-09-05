import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { generateFlashcards } from "../lib/geminiClient";

// Einfaches Stufen-System: je höher die Stufe, desto länger der Abstand bis
// zur nächsten Wiederholung. Bei falscher Antwort geht's zurück auf Stufe 0.
const INTERVALS_DAYS = [1, 3, 7, 14, 30];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function FlashcardStudy({ subject, session, documents, onClose }) {
  const [allCards, setAllCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);

  useEffect(() => {
    loadCards();
  }, [subject.id]);

  async function loadCards() {
    setLoading(true);
    const { data, error } = await supabase
      .from("flashcards")
      .select("*")
      .eq("subject_id", subject.id)
      .order("next_review_date", { ascending: true });

    if (!error) {
      setAllCards(data);
      const today = todayStr();
      const dueIds = data.filter((c) => c.next_review_date <= today).map((c) => c.id);
      setQueue(dueIds);
      setCurrent(dueIds.length ? data.find((c) => c.id === dueIds[0]) : null);
      setRevealed(false);
    }
    setLoading(false);
  }

  async function handleGenerate() {
    setError("");
    const readyDocs = documents.filter((d) => d.extracted_text);
    if (readyDocs.length === 0) {
      setError("Noch keine Dokumente mit erkanntem Text vorhanden.");
      return;
    }

    setGenerating(true);
    try {
      const newCards = await generateFlashcards(readyDocs, subject.name);
      const rows = newCards.map((c) => ({
        subject_id: subject.id,
        user_id: session.user.id,
        question: c.question,
        answer: c.answer,
      }));

      const { error } = await supabase.from("flashcards").insert(rows);
      if (error) throw error;

      await loadCards();
    } catch (err) {
      setError(err.message || "Etwas ist schiefgelaufen.");
    } finally {
      setGenerating(false);
    }
  }

  async function grade(correct) {
    if (!current) return;

    const newStage = correct ? Math.min(current.stage + 1, INTERVALS_DAYS.length - 1) : 0;
    const days = INTERVALS_DAYS[newStage];
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + days);
    const nextDateStr = nextDate.toISOString().slice(0, 10);

    await supabase
      .from("flashcards")
      .update({ stage: newStage, next_review_date: nextDateStr })
      .eq("id", current.id);

    const remainingQueue = queue.filter((id) => id !== current.id);
    setQueue(remainingQueue);
    setReviewedCount((n) => n + 1);
    setRevealed(false);
    setCurrent(remainingQueue.length ? allCards.find((c) => c.id === remainingQueue[0]) : null);
  }

  const nextDueDate = allCards
    .map((c) => c.next_review_date)
    .filter((d) => d > todayStr())
    .sort()[0];

  return (
    <div className="folder-body">
      <button className="back-link" onClick={onClose}>
        ← Zurück zu {subject.name}
      </button>

      <div className="folder-heading">
        <h1>Karteikarten</h1>
        <button className="text-btn" onClick={handleGenerate} disabled={generating}>
          {generating ? "Erstellt Karten …" : allCards.length ? "Mehr Karten erstellen" : "Karten erstellen"}
        </button>
      </div>

      {error && <div className="auth-error">{error}</div>}

      {loading ? (
        <p style={{ color: "#6b6555" }}>Lädt …</p>
      ) : allCards.length === 0 ? (
        <div className="empty-state">
          <p>Noch keine Karteikarten. Erstelle welche aus deinen hochgeladenen Dokumenten.</p>
        </div>
      ) : current ? (
        <div className="flashcard">
          <p className="flashcard-progress">
            Noch {queue.length} von {queue.length + reviewedCount} heute fällig
          </p>
          <div className="flashcard-face">
            <p className="flashcard-label">Frage</p>
            <p className="flashcard-text">{current.question}</p>

            {revealed && (
              <>
                <hr className="flashcard-divider" />
                <p className="flashcard-label">Antwort</p>
                <p className="flashcard-text">{current.answer}</p>
              </>
            )}
          </div>

          {!revealed ? (
            <button className="btn-primary" onClick={() => setRevealed(true)}>
              Antwort zeigen
            </button>
          ) : (
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => grade(false)} style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
                Falsch
              </button>
              <button className="btn-primary" onClick={() => grade(true)}>
                Richtig
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="empty-state">
          <p>
            Für heute nichts fällig — {allCards.length} Karten insgesamt.
            {nextDueDate && ` Nächste Karte fällig am ${new Date(nextDueDate).toLocaleDateString("de-DE")}.`}
          </p>
        </div>
      )}
    </div>
  );
}
