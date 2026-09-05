import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/forgot-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset your password | Fitly" },
      { name: "description", content: "Request a password reset link for your Fitly account." },
      { property: "og:title", content: "Reset your password | Fitly" },
      {
        property: "og:description",
        content: "Request a password reset link for your Fitly account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Enter a valid email address.");
      return;
    }
    setSending(true);
    // Always show the same message so no one can probe which emails exist.
    await supabase.auth
      .resetPasswordForEmail(value, {
        // Same-origin URL: works in the Lovable preview and on the published site.
        redirectTo: `${window.location.origin}/reset-password`,
      })
      .catch(() => undefined);
    setSending(false);
    setNotice("If an account exists with this email, a reset link has been sent.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-foreground">Forgot your password?</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter your email and we'll send you a link to set a new password.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="ui-input"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button type="submit" disabled={sending} className="ui-btn w-full">
            {sending ? "Sending..." : "Send reset link"}
          </button>
        </form>
        {notice && <p className="mt-4 text-sm text-success">{notice}</p>}
        <p className="mt-6 text-sm text-muted-foreground">
          <Link to="/login" className="text-foreground underline">
            Back to log in
          </Link>
        </p>
      </div>
    </main>
  );
}
