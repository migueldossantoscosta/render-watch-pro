# RenderWatch — Static SPA + GitHub Pages Deploy (Design)

## Context

RenderWatch's dashboard is currently a TanStack Start app: a React framework
with its own server runtime (Nitro, targeting Cloudflare), wired up through
`@lovable.dev/vite-tanstack-config` (a Lovable-managed Vite config wrapper)
and `@lovable.dev/cloud-auth-js`. The only place this app has ever been
reachable is Lovable's own hosted preview.

The user wants to stop depending on Lovable and Supabase entirely, and wants
a URL they can open without running anything locally — specifically on
GitHub Pages, which only serves static files and cannot run a Node server.
This design covers converting the app to a plain client-rendered single-page
app (SPA) that builds to a static `dist/` folder, and wiring up GitHub Actions
to publish that folder to GitHub Pages automatically.

This is the first of several planned sub-projects (the user is also moving
the backend off Supabase to a self-hosted Fastify + Postgres server — see
`docs/superpowers/specs/2026-09-21-desktop-agent-telemetry-ingest-design.md`
for the prior, Supabase-based agent design, which will need revisiting once
that backend work happens). **Out of scope here:** replacing Supabase itself.
The dashboard keeps calling Supabase directly from the browser for now — this
design only changes *how the app is built and served*, not what it talks to.
Login and live data will keep working exactly as they do today, unaffected by
this change, until the backend sub-projects replace Supabase.

## Architecture

Drop TanStack Start's server runtime and go back to what `@tanstack/react-router`
was designed for outside of Start: a plain Vite-built React SPA. The router
code itself (`src/router.tsx`, all files under `src/routes/`) barely changes —
`createRouter`/`createFileRoute`/`createRootRouteWithContext` all work
identically without Start. What changes is *how the app boots*: instead of a
server rendering HTML per-request, `index.html` loads one JS bundle that
mounts the whole app client-side, and every route (including data fetching
via Supabase) resolves in the browser after that.

```
git push (main) → GitHub Actions: bun run build → dist/ (static) → GitHub Pages
```

Build output is a single static site with no server component at all —
GitHub Pages requirement satisfied by construction, not by configuration.

## Components

