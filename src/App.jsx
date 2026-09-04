import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (loading) return null;

  return session ? <Dashboard session={session} /> : <Login />;
}
