function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

export default function SubjectCard({ subject, onDelete }) {
  const days = daysUntil(subject.exam_date);
  let urgency = "";
  if (days !== null) {
    if (days <= 3) urgency = "urgent";
    else if (days <= 10) urgency = "soon";
  }

  let countdownText = "Kein Prüfungstermin gesetzt";
  if (days !== null) {
    if (days < 0) countdownText = "Termin vorbei";
    else if (days === 0) countdownText = "Heute!";
    else if (days === 1) countdownText = "Noch 1 Tag";
    else countdownText = `Noch ${days} Tage`;
  }

  return (
    <div className={`tab-card ${urgency}`}>
      <button
        className="delete-x"
        aria-label={`${subject.name} löschen`}
        onClick={() => onDelete(subject.id)}
      >
        ×
      </button>
      <h3>{subject.name}</h3>
      <p className="exam-date">
        {subject.exam_date
          ? new Date(subject.exam_date).toLocaleDateString("de-DE", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })
          : "Noch kein Termin"}
      </p>
      <p className="countdown">{countdownText}</p>
    </div>
  );
}
