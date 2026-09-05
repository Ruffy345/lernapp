import { useEffect, useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "../lib/supabaseClient";
import { extractText, explainFromText, generateSummary, classifyTopic, blobToBase64 } from "../lib/geminiClient";
import FlashcardStudy from "../components/FlashcardStudy.jsx";

export default function SubjectDetail({ subject, session, onBack }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null); // { current, total }
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const extractionStartRef = useRef({});

  const [explainDocId, setExplainDocId] = useState(null);
  const [explainDocName, setExplainDocName] = useState("");
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [explainError, setExplainError] = useState("");

  const [textDocId, setTextDocId] = useState(null);
  const [textDraft, setTextDraft] = useState("");
  const [savingText, setSavingText] = useState(false);
  const [textEditMode, setTextEditMode] = useState(false);

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [showSummary, setShowSummary] = useState(false);

  const [showFlashcards, setShowFlashcards] = useState(false);

  const [topics, setTopics] = useState([]);

  useEffect(() => {
    loadDocuments();
    loadSummary();
    loadTopics();
  }, [subject.id]);

  useEffect(() => {
    const hasPending = documents.some((d) => !d.extracted_text && !d.extraction_error);
    if (!hasPending) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [documents]);

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

  async function loadSummary() {
    const { data, error } = await supabase
      .from("summaries")
      .select("*")
      .eq("subject_id", subject.id)
      .maybeSingle();

    if (!error) setSummary(data);
  }

  async function loadTopics() {
    const { data, error } = await supabase
      .from("topics")
      .select("*")
      .eq("subject_id", subject.id)
      .order("created_at", { ascending: true });

    if (!error) setTopics(data);
  }

  async function assignTopic(extractedTextValue) {
    // Frisch aus der DB laden statt auf React-State zu vertrauen — vermeidet
    // veraltete Themenlisten, wenn mehrere Uploads gleichzeitig laufen.
    const { data: existingTopics } = await supabase
      .from("topics")
      .select("*")
      .eq("subject_id", subject.id);

    const names = (existingTopics || []).map((t) => t.name);
    const suggestedName = await classifyTopic(names, extractedTextValue, subject.name);

    let topic = (existingTopics || []).find(
      (t) => t.name.toLowerCase() === suggestedName.toLowerCase()
    );

    if (!topic) {
      const { data: newTopic, error } = await supabase
        .from("topics")
        .insert({ subject_id: subject.id, user_id: session.user.id, name: suggestedName })
        .select()
        .single();
      if (error) throw error;
      topic = newTopic;
    }

    setTopics((prev) => (prev.some((t) => t.id === topic.id) ? prev : [...prev, topic]));
    return topic.id;
  }

  async function generateSummaryHandler() {
    setSummaryError("");
    setShowSummary(true);

    const readyDocs = documents.filter((d) => d.extracted_text);
    if (readyDocs.length === 0) {
      setSummaryError(
        "Noch keine Dokumente mit erkanntem Text vorhanden. Warte, bis mindestens ein Dokument fertig erkannt ist."
      );
      return;
    }

    setSummaryLoading(true);
    try {
      const content = await generateSummary(readyDocs, subject.name);
      const { data: upserted, error } = await supabase
        .from("summaries")
        .upsert(
          {
            subject_id: subject.id,
            user_id: session.user.id,
            content,
            generated_at: new Date().toISOString(),
          },
          { onConflict: "subject_id" }
        )
        .select()
        .single();

      if (error) throw error;
      setSummary(upserted);
    } catch (err) {
      setSummaryError(err.message || "Etwas ist schiefgelaufen.");
    } finally {
      setSummaryLoading(false);
    }
  }

  async function openDocAtPage(fileName, page) {
    const doc = documents.find((d) => d.file_name === fileName);
    if (!doc) return;

    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.file_path, 60 * 5);
    if (error) return;

    const isPdf = doc.file_name.toLowerCase().endsWith(".pdf");
    window.open(isPdf ? `${data.signedUrl}#page=${page}` : data.signedUrl, "_blank");
  }

  async function runExtraction(doc, filePath, mimeType) {
    try {
      const { data: blob, error: downloadError } = await supabase.storage
        .from("documents")
        .download(filePath);
      if (downloadError) throw downloadError;

      const base64 = await blobToBase64(blob);
      const text = await extractText(base64, mimeType || blob.type || "application/pdf");

      let topicId = null;
      try {
        topicId = await assignTopic(text);
      } catch (topicErr) {
        // Themen-Zuordnung ist ein Zusatz — schlägt sie fehl, speichern wir
        // den erkannten Text trotzdem, nur ohne Themen-Zuordnung.
        console.error("Themen-Zuordnung fehlgeschlagen:", topicErr);
      }

      const { data: updated, error: updateError } = await supabase
        .from("documents")
        .update({ extracted_text: text, extraction_error: null, topic_id: topicId })
        .eq("id", doc.id)
        .select()
        .maybeSingle();

      if (updateError) throw updateError;
      if (!updated) {
        throw new Error(
          "Erkennung war erfolgreich, aber das Speichern schlug fehl: Dokument wurde in der Datenbank nicht gefunden (evtl. zwischenzeitlich gelöscht)."
        );
      }

      setDocuments((prev) => prev.map((d) => (d.id === doc.id ? updated : d)));
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
    setUploadProgress({ current: 0, total: files.length });

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress({ current: i + 1, total: files.length });
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
        extractionStartRef.current[inserted.id] = Date.now();
        setNow(Date.now());
        // Text-Erkennung läuft im Hintergrund, blockiert den Upload nicht.
        runExtraction(inserted, filePath, file.type);
      }
    }

    setUploading(false);
    setUploadProgress(null);
    e.target.value = "";
  }

  async function handleView(doc) {
    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.file_path, 60 * 5);

    if (!error) window.open(data.signedUrl, "_blank");
  }

  async function retryExtraction(doc) {
    setDocuments((prev) =>
      prev.map((d) => (d.id === doc.id ? { ...d, extraction_error: null } : d))
    );
    extractionStartRef.current[doc.id] = Date.now();
    setNow(Date.now());
    await runExtraction(doc, doc.file_path, null);
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
    setTextEditMode(false);
  }

  async function saveTextEdit(doc) {
    setSavingText(true);
    const { data: updated, error } = await supabase
      .from("documents")
      .update({ extracted_text: textDraft })
      .eq("id", doc.id)
      .select()
      .maybeSingle();

    if (!error && updated) {
      setDocuments((prev) => prev.map((d) => (d.id === doc.id ? updated : d)));
      setTextDocId(null);
    } else if (!error && !updated) {
      alert("Speichern fehlgeschlagen: Dokument wurde nicht gefunden (evtl. zwischenzeitlich gelöscht).");
    }
    setSavingText(false);
  }

  function renderDocRow(doc) {
    const status = doc.extraction_error ? "error" : doc.extracted_text ? "done" : "pending";

    return (
      <li key={doc.id} className="doc-row">
        <span className="doc-name" onClick={() => handleView(doc)}>
          {doc.file_name}
        </span>
        <span className={`doc-status doc-status-${status}`}>
          {status === "pending" &&
            `Text wird erkannt … (${Math.max(
              0,
              Math.round((now - (extractionStartRef.current[doc.id] || now)) / 1000)
            )}s)`}
          {status === "done" && "Text erkannt"}
          {status === "error" && "Erkennung fehlgeschlagen"}
        </span>
        {status === "error" && (
          <>
            <button className="text-btn" onClick={() => alert(doc.extraction_error || "Unbekannter Fehler")}>
              Fehler ansehen
            </button>
            <button className="explain-btn" onClick={() => retryExtraction(doc)}>
              Erneut versuchen
            </button>
          </>
        )}
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
  }

  return showFlashcards ? (
    <FlashcardStudy
      subject={subject}
      session={session}
      documents={documents}
      onClose={() => setShowFlashcards(false)}
    />
  ) : (
    <div className="folder-body">
      <button className="back-link" onClick={onBack}>
        ← Zurück zu den Fächern
      </button>

      <div className="folder-heading">
        <h1>{subject.name}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="text-btn" onClick={() => setShowFlashcards(true)}>
            Karteikarten
          </button>
          <button className="text-btn" onClick={() => (summary ? setShowSummary(true) : generateSummaryHandler())}>
            {summary ? "Zusammenfassung" : "Zusammenfassung erstellen"}
          </button>
          <label className="add-subject-btn upload-btn">
            {uploading
              ? `Lädt hoch … (${uploadProgress.current}/${uploadProgress.total})`
              : "+ Dokument hochladen"}
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
      </div>

      {error && <div className="auth-error">{error}</div>}

      {loading ? (
        <p style={{ color: "#6b6555" }}>Lädt …</p>
      ) : documents.length === 0 ? (
        <div className="empty-state">
          <p>Noch keine Dokumente hochgeladen. Lade dein erstes Skript, Foto oder GoodNotes-PDF hoch.</p>
        </div>
      ) : (
        <>
          {topics.map((topic) => {
            const docsForTopic = documents.filter((d) => d.topic_id === topic.id);
            if (docsForTopic.length === 0) return null;
            return (
              <div key={topic.id} className="topic-group">
                <h3 className="topic-heading">{topic.name}</h3>
                <ul className="doc-list">{docsForTopic.map(renderDocRow)}</ul>
              </div>
            );
          })}

          {(() => {
            const unassigned = documents.filter((d) => !d.topic_id);
            if (unassigned.length === 0) return null;
            const stillProcessing = unassigned.some((d) => !d.extraction_error && !d.extracted_text);
            return (
              <div className="topic-group">
                <h3 className="topic-heading topic-heading-muted">
                  {stillProcessing ? "Wird noch zugeordnet …" : "Nicht zugeordnet"}
                </h3>
                <ul className="doc-list">{unassigned.map(renderDocRow)}</ul>
              </div>
            );
          })()}
        </>
      )}

      {textDocId && (
        <div className="explain-panel">
          <div className="explain-panel-header">
            <h3>Erkannter Text</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="text-btn" onClick={() => setTextEditMode((v) => !v)}>
                {textEditMode ? "Ansicht" : "Bearbeiten"}
              </button>
              <button className="back-link" onClick={() => setTextDocId(null)}>
                Schließen
              </button>
            </div>
          </div>

          {textEditMode ? (
            <>
              <p style={{ fontSize: 13, color: "#6b6555", marginTop: 0 }}>
                Falls Gemini sich verlesen hat (z. B. bei Handschrift), korrigier es hier als Markdown.
              </p>
              <textarea
                className="text-editor"
                value={textDraft}
                onChange={(e) => setTextDraft(e.target.value)}
                rows={14}
              />
              <button
                className="btn-primary"
                style={{ marginTop: 10 }}
                onClick={() => saveTextEdit(documents.find((d) => d.id === textDocId))}
                disabled={savingText}
              >
                {savingText ? "Speichert …" : "Korrektur speichern"}
              </button>
            </>
          ) : (
            <div className="markdown-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{textDraft || "_Kein Text vorhanden._"}</ReactMarkdown>
            </div>
          )}
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
          {explanation && (
            <div className="explain-text markdown-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{explanation}</ReactMarkdown>
            </div>
          )}
        </div>
      )}
      {showSummary && (
        <div className="explain-panel">
          <div className="explain-panel-header">
            <h3>Zusammenfassung</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="text-btn" onClick={generateSummaryHandler} disabled={summaryLoading}>
                {summary ? "Neu generieren" : "Erstellen"}
              </button>
              <button className="back-link" onClick={() => setShowSummary(false)}>
                Schließen
              </button>
            </div>
          </div>

          {summaryLoading && <p style={{ color: "#6b6555" }}>Gemini fasst zusammen …</p>}
          {summaryError && <div className="auth-error">{summaryError}</div>}

          {summary?.content && !summaryLoading && (
            <>
              <p style={{ fontSize: 12, color: "#9a927a", marginTop: 0 }}>
                Erstellt am {new Date(summary.generated_at).toLocaleString("de-DE")} · Klick auf eine
                Quellenangabe öffnet das Original an der richtigen Stelle.
              </p>
              <div className="markdown-content">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ href, children }) => {
                      if (href?.startsWith("doc://")) {
                        const rest = href.slice(6);
                        const lastSlash = rest.lastIndexOf("/");
                        const fileName = decodeURIComponent(rest.slice(0, lastSlash));
                        const page = rest.slice(lastSlash + 1);
                        return (
                          <button
                            type="button"
                            className="cite-link"
                            onClick={() => openDocAtPage(fileName, page)}
                          >
                            {children}
                          </button>
                        );
                      }
                      return (
                        <a href={href} target="_blank" rel="noreferrer">
                          {children}
                        </a>
                      );
                    },
                  }}
                >
                  {summary.content}
                </ReactMarkdown>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
