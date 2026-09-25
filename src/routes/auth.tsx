import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — RenderWatch" },
      {
        name: "description",
        content: "Sign in to RenderWatch to monitor your render machines from anywhere.",
      },
      { property: "og:title", content: "Sign in — RenderWatch" },
      {
        property: "og:description",
        content: "Sign in to RenderWatch to monitor your render machines from anywhere.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function handleGoogle() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}dashboard`,
      },
    });
    if (error) {
      toast.error(error.message);
      setBusy(false);
    }
    // On success the browser navigates away to Google, so there's nothing else to do here.
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="panel w-full max-w-md p-8 text-center">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <Activity className="size-5 text-primary" />
          <span className="mono text-sm font-bold tracking-widest uppercase">RenderWatch</span>
        </Link>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Monitor renders, temps and jobs from any device.
        </p>

        <Button className="mt-8 w-full shadow-glow" disabled={busy} onClick={handleGoogle}>
          {busy ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <svg className="mr-2 size-4" viewBox="0 0 48 48" aria-hidden>
              <path
                fill="#FFC107"
                d="M43.6 20.5H42V20H24v8h11.3C33.9 32.6 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.5 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"
              />
              <path
                fill="#FF3D00"
                d="M6.3 14.7l6.6 4.8C14.6 15.5 18.9 12 24 12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.5 29.6 4 24 4c-7.5 0-14 4.1-17.7 10.2z"
              />
              <path
                fill="#4CAF50"
                d="M24 44c5.4 0 10.3-2.1 14-5.5l-6.5-5.5C29.4 34.8 26.9 36 24 36c-5.4 0-9.9-3.4-11.5-8.2l-6.6 5C9.8 39.6 16.3 44 24 44z"
              />
              <path
                fill="#1976D2"
                d="M43.6 20.5H42V20H24v8h11.3c-.9 2.5-2.6 4.6-4.8 6l6.5 5.5C40.2 36.5 44 30.9 44 24c0-1.2-.1-2.4-.4-3.5z"
              />
            </svg>
          )}
          Continue with Google
        </Button>
      </div>
    </div>
  );
}
