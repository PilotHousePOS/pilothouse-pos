import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [status, setStatus] = useState<"loading" | "success" | "error" | "expired">("loading");
  const [message, setMessage] = useState("");
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setStatus("error");
      setMessage("No verification token found in this link.");
      return;
    }

    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.expired) {
          setStatus("expired");
          setMessage(data.message);
        } else if (data.token || data.message?.includes("successfully")) {
          setStatus("success");
          setMessage(data.message || "Email verified successfully!");
          // If we got a token back, store it and redirect
          if (data.token) {
            localStorage.setItem("auth_token", data.token);
            setTimeout(() => setLocation("/"), 2000);
          }
        } else {
          setStatus("error");
          setMessage(data.message || "Verification failed.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Something went wrong. Please try again.");
      });
  }, []);

  const handleResend = async () => {
    if (!resendEmail) {
      toast({ title: "Please enter your email address", variant: "destructive" });
      return;
    }
    setResending(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail }),
      });
      const data = await res.json();
      setResendSent(true);
      toast({ title: data.message });
    } catch {
      toast({ title: "Failed to resend. Please try again.", variant: "destructive" });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="bg-gray-900 rounded-2xl p-8 max-w-sm w-full text-center shadow-xl border border-gray-800">
        <div className="mb-6">
          <img
            src="/animal-house-logo.png"
            alt="Animal House"
            className="h-14 mx-auto mb-4"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <h1 className="text-2xl font-bold text-white">Email Verification</h1>
        </div>

        {status === "loading" && (
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full" />
            <p className="text-gray-400">Verifying your email...</p>
          </div>
        )}

        {status === "success" && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center text-3xl">✓</div>
            <p className="text-green-400 font-semibold text-lg">{message}</p>
            <p className="text-gray-400 text-sm">Redirecting you to the app...</p>
            <Button className="w-full bg-red-600 hover:bg-red-700 mt-2" onClick={() => setLocation("/")}>
              Go to App
            </Button>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-red-800 rounded-full flex items-center justify-center text-3xl">✗</div>
            <p className="text-red-400 font-semibold">{message}</p>
            <Button className="w-full bg-red-600 hover:bg-red-700 mt-2" onClick={() => setLocation("/auth")}>
              Back to Sign In
            </Button>
          </div>
        )}

        {status === "expired" && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-yellow-700 rounded-full flex items-center justify-center text-3xl">⏱</div>
            <p className="text-yellow-400 font-semibold">{message}</p>
            {!resendSent ? (
              <div className="w-full space-y-3 mt-2">
                <p className="text-gray-400 text-sm">Enter your email to receive a new link:</p>
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white"
                />
                <Button
                  className="w-full bg-red-600 hover:bg-red-700"
                  onClick={handleResend}
                  disabled={resending}
                >
                  {resending ? "Sending..." : "Resend Verification Email"}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-green-400 text-sm">Check your inbox for a new verification link.</p>
                <Button variant="outline" className="w-full border-gray-700 text-gray-300" onClick={() => setLocation("/auth")}>
                  Back to Sign In
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
