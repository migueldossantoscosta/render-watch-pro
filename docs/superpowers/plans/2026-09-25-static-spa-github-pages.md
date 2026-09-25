# Static SPA + GitHub Pages Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the RenderWatch dashboard from a TanStack Start (server-rendered) app into a plain client-rendered SPA that builds to a static `dist/` folder, remove the Lovable-specific build tooling and auth coupling that only made sense inside Lovable's own environment, and deploy the result to GitHub Pages via GitHub Actions.

**Architecture:** Drop `@tanstack/react-start`'s server runtime for a plain Vite + `@tanstack/react-router` client-side app — the router code under `src/routes/` barely changes, since `createRouter`/`createFileRoute` work identically without Start. A new `index.html` + `src/main.tsx` become the app's entry point instead of a server-rendered shell. A GitHub Actions workflow builds the static site on every push to `main` and publishes it to GitHub Pages.

**Tech Stack:** Vite (plain, no Start plugin), `@tanstack/react-router` + `@tanstack/router-plugin/vite`, React 19, GitHub Actions (`actions/upload-pages-artifact` + `actions/deploy-pages`).

Full design context: [`docs/superpowers/specs/2026-09-25-static-spa-github-pages-design.md`](../specs/2026-09-25-static-spa-github-pages-design.md).

## Global Constraints

- This repo's GitHub Pages path is `/render-watch-pro/` (repo name `render-watch-pro`) — every base-path value in this plan must match that exactly.
- Code style matches `.prettierrc`: double quotes, semicolons, trailing commas, 100-column print width.
- **Out of scope:** replacing Supabase. The dashboard keeps calling Supabase directly from the browser exactly as it does today — this plan only changes how the app is built and served.
- No automated tests are added for the build/deploy pipeline itself (infrastructure, not application logic) — verification is running the actual build/preview/deploy and checking the result, consistent with the rest of this dashboard having no test suite.
- Package manager is bun (`bun install`, `bun run <script>`) throughout, matching the rest of the repo.

---

## Task 1: Convert the app to a plain Vite SPA

**Files:**
- Create: `index.html`
- Create: `src/main.tsx`
- Modify: `vite.config.ts` (full replacement)
- Modify: `package.json`
- Modify: `src/router.tsx`
- Modify: `src/routes/__root.tsx`
- Modify: `src/routes/auth.tsx` (remove the `ssr` option only — the Google sign-in removal is Task 2)
- Modify: `src/routes/_authenticated/route.tsx` (remove the `ssr` option only)
- Delete: `src/start.ts`
- Delete: `src/server.ts`
- Delete: `src/lib/error-capture.ts`
- Delete: `src/lib/error-page.ts`

**Interfaces:**
- Produces: a working `bun run build` (outputs static `dist/`) and `bun run preview` (serves it locally at `/render-watch-pro/`) — Task 3's GitHub Actions workflow runs exactly these two commands (build, then upload the `dist/` folder) with no further changes needed to the build itself.
- Consumes: `getRouter()` already exported from `src/router.tsx` (signature unchanged by this task except for the added `basepath` option internally — the exported function's shape, `() => Router`, doesn't change).

- [ ] **Step 1: Create the Vite HTML entry point**

Create `index.html` at the repo root:

```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="/favicon.ico" type="image/x-icon" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
    />
    <title>RenderWatch</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Vite rewrites the root-relative `href`/`src` paths above (`/favicon.ico`, `/src/main.tsx`) according to the `base` config set in Step 3 — don't hardcode `/render-watch-pro/` into this file.

- [ ] **Step 2: Create the client entry point**

Create `src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import "./styles.css";
import { getRouter } from "./router";

const router = getRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element #root not found in index.html");

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
```

- [ ] **Step 3: Replace the Vite config**

Replace the full contents of `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

export default defineConfig({
  base: "/render-watch-pro/",
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
});
```

- [ ] **Step 4: Add a basepath to the router so client-side navigation matches the Pages path**

In `src/router.tsx`, add `basepath: "/render-watch-pro"` to the `createRouter` call:

```tsx
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    basepath: "/render-watch-pro",
  });

  return router;
};
```

- [ ] **Step 5: Simplify the root route for client-only rendering**

Replace the full contents of `src/routes/__root.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
} from "@tanstack/react-router";
import { useEffect } from "react";

