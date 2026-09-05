import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string; reset?: string } => ({
    ...(typeof search['redirect'] === "string" ? { redirect: search['redirect'] as string } : {}),
    ...(typeof search['reset'] === "string" ? { reset: search['reset'] as string } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Log in | Fitly Business Platform" },
      { name: "description", content: "Log in to manage your gym, studio, or coaching business." },
      { property: "og:title", content: "Log in | Fitly Business Platform" },
      {
        property: "og:description",
        content: "Log in to manage your gym, studio, or coaching business.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { redirect, reset } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);



  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      setLoading(false);
      setError(signInError.message);
      return;
    }
    if (redirect && redirect.startsWith("/")) {
      setLoading(false);
      window.location.assign(redirect);
      return;
    }
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();
    setLoading(false);
    navigate({ to: (profile?.role ?? "business_owner") === "client" ? "/" : "/dashboard" });
  }


  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-foreground">Log in</h1>
        {reset && (
          <p className="mt-3 text-sm text-success">
            Your password has been updated. Log in with your new password.
          </p>
        )}
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="ui-input"
          />
          <input
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="ui-input"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="ui-btn w-full"
          >
            {loading ? "Logging in..." : "Log in"}
          </button>
        </form>
        <p className="mt-3 text-sm">
          <Link to="/forgot-password" className="text-muted-foreground underline">
            Forgot password?
          </Link>
        </p>

        <p className="mt-4 text-sm text-muted-foreground">
          No account?{" "}
          <Link to="/signup" search={redirect ? { redirect } : {}} className="text-foreground underline">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
