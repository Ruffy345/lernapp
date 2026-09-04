import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import SubjectCard from "../components/SubjectCard.jsx";
import AddSubjectModal from "../components/AddSubjectModal.jsx";
import SubjectDetail from "./SubjectDetail.jsx";

export default function Dashboard({ session }) {
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    loadSubjects();
  }, []);

  async function loadSubjects() {
    setLoading(true);
    const { data, error } = await supabase
      .from("subjects")
      .select("*")
      .order("exam_date", { ascending: true, nullsFirst: false });

    if (!error) setSubjects(data);
    setLoading(false);
  }

  async function handleCreate({ name, examDate }) {
    const { data, error } = await supabase
      .from("subjects")
      .insert({ name, exam_date: examDate, user_id: session.user.id })
      .select()
      .single();

    if (!error) {
      setSubjects((prev) => [...prev, data]);
      setShowModal(false);
    }
  }

  async function handleDelete(id) {
    const confirmed = window.confirm("Dieses Fach inklusive aller Inhalte löschen?");
    if (!confirmed) return;

    const { error } = await supabase.from("subjects").delete().eq("id", id);
    if (!error) {
      setSubjects((prev) => prev.filter((s) => s.id !== id));
      if (selectedSubject?.id === id) setSelectedSubject(null);
    }
  }

  // Wenn ein Fach ausgewählt wurde, zeigen wir die Detailseite an:
  if (selectedSubject) {
    return (
      <SubjectDetail
        subject={selectedSubject}
        session={session}
        onBack={() => setSelectedSubject(null)}
      />
    );
  }

  return (
    <div className="folder-screen">
      <div className="folder-topbar">
        <p className="folder-brand">Lernordner</p>
        <button className="signout-btn" onClick={() => supabase.auth.signOut()}>
          Abmelden
        </button>
      </div>

      <div className="folder-body">
        <div className="folder-heading">
          <h1>Deine Fächer</h1>
          <button className="add-subject-btn" onClick={() => setShowModal(true)}>
            + Fach anlegen
          </button>
        </div>

        {loading ? (
          <p style={{ color: "#6b6555" }}>Lädt …</p>
        ) : subjects.length === 0 ? (
          <div className="empty-state">
            <p>Noch keine Fächer angelegt. Leg dein erstes Fach an, um Dokumente hochzuladen.</p>
            <button className="add-subject-btn" onClick={() => setShowModal(true)}>
              + Erstes Fach anlegen
            </button>
          </div>
        ) : (
          <div className="tabs">
            {subjects.map((subject) => (
              <SubjectCard
                key={subject.id}
                subject={subject}
                onOpen={() => setSelectedSubject(subject)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <AddSubjectModal onClose={() => setShowModal(false)} onCreate={handleCreate} />
      )}
    </div>
  );
}