**Removed** (all server-runtime or Lovable-specific, meaningless without a
server or without Lovable's editor):
- `src/start.ts`, `src/server.ts` — TanStack Start's server entry and
  middleware (CSRF, error-wrapping for SSR responses).
- `src/lib/error-capture.ts`, `src/lib/error-page.ts` — support code for
  rendering an error page from `server.ts`; dead once that file is gone.
- `src/lib/lovable-error-reporting.ts` — reports render errors back to
  Lovable's editor; meaningless outside it.
- `src/integrations/lovable/` (whole directory) — Lovable-specific glue.
- `src/integrations/supabase/auth-attacher.ts`,
  `src/integrations/supabase/auth-middleware.ts`,
  `src/integrations/supabase/client.server.ts`,
  `src/integrations/supabase/cron-auth.ts` — all server-side (per-request)
  Supabase auth wiring; the app already does its auth checks client-side
  (`src/routes/_authenticated/route.tsx`'s `beforeLoad`, which calls
  `supabase.auth.getUser()` from the browser) so none of this is load-bearing.
- `src/integrations/supabase/previewAuthStorage.ts` — brokers the Supabase
  session through Lovable's iframe preview; not needed outside that preview.
- Dependencies: `@tanstack/react-start`, `@lovable.dev/vite-tanstack-config`,
  `@lovable.dev/cloud-auth-js`, `nitro`.

**Modified:**
- `vite.config.ts` — replaced with a plain Vite config: `@vitejs/plugin-react`,
  `@tanstack/router-plugin/vite` (route-tree codegen only), `@tailwindcss/vite`,
  `vite-tsconfig-paths`. Sets `base: "/render-watch-pro/"` (this repo's GitHub
  Pages path) so built asset URLs resolve correctly when served from
  `https://<user>.github.io/render-watch-pro/`.
- `src/router.tsx` — `createRouter(...)` gets a `basepath: "/render-watch-pro"`
  option to match.
- `src/routes/__root.tsx` — drops `shellComponent` (Start-only concept) and
  `<Scripts />` (injects the server-rendered bundle reference; meaningless
  without a server). `<HeadContent />` stays — TanStack Router manages
  per-route `<title>`/meta tags client-side too, not just under SSR. Drops the
  `reportLovableError` call in `ErrorComponent` (already `console.error`s
  first; that's kept).
- `src/integrations/supabase/client.ts` — drops `brokeredPreviewStorage()`
  (Lovable-preview-only), uses Supabase's own default session storage
  (`localStorage`) instead.
- `package.json` — scripts unchanged in spirit (`build` still runs `vite build`,
  now producing a plain static `dist/`); dependency list loses everything in
  "Removed" above.

**Created:**
- `index.html` — the standard Vite SPA entry point: a `<div id="root">` plus
  a `<script type="module" src="/src/main.tsx">`. Metadata that used to live
  in `__root.tsx`'s `head()` for the *document shell itself* (charset,
  viewport, favicon, font preconnects) moves here since there's no more
  `shellComponent` to render an `<html>`/`<head>` from; `__root.tsx`'s `head()`
  keeps the per-route stuff (title, description, og/twitter tags) since
  `<HeadContent />` still applies those on top of what's in `index.html`.
- `src/main.tsx` — the new client entry: creates the router via
  `getRouter()` (already exported from `router.tsx`, unchanged) and calls
  `ReactDOM.createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />)`,
  wrapped in `<StrictMode>`.
- `.github/workflows/deploy.yml` — on push to `main`: checkout, install Bun,
  `bun install`, `bun run build`, then `actions/upload-pages-artifact` on
  `dist/` and `actions/deploy-pages` to publish it. Uses GitHub's official
  Pages deployment flow (OIDC-based, no separate `gh-pages` branch to manage).
- `public/404.html` — the standard GitHub-Pages SPA fallback: a small script
  that redirects any unknown path back to `index.html` while preserving the
  original path in the URL (so refreshing `/dashboard` directly, or sharing
  that link, doesn't 404 — GitHub Pages has no server-side rewrite rules, so
  client-side routing needs this trick to survive a hard navigation).

## Data flow

Unchanged from today, except for *how the JS/CSS gets to the browser*:
1. GitHub Actions builds the static site and publishes it to GitHub Pages.
2. Visiting the Pages URL downloads `index.html` (or `404.html`, which
   redirects to it) and the JS bundle.
3. `main.tsx` mounts the router; `_authenticated/route.tsx`'s `beforeLoad`
   calls Supabase directly from the browser exactly as it does now.
4. All existing dashboard/machines/auth behavior is otherwise identical —
   this design doesn't touch application logic, only the build/serve layer.

## Error handling

- A build failure in the GitHub Actions workflow fails the workflow run
  (visible in the repo's Actions tab) and does not publish a broken deploy —
  `actions/deploy-pages` only runs after a successful build+artifact-upload
  step.
- Client-side runtime errors still hit `__root.tsx`'s `ErrorComponent`
  (`console.error` plus a "try again"/"go home" UI) — unchanged from today,
  minus the now-removed Lovable-specific reporting call.
- Deep-linked or refreshed routes are handled by the `404.html` redirect
  trick described above, rather than actually being treated as missing pages.

## Testing

- `bun run build` succeeds locally and `bun run preview` serves the output
  correctly at `/render-watch-pro/` (matching the configured `base`), with
  the dashboard, auth, and machines routes all reachable and functioning
  exactly as before.
- Manual verification after the GitHub Actions workflow runs: the deployed
  Pages URL loads `/`, and navigating directly to a deep route (e.g.
  `/dashboard` typed straight into the address bar, or a hard refresh on it)
  does not 404.
- No automated tests are added for the build/deploy pipeline itself — this is
  infrastructure/tooling, not application logic, consistent with how the rest
  of this dashboard has no test suite either.
