/**
 * BOOKING WORKFLOW MODULE
 * Handles booking approval workflow: pending → approved/rejected → confirmed → completed
 * Integrates with dashboard.js and Firestore
 */

const BOOKING_STATUSES = {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    CONFIRMED: 'confirmed',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
};

const STATUS_COLORS = {
    'pending': '#ffc107',
    'approved': '#4caf50',
    'rejected': '#f44336',
    'confirmed': '#2196f3',
    'completed': '#9c27b0',
    'cancelled': '#999999'
};

const STATUS_LABELS = {
    'pending': '⏳ Awaiting Approval',
    'approved': '✅ Approved',
    'rejected': '❌ Rejected',
    'confirmed': '💳 Payment Confirmed',
    'completed': '🎉 Completed',
    'cancelled': '⛔ Cancelled'
};

const PROPERTY_PRICES = {
    'Studio Apartment': 3500,
    'One Bedroom Apartment': 4500,
    'Two Bedroom Apartment': 6000,
    'Three Bedroom Apartment': 8000,
    'Four Bedroom Apartment': 10000,
    'Luxury Maisonette': 15000
};

const ADMIN_EMAIL = 'gonahhomes0@gmail.com';

/**
 * Load pending bookings for admin review
 */
async function loadPendingBookings() {
    try {
        const snapshot = await db.collection('bookings')
            .where('status', '==', 'pending')
            .orderBy('timestamp', 'desc')
            .get();

        const container = document.getElementById('pending-bookings-container');
        if (!container) {
            console.warn('Pending bookings container not found');
            return;
        }

        if (snapshot.empty) {
            container.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: #999;">
                    <i class="fas fa-check-circle" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                    <p>No pending bookings. All requests processed!</p>
                </div>
            `;
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const booking = doc.data();
            html += createBookingCard(doc.id, booking, 'pending');
        });

        container.innerHTML = html;
    } catch (error) {
        console.error('Error loading pending bookings:', error);
        showToast('Error loading pending bookings', 'error');
    }
}

/**
 * Create a booking card for display
 */
function createBookingCard(bookingId, booking, status) {
    const checkinDate = new Date(booking.checkin);
    const checkoutDate = new Date(booking.checkout);
    const nights = Math.round((checkoutDate - checkinDate) / 86400000);
    const pricePerNight = PROPERTY_PRICES[booking.house] || 0;
    const expectedTotal = nights * pricePerNight;

    const statusColor = STATUS_COLORS[booking.status] || '#999';
    const statusLabel = STATUS_LABELS[booking.status] || booking.status;

    return `
        <div class="booking-card" style="background: white; border: 1px solid #eee; border-radius: 8px; padding: 1.5rem; margin-bottom: 1rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; flex-wrap: wrap; gap: 1rem;">
                <div>
                    <h3 style="margin: 0 0 0.5rem; color: #333;">${booking.name}</h3>
                    <p style="margin: 0 0 0.3rem; font-size: 0.9rem; color: #666;"><strong>Email:</strong> ${booking.email}</p>
                    <p style="margin: 0; font-size: 0.9rem; color: #666;"><strong>Phone:</strong> ${booking.phone || 'N/A'}</p>
                </div>
                <div style="text-align: right;">
                    <span style="background: ${statusColor}; color: white; padding: 0.5rem 1rem; border-radius: 20px; font-weight: 600; font-size: 0.9rem;">
                        ${statusLabel}
                    </span>
                </div>
            </div>

            <div style="background: #f9f9f9; padding: 1rem; border-radius: 6px; margin-bottom: 1rem;">
                <p style="margin: 0 0 0.5rem; font-weight: 600; color: #333;">📍 ${booking.house}</p>
                <p style="margin: 0 0 0.5rem; font-size: 0.9rem; color: #666;">
                    <strong>Dates:</strong> ${booking.checkin} → ${booking.checkout} (${nights} night${nights !== 1 ? 's' : ''})
                </p>
                <p style="margin: 0 0 0.5rem; font-size: 0.9rem; color: #666;">
                    <strong>Guests:</strong> ${booking.guests || 'N/A'}
                </p>
                <p style="margin: 0; font-size: 0.9rem; color: #666;">
                    <strong>Expected Total:</strong> <span style="color: #800000; font-weight: 600;">KSh ${expectedTotal.toLocaleString()}</span> 
                    <span style="color: #999; font-size: 0.85rem;">(${nights} × KSh ${pricePerNight.toLocaleString()})</span>
                </p>
            </div>

            ${booking.requests ? `
                <div style="background: #f0f7ff; padding: 1rem; border-radius: 6px; margin-bottom: 1rem; border-left: 3px solid #2196f3;">
                    <p style="margin: 0 0 0.5rem; font-weight: 600; color: #2196f3;">🗒️ Special Requests</p>
                    <p style="margin: 0; font-size: 0.9rem; color: #333;">${booking.requests}</p>
                </div>
            ` : ''}

            ${booking.access ? `
                <div style="background: #f0f7ff; padding: 1rem; border-radius: 6px; margin-bottom: 1rem; border-left: 3px solid #2196f3;">
                    <p style="margin: 0 0 0.5rem; font-weight: 600; color: #2196f3;">🔑 Accessibility Needs</p>
                    <p style="margin: 0; font-size: 0.9rem; color: #333;">${booking.access}</p>
                </div>
            ` : ''}

            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                ${booking.status === 'pending' ? `
                    <button onclick="approveBooking('${bookingId}')" class="btn btn-sm" style="background: #4caf50; color: white; padding: 0.6rem 1.2rem; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.85rem;">
                        <i class="fas fa-check"></i> Approve
                    </button>
                    <button onclick="rejectBooking('${bookingId}')" class="btn btn-sm" style="background: #f44336; color: white; padding: 0.6rem 1.2rem; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.85rem;">
                        <i class="fas fa-times"></i> Reject
                    </button>
                ` : ''}
                ${booking.status === 'approved' ? `
                    <button onclick="openPaymentConfirmModal('${bookingId}')" class="btn btn-sm" style="background: #2196f3; color: white; padding: 0.6rem 1.2rem; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.85rem;">
                        <i class="fas fa-money-bill"></i> Confirm Payment
                    </button>
                ` : ''}
                <button onclick="viewBookingDetails('${bookingId}')" class="btn btn-sm" style="background: #673ab7; color: white; padding: 0.6rem 1.2rem; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.85rem;">
                    <i class="fas fa-eye"></i> Details
                </button>
            </div>
        </div>
    `;
}

/**
 * Approve a pending booking
 */
async function approveBooking(bookingId) {
    const reason = prompt('Add optional approval note:') || '';
    
    try {
        const updateData = {
            status: 'approved',
            approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            approvedBy: ADMIN_EMAIL,
            approvalNote: reason
        };

        await db.collection('bookings').doc(bookingId).update(updateData);

        // Get booking details for email
        const bookingDoc = await db.collection('bookings').doc(bookingId).get();
        const booking = bookingDoc.data();

        // Send approval email to guest
        if (booking.email) {
            try {
                const nights = Math.round((new Date(booking.checkout) - new Date(booking.checkin)) / 86400000);
                const price = PROPERTY_PRICES[booking.house] || 0;
                const total = nights * price;

                await emailjs.send('service_ky2kj3t', 'template_6duvs5n', {
                    to_name: booking.name,
                    to_email: booking.email,
                    from_name: 'Gonah Homes',
                    subject: 'Booking Approved - Payment Required',
                    message: `Great news! Your booking for ${booking.house} has been APPROVED!\n\n📅 Check-in: ${booking.checkin}\n📅 Check-out: ${booking.checkout}\n👥 Guests: ${booking.guests}\n\n💰 Amount to Pay: KSh ${total.toLocaleString()}\n(${nights} night${nights !== 1 ? 's' : ''} × KSh ${price.toLocaleString()}/night)\n\nPlease complete your payment to confirm the booking.\n\nThank you!`
                });
            } catch (emailErr) {
                console.warn('Could not send approval email:', emailErr.message);
            }
        }

        showToast('✅ Booking approved! Guest notified.', 'success');
        loadPendingBookings();
        updateBookingStats();
    } catch (error) {
        console.error('Error approving booking:', error);
        showToast('Error approving booking', 'error');
    }
}

/**
 * Reject a pending booking
 */
async function rejectBooking(bookingId) {
    const reason = prompt('Reason for rejection (required):');
    if (!reason || reason.trim() === '') {
        showToast('Rejection reason is required', 'error');
        return;
    }

    try {
        const updateData = {
            status: 'rejected',
            rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
            rejectedBy: ADMIN_EMAIL,
            rejectionReason: reason
        };

        await db.collection('bookings').doc(bookingId).update(updateData);

        // Get booking details for email
        const bookingDoc = await db.collection('bookings').doc(bookingId).get();
        const booking = bookingDoc.data();

        // Send rejection email to guest
        if (booking.email) {
            try {
                await emailjs.send('service_ky2kj3t', 'template_6duvs5n', {
                    to_name: booking.name,
                    to_email: booking.email,
                    from_name: 'Gonah Homes',
                    subject: 'Booking Request - Unable to Process',
                    message: `Dear ${booking.name},\n\nThank you for your interest in ${booking.house}. Unfortunately, we are unable to process your booking request at this time.\n\nReason: ${reason}\n\nWe appreciate your understanding. Please feel free to contact us if you'd like to discuss alternative dates or properties.\n\nBest regards,\nGonah Homes Team`
                });
            } catch (emailErr) {
                console.warn('Could not send rejection email:', emailErr.message);
            }
        }

        showToast('❌ Booking rejected. Guest notified.', 'success');
        loadPendingBookings();
        updateBookingStats();
    } catch (error) {
        console.error('Error rejecting booking:', error);
        showToast('Error rejecting booking', 'error');
    }
}

