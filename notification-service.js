// Notification Service for Gonah Homes
// Handles admin/client emails & updates, listens to bookings/messages/reviews

// Notification Service disabled - using backend.js instead
// This file is kept for compatibility but functionality moved to backend/dashboard.js

class NotificationService {
  constructor() {
    console.log('NotificationService: Functionality moved to backend dashboard');
  }
}

// Export empty service to prevent errors
if (typeof window !== 'undefined') {
  window.notificationService = new NotificationService();
}
