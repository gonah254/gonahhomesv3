
// M-Pesa Integration for Gonah Homes
class MpesaIntegration {
  constructor() {
    this.mpesaNumber = "0799466723";
    this.businessName = "Gonah Homes";
  }

  // Generate M-Pesa payment prompt
  initiatePayment(amount, phoneNumber, description = "Booking Payment") {
    // Validate phone number format
    const cleanPhone = this.formatPhoneNumber(phoneNumber);
    if (!cleanPhone) {
      return { success: false, message: "Invalid phone number format" };
    }

    // Create payment modal
    this.showPaymentModal(amount, cleanPhone, description);
    return { success: true, message: "Payment initiated" };
  }

  // Format phone number to Kenyan format
  formatPhoneNumber(phone) {
    // Remove any non-digit characters
    const digits = phone.replace(/\D/g, '');
    
    // Convert to Kenyan format
    if (digits.startsWith('254')) {
      return digits;
    } else if (digits.startsWith('0')) {
      return '254' + digits.substr(1);
    } else if (digits.length === 9) {
      return '254' + digits;
    }
    
    return null;
  }

  // Show payment modal with instructions
  showPaymentModal(amount, phoneNumber, description) {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop active';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>M-Pesa Payment</h3>
          <button class="modal-close" onclick="this.closest('.modal-backdrop').remove()">×</button>
        </div>
        <div class="modal-body">
          <div style="text-align: center; padding: 2rem;">
            <div style="background: #059669; color: white; padding: 2rem; border-radius: 10px; margin-bottom: 2rem;">
              <h2 style="margin: 0 0 1rem 0;">KES ${amount.toLocaleString()}</h2>
              <p style="margin: 0; font-size: 1.1rem;">${description}</p>
            </div>
            
            <div style="background: #f3f4f6; padding: 1.5rem; border-radius: 10px; margin-bottom: 2rem;">
              <h4>Payment Instructions:</h4>
              <ol style="text-align: left; padding-left: 1rem;">
                <li>Go to M-Pesa on your phone</li>
                <li>Select "Lipa na M-Pesa"</li>
                <li>Select "Paybill"</li>
                <li>Enter Business Number: <strong>247247</strong></li>
                <li>Enter Account Number: <strong>GONAH${Date.now().toString().substr(-4)}</strong></li>
                <li>Enter Amount: <strong>KES ${amount}</strong></li>
                <li>Enter your M-Pesa PIN</li>
                <li>Confirm the payment</li>
              </ol>
            </div>

            <div style="background: #fef3c7; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
              <p><strong>Note:</strong> You will receive an M-Pesa confirmation SMS. Please save this as proof of payment.</p>
            </div>

            <button class="btn btn-success" onclick="this.closest('.modal-backdrop').remove(); window.confirmPayment('${phoneNumber}', ${amount})">
              I Have Made Payment
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
  }

  // Simulate payment confirmation
  async confirmPayment(phoneNumber, amount, bookingId) {
    try {
      // Store payment record
      await firebase.firestore().collection('payments').add({
        phoneNumber: phoneNumber,
        amount: amount,
        bookingId: bookingId,
        status: 'pending_verification',
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        mpesaCode: 'PENDING' // Will be updated when admin verifies
      });

      // Send notification to admin
      await emailjs.send('service_sf7nruj', 'template_p667wcm', {
        from_name: "Payment System",
        reply_to: "system@gonahhomes.com",
        phone: phoneNumber,
        house: "Payment Notification",
        message: `Payment confirmation needed:\nAmount: KES ${amount}\nPhone: ${phoneNumber}\nBooking: ${bookingId}\n\nPlease verify M-Pesa receipt and update booking status.`,
        admin_link: window.location.origin + "/admin.html"
      });

      return { success: true, message: "Payment confirmation sent. You will be contacted shortly." };
    } catch (error) {
      console.error('Error confirming payment:', error);
      return { success: false, message: "Error processing payment confirmation" };
    }
  }
}

// Global payment confirmation function
window.confirmPayment = async function(phoneNumber, amount) {
  const mpesa = new MpesaIntegration();
  const bookingId = localStorage.getItem('lastBookingId') || 'UNKNOWN';
  const result = await mpesa.confirmPayment(phoneNumber, amount, bookingId);
  
  if (result.success) {
    alert(result.message);
  } else {
    alert('Error: ' + result.message);
  }
};

// Initialize M-Pesa integration
document.addEventListener('DOMContentLoaded', function() {
  window.mpesa = new MpesaIntegration();
});
