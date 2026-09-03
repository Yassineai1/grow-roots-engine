import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search['redirect'] === "string" ? { redirect: search['redirect'] as string } : {},
  head: () => ({
    meta: [
      { title: "Sign up | Fitly Business Platform" },
      {
        name: "description",
        content: "Create an account to run your gym, studio, or coaching business.",
      },
      { property: "og:title", content: "Sign up | Fitly Business Platform" },
      {
        property: "og:description",
        content: "Create an account to run your gym, studio, or coaching business.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const [role, setRole] = useState<"client" | "business_owner">("client");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName, role },
      },
    });

    if (signUpError) {
      setLoading(false);
      setError(signUpError.message);
      return;
    }

    if (!data.session) {
      setLoading(false);
      setInfo("Check your email to confirm your account, then log in.");
      return;
    }

    const { error: profileError } = await supabase.from("users").upsert({
      id: data.session.user.id,
      email,
      full_name: fullName,
      role,
    });

    setLoading(false);
    if (profileError) {
      setError(profileError.message);
      return;
    }
    if (redirect && redirect.startsWith("/")) {
      window.location.assign(redirect);
      return;
    }
    navigate({ to: role === "client" ? "/" : "/onboarding" });
  }

  const roleOption = (value: "client" | "business_owner", label: string, hint: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setRole(value)}
      className={`w-full rounded-md border p-3 text-left text-sm ${
        role === value ? "border-primary" : "border-input"
      }`}
      aria-pressed={role === value}
    >
      <span className="font-medium text-foreground">{label}</span>
      <span className="block text-xs text-muted-foreground">{hint}</span>
    </button>
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-foreground">Create your account</h1>
        <div className="mt-6">
          <p className="text-sm font-medium text-foreground">I want to...</p>
          <div className="mt-2 space-y-2">
            {roleOption("client", "Book services as a client", "Browse and book sessions")}
            {roleOption(
              "business_owner",
              "Manage my own business",
              "Set up a gym, studio, or coaching business",
            )}
          </div>
        </div>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <input
            required
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          />
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          {info && <p className="text-sm text-muted-foreground">{info}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {loading ? "Creating account..." : "Sign up"}
          </button>
        </form>
        <p className="mt-4 text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="text-foreground underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
