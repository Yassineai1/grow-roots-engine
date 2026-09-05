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
