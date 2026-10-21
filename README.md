# Grow Roots Engine

A multi-tenant booking & business management SaaS starter kit for gyms, fitness studios, and independent coaches. Built with TanStack Start, Supabase, and Tailwind CSS.

> **Status**: Functional MVP. Payments run in **Mock/Test mode only** — no real payment provider is integrated. See [Known Limitations](#known-limitations).

## What's Inside

- **Authentication** — email/password signup, login, password reset
- **Role-based access** — Platform Admin, Business Owner, Staff, Client
- **Multi-tenant businesses** — each business has its own branding, services, staff, and clients (isolated via Supabase RLS)
- **Services management** — one-on-one sessions and group classes with capacity
- **Staff management** — availability per staff member, services linked to staff
- **Public booking page** — per-business slug-based page with services, staff, and contact info
- **Booking engine** — slot availability, double-booking prevention, group capacity enforcement (advisory lock + validation function)
- **Client self-service** — view and cancel bookings, edit profile
- **Owner dashboard** — bookings today, upcoming, active services, revenue this month
- **Client CRM** — list, search, filter, view totals per client
- **Notifications** — Resend-powered email confirmations, owner alerts, 24-hour reminders (cron)
- **Payment abstraction** — provider-agnostic layer with a Mock/Test provider

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | TanStack Start |
| UI | React 19 + Tailwind CSS 4 |
| Routing | TanStack Router |
| Data | TanStack Query |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions) |
| ORM | Drizzle ORM + drizzle-kit |
| Validation | Zod |
| Forms | react-hook-form |
| Email | Resend |
| Build | Vite |

## Requirements

- Node.js 20+
- npm (or pnpm / yarn)
- A Supabase project (free tier works)
- A Resend account (free tier works)

## Quick Start

### 1. Clone & install

    git clone <your-repo-url> grow-roots-engine
    cd grow-roots-engine
    npm install

### 2. Configure environment

    cp .env.example .env

Fill in the values in `.env` (see Environment Variables below).

### 3. Apply database migrations

Run the SQL files in `supabase/migrations/` against your Supabase project. Two options:

- Paste them in order into the Supabase SQL editor, or
- Use the Supabase CLI:

    supabase link --project-ref <your-project-ref>
    supabase db push

### 4. Run locally

    npm run dev

App runs at http://localhost:5173.

## Environment Variables

See `.env.example` for the full list.

### Supabase (public — safe in browser)

| Variable | Purpose |
|---|---|
| `SUPABASE_PROJECT_ID` | Your Supabase project reference |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Public anon/publishable key |
| `VITE_SUPABASE_*` | Same values exposed to the Vite client |

### Secrets (server-only — never expose client-side)

| Variable | Purpose |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin access — bypasses RLS |
| `LOVABLE_CRON_SECRET` | Bearer token protecting the booking-reminders cron endpoint |
| `LOVABLE_CRON_SECRET_PREVIOUS` | Optional — for rotating the cron secret without downtime |
| `RESEND_API_KEY` | Send transactional emails |
| `LOVABLE_API_KEY` | Optional — AI assistant integration |
| `LOVABLE_DB_MIGRATION_URL` | Postgres connection string used by Drizzle migrations |

## Database

The schema lives in **`supabase/migrations/`** as ordered SQL migrations — **not** in `drizzle/schema.ts` (which is intentionally empty).

`drizzle.config.ts` points to `LOVABLE_DB_MIGRATION_URL` and can be used to run migration tooling. Supabase migrations are the source of truth.

### RLS & multi-tenant isolation

Row Level Security is enforced on all tenant-scoped tables. Helper functions in `app_private` (`is_platform_admin`, `owns_business`, `is_own_client`) gate access. Cross-tenant isolation was audited at the SQL level.

## Deployment

The build targets Cloudflare Workers via Nitro:

    npm run build
    npm run preview

See TanStack Start + Nitro docs for deployment specifics (Cloudflare, Vercel, Node).

### Cron scheduler

The booking-reminders endpoint requires:

    Authorization: Bearer <LOVABLE_CRON_SECRET>

If your scheduler sends an `apikey` header instead, reminders will fail with 401.

## Known Limitations

Honest, current limitations — not future promises:

- **Payments are Mock/Test only.** No real payment provider (Stripe, CMI, etc.) is integrated or tested.
- **Multilingual UI is not implemented.** The schema has `preferred_language`, but the UI is English-only.
- **Timezone handling** is not fully verified across DST or cross-region bookings.
- **No automated test suite.** Type checking and production build pass; runtime smoke tests are manual.
- **Full ESLint is not clean** — one error in a generated file plus warnings. Not a release blocker.
- **Client bundle** is ~560 KB (~163 KB gzip), above Vite's 500 KB warning threshold.
- **AI assistant and WhatsApp integrations** are intentionally out of scope.

## Project Structure

    src/
      lib/                    # Server functions, business logic
        payments/             # Provider abstraction (Mock/Test)
        notifications.*       # Resend email helpers
        *.functions.ts        # Server functions
      routes/                 # File-based routing (TanStack Router)
        _authenticated/       # Owner/staff dashboard routes
        book/$slug.tsx        # Public booking page
        login.tsx, signup.tsx, ...
        __root.tsx
      integrations/supabase/  # Supabase client setup

    supabase/
      config.toml
      migrations/             # 19 SQL migrations (source of truth)

    drizzle/
      schema.ts               # Auto-generated, intentionally blank
      migrations/

## License

This software is sold under a **Single-Use Commercial License**. See [LICENSE.md](./LICENSE.md) for full terms.

In short: you may use the code in one end product (personal or commercial). You may not resell it as a template.

## Support

Support is provided via email for setup-related questions. Scope and duration are defined on the product page (Gumroad / LemonSqueezy).

For issues, include:
- The exact error message
- Steps to reproduce
- Your environment (Node version, OS)

---

**Version**: 0.1.0 — Pre-release.
