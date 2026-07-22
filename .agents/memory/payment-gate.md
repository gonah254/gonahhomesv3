---
name: Account dashboard payment gate
description: Documents and service requests are locked until booking is confirmed
---

**Rule:** In account.html, after `loadBookings()` runs, it calls `updatePaymentRestriction(hasConfirmed)`.

- `hasConfirmed` = true if ANY booking for that user has `status === 'confirmed'`
- If false: `#doc-payment-notice` and `#req-payment-notice` divs are shown, upload button and file input are disabled, all service-request form fields are disabled.
- If true: notices are hidden and all controls are re-enabled.

**Why:** Guests who haven't paid shouldn't be able to upload documents or submit service requests since their stay isn't confirmed yet.

**How to apply:** The `updatePaymentRestriction()` function must be called after every `loadBookings()` fetch, including after a `cancelBooking()` call that re-triggers `loadBookings()`.
