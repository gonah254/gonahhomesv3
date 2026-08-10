
async function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
    document.querySelectorAll('.account-nav-tab').forEach(tab => tab.classList.remove('active'));
    document.getElementById(`${tabName}-tab`).style.display = 'block';
    event.currentTarget.classList.add('active');
}

async function loadBookings() {
    // Determine which identifier to use (email for booking code users, uid for Firebase Auth users)
    const bookingUser = JSON.parse(sessionStorage.getItem('booking_code_user') || 'null');
    const user = auth.currentUser;
    
    let query;
    if (bookingUser) {
        query = db.collection('bookings').where('email', '==', bookingUser.email);
    } else if (user) {
        query = db.collection('bookings').where('email', '==', user.email);
    } else {
        return;
    }

    const snapshot = await query.get();
    const activeDiv = document.getElementById('active-bookings');
    const pastDiv = document.getElementById('past-bookings');
    
    if (activeDiv) activeDiv.innerHTML = '<h3>Active Bookings</h3>';
    if (pastDiv) pastDiv.innerHTML = '<h3>Past Bookings</h3>';

    if (snapshot.empty) {
        if (activeDiv) activeDiv.innerHTML += '<p>No active bookings found.</p>';
        return;
    }

    snapshot.forEach(doc => {
        const booking = doc.data();
        const bookingCard = createBookingCard(booking, doc.id);
        const checkin = new Date(booking.checkin);
        if (checkin > new Date()) {
            if (activeDiv) {
                activeDiv.appendChild(bookingCard);
                startCountdown(booking.checkin, doc.id);
            }
        } else {
            if (pastDiv) pastDiv.appendChild(bookingCard);
        }
    });
}

function createBookingCard(booking, id) {
    const card = document.createElement('div');
    card.className = 'booking-card';
    card.innerHTML = `
        <div class="booking-header">
            <h4>${booking.house}</h4>
            <span class="status-badge status-${booking.status}">${booking.status.toUpperCase()}</span>
        </div>
        <p>Check-in: ${booking.checkin}</p>
        <p>Check-out: ${booking.checkout}</p>
        <div id="countdown-${id}" class="countdown-timer"></div>
        <div class="booking-actions">
            <button onclick="downloadReceipt('${id}')" class="btn btn-outline btn-sm">Download Receipt</button>
            ${booking.status !== 'cancelled' ? `<button onclick="cancelBooking('${id}')" class="btn btn-danger btn-sm">Cancel</button>` : ''}
        </div>
    `;
    return card;
}

function startCountdown(checkinDate, id) {
    const countdownEl = document.getElementById(`countdown-${id}`);
    const target = new Date(checkinDate).getTime();

    const interval = setInterval(() => {
        const now = new Date().getTime();
        const diff = target - now;

        if (diff < 0) {
            clearInterval(interval);
            countdownEl.innerHTML = "It's Check-in Day!";
            return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        countdownEl.innerHTML = `Check-in in: ${days}d ${hours}h ${mins}m`;
    }, 60000);
}

async function cancelBooking(id) {
    if (confirm('Are you sure you want to cancel this booking?')) {
        await db.collection('bookings').doc(id).update({ status: 'cancelled' });
        loadBookings();
    }
}

function downloadReceipt(id) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text("Gonah Homes Receipt", 10, 10);
    doc.text(`Booking ID: ${id}`, 10, 20);
    doc.save(`receipt-${id}.pdf`);
}

// Service Requests
document.getElementById('service-request-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = document.getElementById('request-type').value;
    const details = document.getElementById('request-details').value;
    
    const bookingUser = JSON.parse(sessionStorage.getItem('booking_code_user') || 'null');
    const user = auth.currentUser;
    
    const email = bookingUser ? bookingUser.email : (user ? user.email : 'unknown');
    const id = bookingUser ? 'booking_' + bookingUser.code : (user ? user.uid : 'unknown');

    await db.collection('service_requests').add({
        userId: id,
        userEmail: email,
        type,
        details,
        status: 'pending',
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert('Request submitted successfully!');
});

// Document Upload
document.getElementById('upload-id-btn').addEventListener('click', async () => {
    const file = document.getElementById('id-upload').files[0];
    if (!file) return;

    const bookingUser = JSON.parse(sessionStorage.getItem('booking_code_user') || 'null');
    const user = auth.currentUser;
    
    const id = bookingUser ? 'booking_' + bookingUser.code : (user ? user.uid : 'unknown');

    const storageRef = storage.ref(`documents/${id}/${file.name}`);
    await storageRef.put(file);
    const url = await storageRef.getDownloadURL();

    await db.collection('users').doc(id).collection('documents').add({
        name: file.name,
        url,
        uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert('Document uploaded!');
});

auth.onAuthStateChanged(user => {
    loadBookings();
});
// Initial load for booking code users
if (sessionStorage.getItem('booking_code_user')) {
    loadBookings();
}

