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
