
// Email Authentication System for Gonah Homes
class EmailAuthService {
  constructor() {
    this.db = firebase.firestore();
    this.pendingEmails = new Map();
    this.verifiedEmails = new Set();
  }

  // Generate verification code
  generateVerificationCode() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
  }

  // Send verification email
  async sendVerificationEmail(email, name = '') {
    const code = this.generateVerificationCode();
    const timestamp = Date.now();
    
    // Store pending verification
    this.pendingEmails.set(email, {
      code: code,
      timestamp: timestamp,
      attempts: 0,
      name: name
    });

    try {
      // Send verification email using EmailJS
      await emailjs.send('service_ky2kj3t', 'template_6duvs5n', {
        to_email: email,
        to_name: name || email.split('@')[0],
        from_name: "Gonah Homes",
        subject: "Email Verification - Gonah Homes",
        message: `Your verification code is: ${code}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this, please ignore this email.`
      });

      return { success: true, message: 'Verification code sent to your email' };
    } catch (error) {
      console.error('Error sending verification email:', error);
      return { success: false, message: 'Failed to send verification email' };
    }
  }

  // Verify email with code
  verifyEmail(email, inputCode) {
    const pending = this.pendingEmails.get(email);
    
    if (!pending) {
      return { success: false, message: 'No verification request found' };
    }

    // Check if code expired (10 minutes)
    if (Date.now() - pending.timestamp > 600000) {
      this.pendingEmails.delete(email);
      return { success: false, message: 'Verification code expired' };
    }

    // Check attempts
    if (pending.attempts >= 3) {
      this.pendingEmails.delete(email);
      return { success: false, message: 'Too many attempts. Please request a new code.' };
    }

    // Verify code
    if (pending.code === inputCode.toUpperCase()) {
      this.verifiedEmails.add(email);
      this.pendingEmails.delete(email);
      
      // Store verified email in database
      this.storeVerifiedEmail(email, pending.name);
      
      return { success: true, message: 'Email verified successfully' };
    } else {
      pending.attempts++;
      return { success: false, message: 'Invalid verification code' };
    }
  }

  // Store verified email
  async storeVerifiedEmail(email, name) {
    try {
      await this.db.collection('verified_emails').doc(email.replace(/[^a-zA-Z0-9]/g, '_')).set({
        email: email,
        name: name,
        verifiedAt: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'verified'
      });
    } catch (error) {
      console.error('Error storing verified email:', error);
    }
  }

  // Check if email is verified
  isEmailVerified(email) {
    return this.verifiedEmails.has(email);
  }

  // Get all verified emails (admin function)
  async getVerifiedEmails() {
    try {
      const snapshot = await this.db.collection('verified_emails').get();
      const emails = [];
      snapshot.forEach(doc => {
        emails.push(doc.data());
      });
      return emails;
    } catch (error) {
      console.error('Error getting verified emails:', error);
      return [];
    }
  }
}

// Initialize email auth service
document.addEventListener('DOMContentLoaded', function() {
  if (typeof firebase !== 'undefined') {
    window.emailAuth = new EmailAuthService();
  }
});