/**
 * Open payment confirmation modal
 */
async function openPaymentConfirmModal(bookingId) {
    try {
        const doc = await db.collection('bookings').doc(bookingId).get();
        if (!doc.exists) {
            showToast('Booking not found', 'error');
            return;
        }

        const booking = doc.data();
        const nights = Math.round((new Date(booking.checkout) - new Date(booking.checkin)) / 86400000);
        const price = PROPERTY_PRICES[booking.house] || 0;
        const total = nights * price;

        // Store booking ID in modal for submission
        const modal = document.getElementById('payment-modal');
        if (modal) {
            document.getElementById('current-booking-id').value = bookingId;
            document.getElementById('payment-modal-info').innerHTML = `
                <strong>${booking.name}</strong> - ${booking.house}<br>
                ${booking.checkin} to ${booking.checkout} (${nights} nights)<br>
                Expected Amount: <strong>KSh ${total.toLocaleString()}</strong>
            `;
            modal.classList.add('active');
        }
    } catch (error) {
        console.error('Error opening payment modal:', error);
        showToast('Error opening payment form', 'error');
    }
}

/**
 * Submit payment confirmation
 */
async function submitBookingPaymentConfirmation() {
    const bookingId = document.getElementById('current-booking-id')?.value;
    const method = document.getElementById('payment-method')?.value;
    const ref = document.getElementById('payment-ref')?.value;
    const amount = document.getElementById('payment-amount')?.value;
    const notes = document.getElementById('payment-notes')?.value || '';

    if (!bookingId || !method || !ref || !amount) {
        showToast('Please fill all required fields', 'error');
        return;
    }

    try {
        const bookingDoc = await db.collection('bookings').doc(bookingId).get();
        const booking = bookingDoc.data();

        const updateData = {
            status: 'confirmed',
            paymentMethod: method,
            paymentReference: ref,
            paymentAmount: parseFloat(amount),
            paymentNotes: notes,
            confirmedAt: firebase.firestore.FieldValue.serverTimestamp(),
            confirmedBy: ADMIN_EMAIL
        };

        await db.collection('bookings').doc(bookingId).update(updateData);

        // Send confirmation email
        if (booking.email) {
            try {
                await emailjs.send('service_ky2kj3t', 'template_6duvs5n', {
                    to_name: booking.name,
                    to_email: booking.email,
                    from_name: 'Gonah Homes',
                    subject: 'Booking Confirmed!',
                    message: `Excellent! Your booking has been confirmed and payment received.\n\n📍 Property: ${booking.house}\n📅 Check-in: ${booking.checkin}\n📅 Check-out: ${booking.checkout}\n\n💳 Payment: KSh ${amount}\nMethod: ${method}\nRef: ${ref}\n\nWe look forward to hosting you!\n\nBest regards,\nGonah Homes Team`
                });
            } catch (emailErr) {
                console.warn('Could not send confirmation email:', emailErr.message);
            }
        }

        showToast('✅ Booking confirmed! Confirmation email sent.', 'success');
        closePaymentModal();
        loadPendingBookings();
        updateBookingStats();
    } catch (error) {
        console.error('Error confirming payment:', error);
        showToast('Error confirming payment', 'error');
    }
}

