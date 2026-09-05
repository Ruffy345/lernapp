import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { extractText, explainFromText, blobToBase64 } from "../lib/geminiClient";

export default function SubjectDetail({ subject, session, onBack }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const [explainDocId, setExplainDocId] = useState(null);
  const [explainDocName, setExplainDocName] = useState("");
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [explainError, setExplainError] = useState("");

  const [textDocId, setTextDocId] = useState(null);
  const [textDraft, setTextDraft] = useState("");
  const [savingText, setSavingText] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, [subject.id]);

  async function loadDocuments() {
    setLoading(true);
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("subject_id", subject.id)
      .order("uploaded_at", { ascending: false });

    if (!error) setDocuments(data);
    setLoading(false);
  }

  async function runExtraction(doc, filePath, mimeType) {
    try {
      const { data: blob, error: downloadError } = await supabase.storage
        .from("documents")
        .download(filePath);
      if (downloadError) throw downloadError;

      const base64 = await blobToBase64(blob);
      const text = await extractText(base64, mimeType || blob.type || "application/pdf");

      const { data: updated, error: updateError } = await supabase
        .from("documents")
        .update({ extracted_text: text, extraction_error: null })
        .eq("id", doc.id)
        .select()
        .single();

      if (!updateError) {
        setDocuments((prev) => prev.map((d) => (d.id === doc.id ? updated : d)));
      }
    } catch (err) {
      const message = err.message || "Texterkennung fehlgeschlagen.";
      await supabase.from("documents").update({ extraction_error: message }).eq("id", doc.id);
      setDocuments((prev) =>
        prev.map((d) => (d.id === doc.id ? { ...d, extraction_error: message } : d))
      );
    }
  }

  async function handleFileSelect(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setError("");
    setUploading(true);

    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${session.user.id}/${subject.id}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, file);

      if (uploadError) {
        setError(`Fehler bei "${file.name}": ${uploadError.message}`);
        continue;
      }

      const { data: inserted, error: insertError } = await supabase
        .from("documents")
        .insert({
          subject_id: subject.id,
          user_id: session.user.id,
          file_path: filePath,
          file_name: file.name,
        })
        .select()
        .single();

      if (!insertError) {
        setDocuments((prev) => [inserted, ...prev]);
        // Text-Erkennung läuft im Hintergrund, blockiert den Upload nicht.
        runExtraction(inserted, filePath, file.type);
      }
    }

    setUploading(false);
    e.target.value = "";
  }

  async function handleView(doc) {
    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.file_path, 60 * 5);

    if (!error) window.open(data.signedUrl, "_blank");
  }

  async function handleDelete(doc) {
    const confirmed = window.confirm(`"${doc.file_name}" wirklich löschen?`);
    if (!confirmed) return;

    await supabase.storage.from("documents").remove([doc.file_path]);
    const { error } = await supabase.from("documents").delete().eq("id", doc.id);
    if (!error) setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
  }

  async function handleExplain(doc) {
    setExplainDocId(doc.id);
    setExplainDocName(doc.file_name);
    setExplanation("");
    setExplainError("");

    if (!doc.extracted_text) {
      setExplainError(
        "Für dieses Dokument ist noch kein erkannter Text vorhanden (Erkennung läuft noch oder ist fehlgeschlagen — siehe unten)."
      );
      return;
    }

    setExplaining(true);
    try {
      const text = await explainFromText(doc.extracted_text, subject.name);
      setExplanation(text);
    } catch (err) {
      setExplainError(err.message || "Etwas ist schiefgelaufen.");
    } finally {
      setExplaining(false);
    }
  }

  function openTextEditor(doc) {
    setTextDocId(doc.id);
    setTextDraft(doc.extracted_text || "");
  }

  async function saveTextEdit(doc) {
    setSavingText(true);
    const { data: updated, error } = await supabase
      .from("documents")
      .update({ extracted_text: textDraft })
      .eq("id", doc.id)
      .select()
      .single();

    if (!error) {
      setDocuments((prev) => prev.map((d) => (d.id === doc.id ? updated : d)));
      setTextDocId(null);
    }
    setSavingText(false);
  }

  return (
    <div className="folder-body">
      <button className="back-link" onClick={onBack}>
        ← Zurück zu den Fächern
      </button>

      <div className="folder-heading">
        <h1>{subject.name}</h1>
        <label className="add-subject-btn upload-btn">
          {uploading ? "Lädt hoch …" : "+ Dokument hochladen"}
          <input
            type="file"
            accept=".pdf,image/*"
            multiple
            onChange={handleFileSelect}
            disabled={uploading}
            hidden
          />
        </label>
      </div>

      {error && <div className="auth-error">{error}</div>}

      {loading ? (
        <p style={{ color: "#6b6555" }}>Lädt …</p>
      ) : documents.length === 0 ? (
        <div className="empty-state">
          <p>Noch keine Dokumente hochgeladen. Lade dein erstes Skript, Foto oder GoodNotes-PDF hoch.</p>
        </div>
      ) : (
        <ul className="doc-list">
          {documents.map((doc) => {
            const status = doc.extraction_error
              ? "error"
              : doc.extracted_text
              ? "done"
              : "pending";

            return (
              <li key={doc.id} className="doc-row">
                <span className="doc-name" onClick={() => handleView(doc)}>
                  {doc.file_name}
                </span>
                <span className={`doc-status doc-status-${status}`}>
                  {status === "pending" && "Text wird erkannt …"}
                  {status === "done" && "Text erkannt"}
                  {status === "error" && "Erkennung fehlgeschlagen"}
                </span>
                <button className="text-btn" onClick={() => openTextEditor(doc)}>
                  Text ansehen
                </button>
                <button
                  className="explain-btn"
                  onClick={() => handleExplain(doc)}
                  disabled={explaining && explainDocId === doc.id}
                >
                  {explaining && explainDocId === doc.id ? "Denkt nach …" : "Erklären"}
                </button>
                <button className="delete-x" onClick={() => handleDelete(doc)} aria-label="Löschen">
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {textDocId && (
        <div className="explain-panel">
          <div className="explain-panel-header">
            <h3>Erkannter Text</h3>
            <button className="back-link" onClick={() => setTextDocId(null)}>
              Schließen
            </button>
          </div>
          <p style={{ fontSize: 13, color: "#6b6555", marginTop: 0 }}>
            Falls Gemini sich verlesen hat (z. B. bei Handschrift), kannst du das hier direkt korrigieren.
          </p>
          <textarea
            className="text-editor"
            value={textDraft}
            onChange={(e) => setTextDraft(e.target.value)}
            rows={12}
          />
          <button
            className="btn-primary"
            style={{ marginTop: 10 }}
            onClick={() => saveTextEdit(documents.find((d) => d.id === textDocId))}
            disabled={savingText}
          >
            {savingText ? "Speichert …" : "Korrektur speichern"}
          </button>
        </div>
      )}

      {explainDocId && (
        <div className="explain-panel">
          <div className="explain-panel-header">
            <h3>Erklärung: {explainDocName}</h3>
            <button
              className="back-link"
              onClick={() => {
                setExplainDocId(null);
                setExplanation("");
                setExplainError("");
              }}
            >
              Schließen
            </button>
          </div>
          {explaining && <p style={{ color: "#6b6555" }}>Gemini denkt nach …</p>}
          {explainError && <div className="auth-error">{explainError}</div>}
          {explanation && <div className="explain-text">{explanation}</div>}
        </div>
      )}
    </div>
  );
}