import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="mono text-7xl font-bold text-primary text-glow">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Signal lost</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This page doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { title: "RenderWatch" },
      { name: "description", content: "Remote render monitoring for creators." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <HeadContent />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster position="top-right" />
    </QueryClientProvider>
  );
}
```

This drops `shellComponent`/`<Scripts />` (Start-only: they render the `<html>/<head>/<body>` shell and inject the server-built bundle reference — both meaningless without a server; `index.html` now owns the shell) and the `appCss`/`reportLovableError` imports (styles now load via the plain `import "./styles.css"` in `main.tsx`; Lovable's error-reporting hook is removed as part of dropping the Lovable coupling). `<HeadContent />` moves into `RootComponent` so it still applies each route's per-page `head()` meta on top of what's already in `index.html`.

- [ ] **Step 6: Remove the Start-only `ssr` route option**

In `src/routes/auth.tsx`, remove line 13 (`ssr: false,`) from the route config — it's a TanStack Start-specific option that doesn't exist on plain `@tanstack/react-router`'s `createFileRoute` and will fail to type-check once Start is gone.

In `src/routes/_authenticated/route.tsx`, remove line 6 (`ssr: false,`) the same way.

- [ ] **Step 7: Delete the server-only files**

```bash
rm src/start.ts src/server.ts src/lib/error-capture.ts src/lib/error-page.ts
```

These were TanStack Start's server entry, its request middleware, and the SSR-error-page rendering they used — none of them run in a static SPA with no server.

- [ ] **Step 8: Update `package.json`**

Remove `"@tanstack/react-start": "1.168.32",` from `dependencies`.
Remove `"@lovable.dev/vite-tanstack-config": "^2.23.1",` and `"nitro": "3.0.260603-beta",` from `devDependencies`.
Change the `dev` script from `"vite dev"` to `"vite"` (plain Vite's dev-server command, since Start's wrapped CLI is gone). Leave `build`, `build:dev`, `preview`, `lint`, `format` unchanged.

- [ ] **Step 9: Install and verify the build**

Run: `bun install`
Expected: lockfile updates to drop `@tanstack/react-start`, `@lovable.dev/vite-tanstack-config`, and `nitro`; no errors.

Run: `bun run build`
Expected: succeeds, producing `dist/index.html` and a `dist/assets/` folder with hashed JS/CSS files. No TypeScript or Vite errors. This build also regenerates `src/routeTree.gen.ts` (the router plugin writes it as a build step) — it currently imports from `@tanstack/react-start`, which is no longer installed after this task, so the build would fail with an unresolved-import error if this file weren't automatically rewritten to the plain-router format by the new `tanstackRouter(...)` plugin config from Step 3.

Run: `grep -c "@tanstack/react-start" src/routeTree.gen.ts`
Expected: `0` (confirms the regenerated file no longer references Start).

- [ ] **Step 10: Verify the built site actually serves and boots**

Run: `bun run preview &` then, after a couple seconds, `curl -s http://localhost:4173/render-watch-pro/`
Expected: the response is the built `index.html` (contains `<div id="root">` and a `<script type="module" src="/render-watch-pro/assets/...">` tag referencing a hashed JS file — the `/render-watch-pro/` prefix on the script `src` is Vite's `base` config taking effect on the built output, unlike the unprefixed source reference in the `index.html` you wrote in Step 1).
Stop the preview server afterward (`kill %1` or equivalent).

- [ ] **Step 11: Commit**

```bash
git add index.html src/main.tsx vite.config.ts package.json bun.lock src/router.tsx src/routes/__root.tsx src/routes/auth.tsx "src/routes/_authenticated/route.tsx" src/routeTree.gen.ts
git rm src/start.ts src/server.ts src/lib/error-capture.ts src/lib/error-page.ts
git commit -m "feat: convert the dashboard to a plain Vite SPA"
```

---

## Task 2: Remove the Lovable-specific auth coupling

**Files:**
- Modify: `src/integrations/supabase/client.ts`
- Modify: `src/routes/auth.tsx` (remove the Google sign-in button and handler)
- Modify: `package.json`
- Delete: `src/integrations/lovable/index.ts` (and the now-empty `src/integrations/lovable/` directory)
- Delete: `src/integrations/supabase/previewAuthStorage.ts`
- Delete: `src/integrations/supabase/auth-attacher.ts`
- Delete: `src/integrations/supabase/auth-middleware.ts`
- Delete: `src/integrations/supabase/client.server.ts`
- Delete: `src/integrations/supabase/cron-auth.ts`
- Delete: `src/lib/lovable-error-reporting.ts`

**Interfaces:**
- Consumes: nothing new from Task 1 beyond what's already in the repo (`supabase` client export from `src/integrations/supabase/client.ts` — unchanged shape, only its internal `storage` option changes).
- Produces: `auth.tsx` with only email/password sign-in/sign-up (no OAuth) — no later task depends on the removed Google button.

**Why these are safe to delete:** `auth-middleware.ts` and `cron-auth.ts` have no importers anywhere in the codebase already (confirmed by search) — they're pre-existing dead code from the Lovable scaffold. `client.server.ts` is only ever referenced in its own comment as an example of a dynamic `import()` some server route handler *could* do — nothing actually calls it. `auth-attacher.ts`'s only importer was `src/start.ts`, deleted in Task 1. `previewAuthStorage.ts`'s only importer is `client.ts`, edited in this task. `src/integrations/lovable/index.ts`'s only importer is `auth.tsx`'s Google sign-in handler, removed in this task. `lovable-error-reporting.ts`'s only importer was `__root.tsx`, already removed in Task 1.

- [ ] **Step 1: Stop routing Supabase auth storage through Lovable's preview broker**

In `src/integrations/supabase/client.ts`, remove the import line:

```ts
import { brokeredPreviewStorage } from './previewAuthStorage';
```

and remove the `storage: brokeredPreviewStorage(),` line from the `auth` options object passed to `createClient`, so that object becomes:

```ts
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
```

Leaving `storage` unset makes `@supabase/supabase-js` use its own default (`localStorage` in a browser), which is what every other page in this app already assumes (`_authenticated/route.tsx`'s `beforeLoad` reads the session via `supabase.auth.getUser()`, which works with the default storage the same way).

- [ ] **Step 2: Remove the Google sign-in button from the auth page**

In `src/routes/auth.tsx`:

1. Remove the import: `import { lovable } from "@/integrations/lovable/index";`
2. Remove the `handleGoogle` function (lines 71-81 in the current file):

```ts
  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard", replace: true });
  }
```

3. Remove the "OR" divider and the Google button from the JSX (immediately after the closing `</form>`):

```tsx
        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          OR
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button variant="outline" className="w-full" onClick={handleGoogle}>
          Continue with Google
        </Button>
```

Email/password sign-in and sign-up (the `handleSubmit` function and the form above it) are untouched.

- [ ] **Step 3: Delete the now-unused files**

```bash
rm -r src/integrations/lovable
rm src/integrations/supabase/previewAuthStorage.ts
rm src/integrations/supabase/auth-attacher.ts
rm src/integrations/supabase/auth-middleware.ts
rm src/integrations/supabase/client.server.ts
rm src/integrations/supabase/cron-auth.ts
rm src/lib/lovable-error-reporting.ts
```

- [ ] **Step 4: Remove the last Lovable dependency**

Remove `"@lovable.dev/cloud-auth-js": "^1.1.2",` from `dependencies` in `package.json`.

- [ ] **Step 5: Verify**

Run: `bun install`
Expected: lockfile drops `@lovable.dev/cloud-auth-js`; no errors.

Run: `bun run build`
Expected: succeeds — no leftover references to any deleted file (a stale import would show up here as a resolution error).

Run: `bun run lint`
Expected: no new errors from `auth.tsx` or `client.ts` (pre-existing unrelated warnings elsewhere are out of scope).

Run: `grep -rn "lovable" src/ --include="*.ts" --include="*.tsx" -i`
Expected: no matches (confirms no remaining reference to anything Lovable-specific in application source).

- [ ] **Step 6: Commit**

```bash
git add src/integrations/supabase/client.ts src/routes/auth.tsx package.json bun.lock
git rm -r src/integrations/lovable
git rm src/integrations/supabase/previewAuthStorage.ts src/integrations/supabase/auth-attacher.ts src/integrations/supabase/auth-middleware.ts src/integrations/supabase/client.server.ts src/integrations/supabase/cron-auth.ts src/lib/lovable-error-reporting.ts
git commit -m "feat: remove Lovable-specific auth coupling (Google sign-in, preview storage broker)"
```

---

## Task 3: GitHub Actions deploy pipeline + SPA routing fallback

**Files:**
- Create: `.github/workflows/deploy-pages.yml`
- Create: `public/404.html`
- Modify: `index.html` (add the matching redirect-decoder script)

**Interfaces:** None — this task only adds deploy infrastructure around the build Task 1 already produces (`bun run build` → `dist/`).

- [ ] **Step 1: Add the GitHub Pages SPA fallback page**

GitHub Pages has no server-side rewrite rules, so a hard navigation or refresh on a deep route like `/dashboard` requests a literal `/render-watch-pro/dashboard` file from GitHub's static file server, which doesn't exist, and Pages serves `404.html` instead. This is the standard workaround (redirect the 404 back to `index.html`, encoding the original path in the query string so client-side routing can restore it) — see https://github.com/rafgraph/spa-github-pages for the original.

Create `public/404.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>RenderWatch</title>
    <script type="text/javascript">
      // Single Page Apps for GitHub Pages
      // https://github.com/rafgraph/spa-github-pages
      var pathSegmentsToKeep = 1;

      var l = window.location;
      l.replace(
        l.protocol +
          "//" +
          l.hostname +
          (l.port ? ":" + l.port : "") +
          l.pathname
            .split("/")
            .slice(0, 1 + pathSegmentsToKeep)
            .join("/") +
          "/?/" +
          l.pathname
            .slice(1)
            .split("/")
            .slice(pathSegmentsToKeep)
            .join("/")
            .replace(/&/g, "~and~") +
          (l.search ? "&" + l.search.slice(1).replace(/&/g, "~and~") : "") +
          l.hash,
      );
    </script>
  </head>
  <body></body>
</html>
```

`pathSegmentsToKeep = 1` matches this repo's GitHub Pages path having exactly one segment (`render-watch-pro`) before the app's own routes.

- [ ] **Step 2: Decode the redirected path before the router boots**

In `index.html` (from Task 1), add the matching decoder script inside `<head>`, before the `<script type="module" src="/src/main.tsx">` line:

```html
    <script type="text/javascript">
      // Single Page Apps for GitHub Pages
      // https://github.com/rafgraph/spa-github-pages
      (function (l) {
        if (l.search[1] === "/") {
          var decoded = l.search
            .slice(1)
            .split("&")
            .map(function (s) {
              return s.replace(/~and~/g, "&");
            })
            .join("?");
          window.history.replaceState(null, "", l.pathname.slice(0, -1) + decoded + l.hash);
        }
      })(window.location);
    </script>
```

The full `<head>` should now read, in order: charset, viewport, favicon, font preconnects/stylesheet, this decoder script, then `<title>`.

- [ ] **Step 3: Add the GitHub Actions workflow**

Create `.github/workflows/deploy-pages.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch: {}

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Build
        run: bun run build

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 4: Verify the build still works locally with the new files present**

Run: `bun run build`
Expected: succeeds; `dist/404.html` exists (copied from `public/`) alongside `dist/index.html`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy-pages.yml public/404.html index.html
git commit -m "feat: add GitHub Pages deploy workflow and SPA routing fallback"
```

- [ ] **Step 6: Enable Pages in the repository settings (one-time, manual — cannot be done from a commit)**

This step requires the repository owner to act in the GitHub UI, not a code change:
1. Go to `https://github.com/migueldossantoscosta/render-watch-pro/settings/pages`.
2. Under "Build and deployment" → "Source", select **GitHub Actions** (not "Deploy from a branch").
3. Push this task's commit to `main` (or re-run the workflow manually from the Actions tab) and confirm the `deploy` job succeeds.

- [ ] **Step 7: Verify the live deployment**

Once the workflow succeeds, open `https://migueldossantoscosta.github.io/render-watch-pro/` in a browser.
Expected: the app loads (shows the sign-in page or, if already authenticated in that browser, the dashboard). Navigate to `/dashboard` directly by typing the full URL, or refresh while on it — expected: the page loads correctly (redirected through `404.html` and restored) instead of showing GitHub's 404 page.