/**
 * View detailed booking information
 */
async function viewBookingDetails(bookingId) {
    try {
        const doc = await db.collection('bookings').doc(bookingId).get();
        if (!doc.exists) {
            showToast('Booking not found', 'error');
            return;
        }

        const booking = doc.data();
        const checkinDate = new Date(booking.checkin);
        const checkoutDate = new Date(booking.checkout);
        const nights = Math.round((checkoutDate - checkinDate) / 86400000);
        const price = PROPERTY_PRICES[booking.house] || 0;
        const total = nights * price;

        const detailsHtml = `
            <div style="padding: 2rem; background: white;">
                <h2 style="margin-top: 0; color: #800000;">Booking Details - ${bookingId}</h2>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin: 2rem 0;">
                    <div>
                        <h4 style="color: #666; margin-top: 0;">👤 Guest Information</h4>
                        <p><strong>Name:</strong> ${booking.name}</p>
                        <p><strong>Email:</strong> ${booking.email}</p>
                        <p><strong>Phone:</strong> ${booking.phone || 'N/A'}</p>
                    </div>
                    
                    <div>
                        <h4 style="color: #666; margin-top: 0;">📋 Booking Details</h4>
                        <p><strong>Status:</strong> <span style="background: ${STATUS_COLORS[booking.status]}; color: white; padding: 0.3rem 0.8rem; border-radius: 4px;">${STATUS_LABELS[booking.status]}</span></p>
                        <p><strong>Property:</strong> ${booking.house}</p>
                        <p><strong>Check-in:</strong> ${booking.checkin}</p>
                        <p><strong>Check-out:</strong> ${booking.checkout}</p>
                    </div>
                </div>

                <div style="background: #f9f9f9; padding: 1.5rem; border-radius: 8px; margin: 2rem 0;">
                    <h4 style="margin-top: 0; color: #333;">💰 Price Breakdown</h4>
                    <p><strong>Nights:</strong> ${nights}</p>
                    <p><strong>Price per Night:</strong> KSh ${price.toLocaleString()}</p>
                    <p style="border-top: 1px solid #ddd; padding-top: 1rem; margin-top: 1rem;">
                        <strong style="font-size: 1.2rem; color: #800000;">Total: KSh ${total.toLocaleString()}</strong>
                    </p>
                </div>

                ${booking.requests ? `
                    <div style="background: #e3f2fd; padding: 1.5rem; border-radius: 8px; margin: 2rem 0; border-left: 4px solid #2196f3;">
                        <h4 style="margin-top: 0; color: #1976d2;">🗒️ Special Requests</h4>
                        <p style="margin: 0;">${booking.requests}</p>
                    </div>
                ` : ''}

                ${booking.access ? `
                    <div style="background: #e3f2fd; padding: 1.5rem; border-radius: 8px; margin: 2rem 0; border-left: 4px solid #2196f3;">
                        <h4 style="margin-top: 0; color: #1976d2;">♿ Accessibility Needs</h4>
                        <p style="margin: 0;">${booking.access}</p>
                    </div>
                ` : ''}

                ${booking.confirmedAt ? `
                    <div style="background: #e8f5e9; padding: 1rem; border-radius: 8px; margin: 1rem 0; border-left: 4px solid #4caf50;">
                        <p style="margin: 0; font-size: 0.9rem;">
                            <strong>✅ Payment Confirmed:</strong> ${new Date(booking.confirmedAt.toDate()).toLocaleString()}<br>
                            Method: ${booking.paymentMethod} | Amount: KSh ${booking.paymentAmount?.toLocaleString() || 'N/A'}
                        </p>
                    </div>
                ` : ''}

                ${booking.approvedAt ? `
                    <div style="background: #e8f5e9; padding: 1rem; border-radius: 8px; margin: 1rem 0; border-left: 4px solid #4caf50;">
                        <p style="margin: 0; font-size: 0.9rem;">
                            <strong>✅ Approved:</strong> ${new Date(booking.approvedAt.toDate()).toLocaleString()}
                            ${booking.approvalNote ? `<br>Note: ${booking.approvalNote}` : ''}
                        </p>
                    </div>
                ` : ''}

                ${booking.rejectedAt ? `
                    <div style="background: #ffebee; padding: 1rem; border-radius: 8px; margin: 1rem 0; border-left: 4px solid #f44336;">
                        <p style="margin: 0; font-size: 0.9rem;">
                            <strong>❌ Rejected:</strong> ${new Date(booking.rejectedAt.toDate()).toLocaleString()}<br>
                            Reason: ${booking.rejectionReason}
                        </p>
                    </div>
                ` : ''}
            </div>
        `;

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';
        modal.innerHTML = `
            <div style="background: white; border-radius: 14px; max-width: 800px; max-height: 90vh; overflow-y: auto; width: 90%;">
                <div style="position: sticky; top: 0; background: white; padding: 1rem; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; z-index: 1;">
                    <h3 style="margin: 0;">Booking Details</h3>
                    <button onclick="this.closest('.modal').remove()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #666;">&times;</button>
                </div>
                <div style="overflow-y: auto; max-height: calc(90vh - 60px);">
                    ${detailsHtml}
                </div>
            </div>
        `;
        document.body.appendChild(modal);

    } catch (error) {
        console.error('Error viewing booking details:', error);
        showToast('Error loading booking details', 'error');
    }
}

