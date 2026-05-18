import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

function getParamsFromHash() {
  const hash = window.location.hash || "";
  const queryString = hash.includes("?") ? hash.split("?")[1] : "";
  return new URLSearchParams(queryString);
}

export default function SuccessPage() {
  const navigate = useNavigate();

  const [title, setTitle] = useState("Success");
  const [msg, setMsg] = useState("Finalizing your purchase...");
  const [showDashboardButton, setShowDashboardButton] = useState(false);

  useEffect(() => {
    const params = getParamsFromHash();
    const sessionId = params.get("session_id");
    const checkoutKind = params.get("checkout_kind") || params.get("type");

    console.log("window.location.href:", window.location.href);
    console.log("window.location.hash:", window.location.hash);
    console.log("parsed session_id:", sessionId);
    console.log("checkout_kind:", checkoutKind);

    if (!sessionId) {
      setTitle("Missing Checkout Session");
      setMsg("Missing session_id. Redirecting...");
      setTimeout(() => navigate("/dashboard"), 1200);
      return;
    }

    const isOneTimeTuneUp =
      checkoutKind === "one_time_tune_up" ||
      checkoutKind === "one_time" ||
      checkoutKind === "payment";

    if (isOneTimeTuneUp) {
      setTitle("Thank you!");
      setMsg(
        "Your payment was successful. You will receive a message soon to schedule your tune-up."
      );
      setShowDashboardButton(true);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setTitle("Success");
        setMsg("Finalizing your membership...");

        const { data, error } = await supabase.functions.invoke("finalize-checkout", {
          body: { session_id: sessionId },
        });

        if (error) {
          let errorBody: any = null;

          try {
            errorBody = await error.context?.json();
          } catch {
            try {
              errorBody = await error.context?.text();
            } catch {
              errorBody = null;
            }
          }

          console.error("finalize-checkout response error object:", error);
          console.error("finalize-checkout response error body:", errorBody);

          throw new Error(
            typeof errorBody === "string"
              ? errorBody
              : errorBody?.details ||
                  errorBody?.error ||
                  error.message ||
                  "Finalize checkout failed"
          );
        }

        console.log("finalize-checkout response data:", data);

        if (!cancelled) {
          setTitle("Success");
          setMsg("All set! Redirecting to your dashboard...");
          setTimeout(() => navigate("/dashboard"), 1200);
        }
      } catch (e: any) {
        console.error("SuccessPage finalize-checkout failed:", e);

        if (!cancelled) {
          setTitle("Payment Successful");
          setMsg(
            `Payment succeeded, but we couldn't attach the plan to your account yet. ${
              e?.message ? `Error: ${e.message}` : "Contact support."
            }`
          );
          setShowDashboardButton(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <h2>{title}</h2>
      <p>{msg}</p>

      {showDashboardButton && (
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          style={{
            marginTop: 16,
            padding: "10px 16px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Go to Dashboard
        </button>
      )}
    </div>
  );
}
