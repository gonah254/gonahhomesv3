// Auth Logic
if (typeof auth === 'undefined') {
    var auth = firebase.auth();
}
if (typeof db === 'undefined') {
    var db = firebase.firestore();
}
if (typeof storage === 'undefined') {
    var storage = firebase.storage();
}

const authModal = document.getElementById('auth-modal');
const authForm = document.getElementById('auth-form');

function openAuthModal() {
    if (authModal) {
        authModal.style.display = 'flex';
        authModal.classList.add('active');
    }
}

function closeAuthModal() {
    if (authModal) {
        authModal.style.display = 'none';
        authModal.classList.remove('active');
    }
}

// Immediately show login modal on account page if not already logged in
(function() {
    const bookingUser = JSON.parse(localStorage.getItem('booking_code_user') || 'null');
    if (!bookingUser && authModal) {
        openAuthModal();
    }
})();

if (authForm) {
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email').value.trim();
        const bookingId = document.getElementById('auth-booking-id').value.trim();

        if (!email || !bookingId) {
            alert("Please enter both your Email and Booking ID.");
            return;
        }

        try {
            const bookingSnapshot = await db.collection('bookings')
                .where('email', '==', email)
                .where('id', '==', bookingId)
                .get();
            
            if (bookingSnapshot.empty) {
                throw new Error("Invalid Booking ID or Email. Please check your details.");
            }
            
            const b = bookingSnapshot.docs[0].data();
            localStorage.setItem('booking_code_user', JSON.stringify({ 
                name: b.name, 
                email: b.email, 
                code: bookingId 
            }));
            window.location.reload();
        } catch (error) {
            alert(error.message);
        }
    });
}

auth.onAuthStateChanged(async (user) => {
    const authBtns = document.querySelectorAll('#auth-btn');
    const dashboardContent = document.getElementById('dashboard-content');
    const bookingUser = JSON.parse(localStorage.getItem('booking_code_user') || 'null');
    
    if (user || bookingUser) {
        const userData = user ? { name: user.displayName || 'User', email: user.email } : bookingUser;
        
        authBtns.forEach(btn => {
            btn.style.display = 'inline-block';
            btn.textContent = 'Logout';
            btn.onclick = (e) => {
                e.preventDefault();
                localStorage.removeItem('booking_code_user');
                auth.signOut().then(() => {
                window.location.href = 'index.html';
                });
            };
        });
        if (dashboardContent) dashboardContent.style.display = 'block';
        if (document.getElementById('user-name-display')) {
            document.getElementById('user-name-display').textContent = `Welcome, ${userData.name}`;
        }
        if (document.getElementById('user-email-display')) {
            document.getElementById('user-email-display').textContent = userData.email;
        }
        if (authModal) authModal.style.display = 'none';
    } else {
        authBtns.forEach(btn => {
            btn.style.display = 'inline-block';
            btn.textContent = 'My Account';
            btn.onclick = (e) => {
                e.preventDefault();
                openAuthModal();
            };
        });
        if (dashboardContent) dashboardContent.style.display = 'none';
        // On account page, auto-open the login modal if not logged in
        if (authModal) openAuthModal();
    }
});

// End of auth logic
