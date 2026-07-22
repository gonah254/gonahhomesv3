---
name: Admin authentication
description: How the admin dashboard authenticates — Firebase Auth + optional staff_accounts RBAC
---

The admin dashboard (backend/dashboard.js) uses Firebase Auth `signInWithEmailAndPassword`.

**Rule:** After sign-in, check `staff_accounts/{uid}` in Firestore for a `role` field. If the doc exists, use that role. If the doc is missing but the email matches `ADMIN_EMAIL` (gonahhomes0@gmail.com), allow access as legacy admin. Otherwise sign out and deny.

**Why:** Hardcoded credentials in localStorage were insecure and bypassable. Firebase Auth gives real sessions, token expiry, and brute-force protection.

**How to apply:**
- `checkLoginStatus()` uses `onAuthStateChanged` — runs once on page load, replaces old localStorage check.
- A `dashboardInitialized` boolean prevents double-initialization when both `login()` and `onAuthStateChanged` fire.
- `logout()` calls `firebase.auth().signOut()` and resets the flag.
- The login-form submit handler is async; it calls `await login(email, password)`.
- `script.js` admin modal also now uses Firebase Auth instead of a hardcoded string comparison.
