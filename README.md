# Grow Roots Engine

A production-ready, multi-tenant booking SaaS starter kit for gyms, fitness studios, and coaches.

**Includes:**
- 🔐 Full Authentication (Supabase Auth)
- 🏢 Multi-tenant businesses (Row Level Security)
- 📅 Smart Booking Engine (double-booking prevention, group capacity)
- 💳 Dual Payment Providers: Stripe (Global) + CMI (Morocco)
- ⏰ Timezone support per business
- 📧 Automated email notifications (Resend)
- 📱 Fully responsive design (Tailwind CSS 4)
- 📊 Owner Dashboard & Client CRM

## Tech Stack

- **Framework:** TanStack Start
- **UI:** React 19 + Tailwind CSS 4 + Radix UI
- **Database:** Supabase (Postgres)
- **ORM:** Drizzle ORM
- **Payments:** Stripe SDK
- **Emails:** Resend

## Requirements

- Node.js 20+
- A Supabase project (Free tier works)
- A Resend account (Free tier works)
- A Stripe account (for global payments)

## Quick Start

### 1. Install dependencies
```bash
npm install
App runs at `http://localhost:8080`.

## Stripe Integration

This app supports both CMI and Stripe.
To use Stripe:
1. Create a Stripe account.
2. Get your Test API keys from Stripe Dashboard -> Developers -> API Keys.
3. Go to `/dashboard/settings` in the app.
4. Choose "Stripe (Global)", enter your keys, and save.

To test a payment, use the test card: `4242 4242 4242 4242`.

## Architecture Highlights

- **Provider-Agnostic Payments:** The payment layer is abstracted. You can easily add Payzone or PayPal by creating a new provider in `src/lib/payments/`.
- **Security:** RLS is strictly enforced on all tables. Service Role keys are never exposed to the client.
- **Timezone:** All bookings are stored in UTC and displayed in the business's local timezone.

## License

This software is sold under a Commercial License. See `LICENSE.md`.
