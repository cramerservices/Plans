import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

function getSessionIdFromHash() {
  const hash = window.location.hash || "";
  const queryString = hash.includes("?") ? hash.split("?")[1] : "";
  return new URLSearchParams(queryString).get("session_id");
}

export default function SuccessPage() {
  const navigate = useNavigate();
  const [msg, setMsg] = useState("Finalizing your membership...");

  useEffect(() => {
    const sessionId = getSessionIdFromHash();

    console.log("window.location.href:", window.location.href);
    console.log("window.location.hash:", window.location.hash);
    console.log("parsed session_id:", sessionId);

    if (!sessionId) {
      setMsg("Missing session_id. Redirecting...");
      setTimeout(() => navigate("/dashboard"), 1200);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("finalize-checkout", {
          body: { session_id: sessionId },
        });

        console.log("finalize-checkout response data:", data);
        console.log("finalize-checkout response error:", error);

        if (error) throw error;

        if (!cancelled) {
          setMsg("All set! Redirecting to your dashboard...");
          setTimeout(() => navigate("/dashboard"), 1200);
        }
      } catch (e: any) {
        console.error("SuccessPage finalize-checkout failed:", e);

        if (!cancelled) {
          setMsg("Payment succeeded, but we couldn't attach the plan to your account yet. Contact support.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div style={{ padding: 24 }}>
      <h2>Success</h2>
      <p>{msg}</p>
    </div>
  );
}