/**
 * Update booking statistics on dashboard
 */
async function updateBookingStats() {
    try {
        const snapshot = await db.collection('bookings').get();
        
        const stats = {
            pending: 0,
            approved: 0,
            rejected: 0,
            confirmed: 0,
            completed: 0,
            cancelled: 0
        };

        snapshot.forEach(doc => {
            const booking = doc.data();
            if (booking.status === 'pending') stats.pending++;
            else if (booking.status === 'approved') stats.approved++;
            else if (booking.status === 'rejected') stats.rejected++;
            else if (booking.status === 'confirmed') stats.confirmed++;
            else if (booking.status === 'completed') stats.completed++;
            else if (booking.status === 'cancelled') stats.cancelled++;
        });

        // Update dashboard displays
        const pending = document.getElementById('stat-pending');
        const approved = document.getElementById('stat-approved');
        const confirmed = document.getElementById('stat-confirmed');
        const completed = document.getElementById('stat-completed');
        
        if (pending) pending.textContent = stats.pending;
        if (approved) approved.textContent = stats.approved;
        if (confirmed) confirmed.textContent = stats.confirmed;
        if (completed) completed.textContent = stats.completed;

        return stats;
    } catch (error) {
        console.error('Error getting booking stats:', error);
        return null;
    }
}

/**
 * Initialize booking workflow when dashboard loads
 */
function initializeBookingWorkflow() {
    // Load pending bookings
    loadPendingBookings();
    
    // Update stats
    updateBookingStats();
    
    // Refresh every 60 seconds
    setInterval(() => {
        updateBookingStats();
    }, 60000);
}

console.log('✅ Booking Workflow Module loaded successfully!');