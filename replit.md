# Gonah Homes - Property Rental Management System

## Overview

Gonah Homes is a coastal accommodation rental platform based in Mombasa, Kenya. The system provides a multi-property booking platform with integrated payment processing (M-Pesa), customer management, and an administrative dashboard for managing bookings, reviews, and customer communications.

The platform offers various accommodation types ranging from studio apartments to four-bedroom units and maisonettes, with features for calendar-based booking, real-time availability checking, email notifications, and customer review management.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- Pure HTML/CSS/JavaScript (no framework dependencies)
- Firebase SDK for backend services
- Flatpickr for advanced date selection with visual indicators
- EmailJS for email communications
- Font Awesome and Google Fonts for UI

**Design Pattern:**
- Multi-page application with separate HTML files for each major section
- Shared navigation component across pages
- Glassmorphism UI design with maroon (#800000) and gold (#FFD600) color scheme
- Mobile-first responsive design
- Glassy modal effects with backdrop blur

**Key Components:**
1. **Property Listings** - Dynamic property cards with image galleries, pricing, and features
   - Price tags displayed prominently (KSh per night)
   - Gallery button for viewing multiple property images
   - Responsive card layout with hover effects
2. **Booking Calendar** - Interactive Flatpickr calendar with advanced date management
   - Real-time date blocking from Firestore bookings
   - Visual indicators: Green "Open for booking" / Grey "Booked" on each date
   - Smart check-out exclusion (allows same-day check-in when previous booking ends)
   - Prevents double-booking automatically
   - Booking summary with nights calculation and total price
3. **Property Gallery Modal** - Full-screen image slider
   - Multiple images per property (4-5 images each)
   - Previous/Next navigation buttons
   - Thumbnail strip for quick navigation
   - Image counter display
4. **Enhanced Booking Modal** - Glassy modern design
   - Backdrop blur effect for premium look
   - Real-time booking summary showing:
     * Property name
     * Check-in date
     * Check-out date and time (10:00 AM)
     * Number of nights
     * Total price calculation
   - Smooth animations and transitions
5. **Review System** - Public review display and submission form
6. **Contact Forms** - Multi-purpose contact and inquiry forms
7. **Admin Dashboard** - Password-protected management interface

### Backend Architecture

**Firebase Integration:**
- **Firestore Database** - NoSQL document storage for all data
- **No Authentication Service** - Custom credential-based login (username/password stored in code)
- **Real-time Listeners** - Live updates for bookings, messages, and reviews

**Database Collections:**
```
- bookings: Reservation records with dates, customer info, status
  * Fields: house, checkin, checkout, name, email, phone, guests, status, timestamp
  * Used for date blocking and availability checking
- reviews: Customer testimonials and ratings
- messages: Contact form submissions and inquiries
- traffic: Website analytics and visitor tracking
- offers: Special promotions and deals
- clients: Customer database
- emails: Email correspondence records
- settings: System configuration
```

**Property Data Structure** (`properties-data.js`):
- Centralized property information with prices
- Multiple images per property for gallery display
- Property details: price (KSh per night), description, features, image URLs
- Properties: Studio Apartment, One/Two/Three/Four Bedroom, Luxury Maisonette

**Core Services:**

1. **Booking Management** (`backend.js`, `booking-calendar.js`)
   - Advanced Flatpickr calendar integration
   - Real-time date availability checking from Firestore
   - Visual date indicators (green for available, grey for booked)
   - Smart date blocking prevents double-booking
   - Check-out exclusion logic (same-day check-in allowed on checkout days)
   - Automatic nights and price calculation
   - Booking ID generation
   - Status tracking (pending, confirmed, cancelled)
   - Booking data cached per property for performance

2. **Email Service** (`email-auth.js`)
   - EmailJS integration for transactional emails
   - Verification code system
   - Booking confirmations
   - Admin notifications

3. **Payment Processing** (`mpesa-integration.js`)
   - M-Pesa payment instructions
   - Manual payment tracking (no direct API integration)
   - Payment confirmation workflow

4. **Notification System** (`notification-service.js`)
   - Note: Functionality moved to dashboard.js
   - Real-time admin alerts
   - Email notifications for new bookings/messages/reviews

### Data Storage

**Primary Database:** Firebase Firestore (NoSQL)

**Rationale:**
- Real-time synchronization for booking availability
- Serverless architecture reduces hosting complexity
- Built-in security rules
- Scalable for small to medium traffic

**Alternatives Considered:**
- Traditional SQL database would require backend server setup
- Firebase selected for rapid development and maintenance simplicity

**Pros:**
- No server management required
- Real-time updates
- Free tier sufficient for startup phase

**Cons:**
- Vendor lock-in to Firebase ecosystem
- Limited complex query capabilities
- Costs scale with usage

### Authentication & Authorization

**Approach:** Hard-coded credentials in JavaScript

**Current Implementation:**
```javascript
username: 'gonahhomes0@gmail.com'
password: 'gonahhomes@0799466723'
```

**Security Note:** This is a basic authentication system. Credentials are exposed in client-side code, suitable only for low-security administrative access. Not recommended for production environments handling sensitive data.

**Rationale:**
- Simple single-admin system
- No user registration required
- Quick implementation for MVP

**Future Consideration:** Should migrate to Firebase Authentication for production security.

### Payment Integration

**M-Pesa Manual Integration:**

**Problem:** Need to accept mobile money payments from Kenyan customers

**Solution:** Manual M-Pesa payment instructions displayed to users

**Implementation:**
- Display business M-Pesa number (0799466723)
- User makes manual payment
- Admin verifies payment in dashboard
- Booking confirmed upon payment verification

**Why Manual:**
- M-Pesa API requires business registration and API keys
- Manual process works for initial launch
- Lower integration complexity

**Limitations:**
- No automatic payment verification
- Requires manual admin intervention
- Potential for payment/booking mismatches

## External Dependencies

### Third-Party Services

1. **Firebase (Google)**
   - **Service:** Backend as a Service (BaaS)
   - **Usage:** Database, hosting, real-time sync
   - **Configuration:** `firebaseConfig` object in script.js and dashboard.js
   - **Collections:** bookings, reviews, messages, traffic, offers, clients, emails, settings

2. **EmailJS**
   - **Service:** Email delivery API
   - **Usage:** Transactional emails, notifications, verification codes
   - **Configuration:**
     - Service ID: `service_ky2kj3t`
     - Admin Template: `template_24gjzd3`
     - Client Template: `template_6duvs5n`
     - Public Key: `VgDakmh3WscKrr_wQ`

3. **Unsplash**
   - **Service:** Stock photography API
   - **Usage:** Property and hero images via direct URLs
   - **Integration:** Hardcoded image URLs in properties-data.js

4. **Flatpickr**
   - **Service:** JavaScript date picker library
   - **Usage:** Check-in/check-out date selection
   - **Integration:** CDN link in HTML files

5. **Font Awesome**
   - **Service:** Icon library
   - **Usage:** UI icons throughout application
   - **Integration:** CDN link (version 6.0.0)

6. **Google Fonts**
   - **Service:** Web font hosting
   - **Usage:** Poppins font family
   - **Integration:** CDN link with multiple weights (300-700)

### API Integrations

**M-Pesa Payment Gateway:**
- Currently manual instruction-based (no direct API)
- Business number: 0799466723
- Future integration planned for automatic payment verification

### External Resources

- **CDN Dependencies:** All external libraries loaded via CDN
- **No Build Process:** Direct browser execution, no bundler required
- **Static Hosting:** Compatible with any static file host (currently using Python SimpleHTTPServer for development)