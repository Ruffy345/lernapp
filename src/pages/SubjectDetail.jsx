import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function SubjectDetail({ subject, session, onBack }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

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
          {documents.map((doc) => (
            <li key={doc.id} className="doc-row">
              <span className="doc-name" onClick={() => handleView(doc)}>
                {doc.file_name}
              </span>
              <span className="doc-date">
                {new Date(doc.uploaded_at).toLocaleDateString("de-DE")}
              </span>
              <button className="delete-x" onClick={() => handleDelete(doc)} aria-label="Löschen">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
