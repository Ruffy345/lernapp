import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Login() {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
      } else {
        setInfo("Konto erstellt. Falls Bestätigung nötig ist, prüfe dein E-Mail-Postfach.");
      }
    }

    setBusy(false);
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <p className="auth-mark">Lernordner</p>
        <p className="auth-sub">
          {mode === "signin"
            ? "Melde dich an, um auf deine Fächer zuzugreifen."
            : "Leg dein Konto an — es ist für dich allein gedacht."}
        </p>

        {error && <div className="auth-error">{error}</div>}
        {info && <div className="auth-error" style={{ background: "#eaf1ec", color: "#395c47", borderColor: "#c7ddce" }}>{info}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">E-Mail</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Passwort</label>
            <input
              id="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? "Einen Moment …" : mode === "signin" ? "Anmelden" : "Konto erstellen"}
          </button>
        </form>

        <div className="auth-toggle">
          {mode === "signin" ? (
            <>
              Noch kein Konto?{" "}
              <button onClick={() => { setMode("signup"); setError(""); setInfo(""); }}>Registrieren</button>
            </>
          ) : (
            <>
              Schon ein Konto?{" "}
              <button onClick={() => { setMode("signin"); setError(""); setInfo(""); }}>Anmelden</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
