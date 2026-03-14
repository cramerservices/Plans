import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function getSessionIdFromHash() {
  const hash = window.location.hash || "";
  const queryString = hash.includes("?") ? hash.split("?")[1] : "";
  return new URLSearchParams(queryString).get("session_id");
}

export default function SuccessPage() {
  const navigate = useNavigate();
  const [msg, setMsg] = useState("Payment received. Redirecting to your dashboard...");

  useEffect(() => {
    const sessionId = getSessionIdFromHash();

    if (!sessionId) {
      setMsg("Missing session confirmation. Redirecting to your dashboard...");
    }

    const timer = setTimeout(() => navigate("/dashboard"), 1200);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div style={{ padding: 24 }}>
      <h2>Success</h2>
      <p>{msg}</p>
    </div>
  );
}
