---
name: Booking confirmation flow
description: The 3-step booking flow and what each step communicates
---

**Rule:** Step 3 of the booking modal is a PENDING state, not a confirmed state.

- Step 1: Guest fills in name, email, phone, dates, guests.
- Step 2: Guest reviews their booking summary.
- Step 3: Booking is written to Firestore with `status: 'pending'`. The screen shows a clock icon (orange, #e65100), "Booking Request Received!" heading, and a "Pending Payment" badge. M-Pesa instructions follow.

**Why:** Showing a green checkmark and "Booking Confirmed!" was misleading — the admin still needs to verify the M-Pesa payment and change status to 'confirmed' in the dashboard.

**How to apply:** The actual confirmation only happens when an admin changes status in backend/dashboard.html. That status change writes to `admin_notifications` in Firestore and sends an email to the guest via EmailJS.
