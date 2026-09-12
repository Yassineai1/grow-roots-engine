# Roadmap

- [x] Owner booking-link settings page (copy link, QR code, editable slug)
- [x] Homepage client guidance + business name search
- [x] Restrict public business search output to name, type, slug, logo_url only (no owner_id, subscription, settings, or other private data)

## Payments (mock/test only)
- [x] payments table + strict RLS (owner / own client / platform admin)
- [x] Per-business CMI config stored in private schema, store key server-only
- [x] services.requires_payment (default false)
- [x] Booking hold + expiry so unpaid holds never permanently block slots
- [x] Provider-agnostic payment layer; CMI mock isolated in provider.server.ts
- [x] /dashboard/payments, payment status on /dashboard/bookings, payment settings
- [ ] Real CMI signed request/redirect + server verification (needs real credentials)

## MVP readiness (notifications, password reset, client cancellation)
- [x] Booking notification outbox + DB trigger (created / confirmed / client-cancelled), one row per event
- [x] sendBookingEmail + outbox dispatcher (logs only — real provider TODO in notifications.server.ts)
- [ ] Connect a real transactional email provider
- [x] Forgot password on /login + /reset-password page
- [x] /my-bookings with client self-cancellation (server-enforced 2h window, own bookings only)

## Business settings & branding
- [x] Owner-only /dashboard/business (name, description, logo, cover, primary/accent colors, phone, WhatsApp)
- [x] Private branding storage bucket with owner-folder policies + signed URLs
- [x] Public booking page consumes saved branding

## Owner dashboard experience
- [x] Premium responsive shell with desktop sidebar and mobile navigation
- [x] Live overview metrics, upcoming bookings, quick actions, and booking-link access
- [x] Consistent presentation polish across services, staff, bookings, payments, booking link, and settings

## Clients
- [x] Owner-only /dashboard/clients list with search (name, email, phone), booking count, last booking, status
- [x] Client detail page with booking history and existing payment info, scoped to the owner business
