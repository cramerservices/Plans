import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function SuccessPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [msg, setMsg] = useState("Finalizing your membership...");

  useEffect(() => {
    const sessionId = params.get("session_id");
    if (!sessionId) {
      setMsg("Missing session_id. Redirecting...");
      setTimeout(() => navigate("/dashboard"), 800);
      return;
    }

    (async () => {
      try {
const { error } = await supabase.functions.invoke("finalize-checkout", {
  body: { sessionId },
});
if (error) throw error;


        setMsg("All set! Redirecting to your dashboard...");
        setTimeout(() => navigate("/dashboard"), 800);
      } catch (e: any) {
        console.error(e);
        setMsg("Payment succeeded, but we couldn't attach the plan to your account yet. Contact support.");
      }
    })();
  }, [params, navigate]);

  return (
    <div style={{ padding: 24 }}>
      <h2>Success</h2>
      <p>{msg}</p>
    </div>
  );
}
