# Premium Owner Dashboard Polish

## Goal
Polish only the authenticated owner dashboard into a cohesive, premium Fitly workspace. Keep every existing query, mutation, permission, and business rule intact; introduce no database or security changes.

## Dashboard frame
- Replace the repeated page-level navigation treatment with one reusable dashboard shell used by every existing owner screen.
- Add a compact desktop sidebar with the current destinations: Overview, Services, Staff, Bookings, Payments, Booking link, and Settings.
- Add a responsive mobile header and menu that preserves the same destinations without horizontal scrolling.
- Show the current business logo/name/type when available, a restrained Fitly identity, owner account access, and the existing logout action.
- Apply saved business colors as subtle accents only, while keeping dashboard contrast and readability controlled by Fitly tokens.

## Overview
- Build summary cards from existing live data only: today’s bookings, upcoming bookings, active services, staff count, and current-month paid revenue when available.
- Add an upcoming-bookings list showing client, service, staff, date/time, booking state, and relevant payment state.
- Add recent activity only from timestamps/statuses already returned by existing data; omit it if the current data cannot support an accurate timeline.
- Add quick links to the existing Add service, Add staff, Bookings, and public booking page destinations.
- Promote the existing booking URL with copy and open actions; reuse the existing QR experience rather than duplicating its logic.

## Existing pages
- **Bookings:** improve scanability, date/time hierarchy, status and payment badges, action placement, loading, and empty states without changing transitions.
- **Payments:** refine month summaries and transaction rows while preserving all calculations and payment behavior.
- **Services:** reorganize the existing form and service list into clearer sections with stronger price, duration, capacity, payment, and active-state presentation.
- **Staff:** improve the add-member form, team cards, service assignments, availability controls, and mobile stacking without changing any staff operations.
- **Booking link:** make the URL, copy/open actions, QR code, slug form, and payment settings easier to scan while retaining the existing handlers.
- **Settings:** polish business information, branding colors, image uploads, contact fields, and save feedback without changing upload or save behavior.

## Visual system and responsiveness
- Extend the existing charcoal, lime, and neutral Fitly tokens with dashboard-specific surface, divider, focus, and state treatments in the global stylesheet.
- Use existing lightweight Lucide icons, consistent compact controls, semantic badges, deliberate spacing, and subtle transitions with reduced-motion support.
- Ensure stable layouts at 360, 390, 430, tablet, and desktop widths; prevent clipped labels, overflowing controls, and horizontal page scrolling.
- Provide action-oriented empty states using only existing destinations and actions.

## Technical details
- Keep all dashboard data access client-side through the existing authenticated queries and row-level rules.
- Reuse `useMyBusiness`, existing booking/payment RPCs, and current mutations; only broaden selected business presentation fields if needed for the header.
- Create small shared presentation components for the shell, page headings, metrics, statuses, and empty/loading states rather than duplicating markup.
- Do not modify migrations, database functions, authentication, role gates, storage policies, notifications, public booking code, or payment logic.

## Verification
- Run focused type and route checks.
- Verify owner login and access to every existing dashboard destination.
- Exercise existing service, staff, booking-status, booking-link copy/open, settings, and payment views without altering their outcomes.
- Check desktop plus 360, 390, 430, and tablet layouts for overflow, navigation usability, readable cards, and intact controls.
- Confirm the public booking URL still opens and no database/security files changed.
