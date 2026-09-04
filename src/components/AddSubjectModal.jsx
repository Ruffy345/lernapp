import { useState } from "react";

export default function AddSubjectModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    await onCreate({ name: name.trim(), examDate: examDate || null });
    setBusy(false);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>Neues Fach anlegen</h2>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="subject-name">Fachname</label>
            <input
              id="subject-name"
              type="text"
              placeholder="z. B. Geschichte"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="field">
            <label htmlFor="exam-date">Prüfungsdatum (optional, kann später ergänzt werden)</label>
            <input
              id="exam-date"
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Abbrechen
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              Anlegen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
