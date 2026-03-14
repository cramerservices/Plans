import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

export default function SuccessPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [msg, setMsg] = useState("Payment received. Redirecting to your dashboard...");

  useEffect(() => {
    const sessionId = params.get("session_id");

    if (!sessionId) {
      setMsg("Missing session confirmation. Redirecting to your dashboard...");
    }

    const timer = setTimeout(() => navigate("/dashboard"), 1200);
    return () => clearTimeout(timer);
  }, [params, navigate]);

  return (
    <div style={{ padding: 24 }}>
      <h2>Success</h2>
      <p>{msg}</p>
    </div>
  );
}
