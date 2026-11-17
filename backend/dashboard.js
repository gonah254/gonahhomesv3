
// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyABTVp797tNu353FBVLzsOp90aIX2mNF74",
  authDomain: "my-website-project2797.firebaseapp.com",
  projectId: "my-website-project2797",
  storageBucket: "my-website-project2797.firebasestorage.app",
  messagingSenderId: "406226552922",
  appId: "1:406226552922:web:ffdf2ccf6f77a57964b063"
};

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();

// EmailJS Configuration
const emailConfig = {
  serviceId: 'service_ky2kj3t',
  adminTemplate: 'template_24gjzd3',
  clientTemplate: 'template_6duvs5n',
  publicKey: 'VgDakmh3WscKrr_wQ'
};

// Initialize EmailJS
emailjs.init(emailConfig.publicKey);

// Dedicated inboxes for public inquiries, bookings, administration, and support.
const EMAIL_ADDRESSES = {
  info: 'info@gonahhomes.com',
  bookings: 'bookings@gonahhomes.com',
  admin: 'admin@gonahhomes.com',
  support: 'support@gonahhomes.com'
};

// This is the Firebase Auth account that owns staff management. It is
// intentionally separate from admin@gonahhomes.com, which is only an
// email-routing alias for notifications.
const ADMIN_EMAIL = 'gonahhomes0@gmail.com';

function isPrimaryAdminEmail(email) {
  return email?.trim().toLowerCase() === ADMIN_EMAIL;
}

// Global variables
let currentSection = 'overview';
let notifications = [];
let charts = {};
let currentAdminRole = null;
let dashboardInitialized = false;
let realtimeListenerReady = {
  bookings: false,
  messages: false,
  reviews: false,
  serviceRequests: false,
  adminNotifications: false
};
let realtimeUnsubscribers = [];
let realtimeSessionStartedAt = 0;
const adminDocumentCache = new Map();
const adminBookingCache = new Map();
let activeRecordDetail = null;

// ---- Admin Authentication (Firebase Auth) ----
async function authorizeDashboardUser(user) {
  if (!user) throw new Error('No authenticated user.');

  await user.reload();

  if (!user.emailVerified) {
    throw new Error('Email verification is required before dashboard access.');
  }

  await user.getIdToken(true);

  if (isPrimaryAdminEmail(user.email)) {
    currentAdminRole = 'primary_admin';
    return currentAdminRole;
  }

  const staffDoc = await db.collection('staff_accounts').doc(user.uid).get();

  if (!staffDoc.exists) {
    throw new Error('No staff access record found.');
  }

  const staff = staffDoc.data() || {};

  if (staff.active !== true) {
    throw new Error('This staff account is inactive.');
  }

  if (typeof staff.role !== 'string' || !staff.role.trim()) {
    throw new Error('Staff account has no valid role.');
  }

  currentAdminRole = staff.role.trim().toLowerCase();
  return currentAdminRole;
}

async function login(email, password) {
  const loginBtn = document.querySelector('#login-form button[type="submit"]');

  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
  }

  try {
    const result = await firebase.auth().signInWithEmailAndPassword(email, password);

    try {
      await authorizeDashboardUser(result.user);
    } catch (authError) {
      await firebase.auth().signOut();
      currentAdminRole = null;
      showToast(authError.message || 'Access denied.', 'error');
      return false;
    }

    document.getElementById('login-modal').classList.remove('active');
    document.getElementById('dashboard').classList.remove('hidden');

    if (!dashboardInitialized) {
      initializeDashboard();
      dashboardInitialized = true;
    }

    return true;
  } catch (error) {
    const msgs = {
      'auth/user-not-found': 'No account found with that email.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/invalid-email': 'Invalid email address.',
      'auth/too-many-requests': 'Too many sign-in attempts — try again later.',
      'auth/invalid-credential': 'Invalid email or password.'
    };

    console.error('Dashboard login error:', error);
    showToast((msgs[error.code] || 'Login failed') + ' (' +
      (error.code || 'unknown-error') + '): ' +
      (error.message || 'No details'), 'error');
    return false;
  } finally {
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
    }
  }
}

function checkLoginStatus() {
  firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) {
      currentAdminRole = null;
      dashboardInitialized = false;
      document.getElementById('login-modal')?.classList.add('active');
      document.getElementById('dashboard')?.classList.add('hidden');
      return;
    }

    try {
      await authorizeDashboardUser(user);

      document.getElementById('login-modal')?.classList.remove('active');
      document.getElementById('dashboard')?.classList.remove('hidden');

      if (!dashboardInitialized) {
        initializeDashboard();
        dashboardInitialized = true;
      }
    } catch (error) {
      console.error('Dashboard session authorization failed:', error);
      currentAdminRole = null;
      dashboardInitialized = false;

      document.getElementById('login-modal')?.classList.add('active');
      document.getElementById('dashboard')?.classList.add('hidden');

      try {
        await firebase.auth().signOut();
      } catch (signOutError) {
        console.error('Could not clear unauthorized session:', signOutError);
      }

      showToast(error.message || 'Dashboard access denied.', 'error');
    }
  });
}

checkLoginStatus();

function logout() {
  stopRealTimeListeners();
  firebase.auth().signOut().then(() => {
    currentAdminRole = null;
    dashboardInitialized = false;
    document.getElementById('login-modal').classList.add('active');
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('login-form').reset();
  }).catch(error => {
    console.error('Logout failed:', error);
    showToast('Logout failed. Please try again.', 'error');
  });
}


// Reports & Data Export
function exportBookingsToCSV() {
  db.collection('bookings').get().then(snapshot => {
    let csv = 'ID,Guest,Property,Checkin,Checkout,Status,Total\n';
    snapshot.forEach(doc => {
      const b = doc.data();
      csv += `${doc.id},${b.name},${b.house},${b.checkin},${b.checkout},${b.status},${b.total || 0}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', 'bookings.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });
}

// Initialize Dashboard
const ROLE_SECTION_ACCESS = {
  primary_admin: ['*'],
  admin: [
    'overview', 'bookings', 'documents', 'messages', 'service-requests',
    'reviews', 'analytics', 'announcements', 'clients', 'properties', 'settings', 'activity-log'
  ],
  accountant: ['overview', 'bookings', 'analytics', 'clients'],
  manager: [
    'overview', 'bookings', 'documents', 'messages', 'service-requests',
    'reviews', 'analytics', 'announcements', 'clients', 'properties', 'settings'
  ],
  receptionist: [
    'overview', 'bookings', 'documents', 'messages', 'service-requests', 'clients'
  ]
};

function canAccessSection(sectionName) {
  const allowed = ROLE_SECTION_ACCESS[currentAdminRole];
  return Array.isArray(allowed) &&
    (allowed.includes('*') || allowed.includes(sectionName));
}

function applyRoleRestrictions() {
  document.querySelectorAll('.nav-link[data-section]').forEach(link => {
    link.style.display = canAccessSection(link.dataset.section) ? '' : 'none';
  });
}

function initializeDashboard() {
  // Add Export Button
  const header = document.querySelector('.header-actions');
  if (header && !document.getElementById('export-btn')) {
    const btn = document.createElement('button');
    btn.id = 'export-btn';
    btn.className = 'btn btn-outline btn-sm';
    btn.innerHTML = '<i class="fas fa-file-export"></i> Export CSV';
    btn.style.marginRight = '10px';
    btn.onclick = exportBookingsToCSV;
    header.prepend(btn);
  }
  applyRoleRestrictions();
  loadStats();
  loadBookings();
  loadMessages();
  loadServiceRequests();
  loadReviews();
  loadIdDocuments();
  loadAnnouncements();
  loadClients();
  setupRealTimeListeners();
  initializeCharts();
  loadNotifications();
}

function stopRealTimeListeners() {
  realtimeUnsubscribers.forEach(unsubscribe => {
    try { unsubscribe(); } catch (_) {}
  });
  realtimeUnsubscribers = [];
  realtimeListenerReady = {
    bookings: false,
    messages: false,
    reviews: false,
    serviceRequests: false,
    adminNotifications: false
  };
  notifications = [];
  updateNotificationCount();
  updateNotificationList();
}

// Real-time listeners
function setupRealTimeListeners() {
  stopRealTimeListeners();
  realtimeSessionStartedAt = Date.now();
  realtimeUnsubscribers.push(db.collection('bookings').orderBy('timestamp', 'desc').onSnapshot(snapshot => {
    const isInitialSnapshot = !realtimeListenerReady.bookings;
    realtimeListenerReady.bookings = true;
    snapshot.docChanges().forEach(change => {
      if (!isInitialSnapshot && change.type === 'added') {
        const booking = change.doc.data();
        addNotification('booking', `New booking from ${booking.name || 'guest'} for ${booking.house || 'a property'}.`, booking);
      }
    });
    loadBookings(); // Force full reload on any change
    updateStats();
  }));

  // Listen for new messages
  realtimeUnsubscribers.push(db.collection('messages').onSnapshot(snapshot => {
    const isInitialSnapshot = !realtimeListenerReady.messages;
    realtimeListenerReady.messages = true;
    snapshot.docChanges().forEach(change => {
      if (!isInitialSnapshot && change.type === 'added') {
        const message = change.doc.data();
        addNotification('message', `New message from ${message.name || 'guest'}: ${(message.message || '').substring(0, 50)}...`, message);
      }
    });
    loadMessages();
    updateStats();
  }));

  // Listen for new reviews
  realtimeUnsubscribers.push(db.collection('reviews').onSnapshot(snapshot => {
    const isInitialSnapshot = !realtimeListenerReady.reviews;
    realtimeListenerReady.reviews = true;
    snapshot.docChanges().forEach(change => {
      if (!isInitialSnapshot && change.type === 'added') {
        const review = change.doc.data();
        addNotification('review', `New ${review.rating || 5}-star review: ${(review.review || '').substring(0, 50)}...`, review);
      }
    });
    loadReviews();
    updateStats();
  }));

  // Listen for new service requests
  realtimeUnsubscribers.push(db.collection('service_requests').onSnapshot(snapshot => {
    const isInitialSnapshot = !realtimeListenerReady.serviceRequests;
    realtimeListenerReady.serviceRequests = true;
    snapshot.docChanges().forEach(change => {
      if (!isInitialSnapshot && change.type === 'added') {
        const req = change.doc.data();
        addNotification('service', `New service request: ${req.type} from ${req.userEmail || req.userId}`, req);
      }
    });
    loadServiceRequests();
    updateStats();
  }));

  // Persisted admin notifications are also streamed, but the first snapshot
  // is deliberately ignored so old notifications never appear as new at login.
  realtimeUnsubscribers.push(db.collection('admin_notifications').onSnapshot(snapshot => {
    const isInitialSnapshot = !realtimeListenerReady.adminNotifications;
    realtimeListenerReady.adminNotifications = true;
    snapshot.docChanges().forEach(change => {
      if (!isInitialSnapshot && change.type === 'added') {
        const item = change.doc.data();
        addNotification(item.type || 'admin', item.message || 'New dashboard notification.', item);
      }
    });
  }));
}

// Email notifications - Fixed to send only once
const sentNotifications = new Set();

async function sendEmailNotification(type, data) {
  const notificationKey = `${type}_${data.timestamp?.seconds || Date.now()}`;
  
  if (sentNotifications.has(notificationKey)) {
    return; // Already sent
  }
  
  sentNotifications.add(notificationKey);
  
  try {
    switch(type) {
      case 'booking':
        await emailjs.send(emailConfig.serviceId, emailConfig.adminTemplate, {
          to_name: "Admin",
           to_email: EMAIL_ADDRESSES.bookings,
          from_name: data.name,
          from_email: data.email || '',
          phone: data.phone || '',
          house: data.house,
          guests: data.guests,
          checkin: data.checkin,
          checkout: data.checkout,
          requests: data.requests || '',
          access: data.access || '',
          message: `New booking request from ${data.name} for ${data.house}. Check-in: ${data.checkin}, Check-out: ${data.checkout}, Guests: ${data.guests}`,
          subject: "New Booking Request"
        });
        
        // Send confirmation to client
        if (data.email) {
          await emailjs.send(emailConfig.serviceId, emailConfig.clientTemplate, {
            to_name: data.name,
            to_email: data.email,
            from_name: "Gonah Homes",
            subject: "Booking Confirmation",
            message: `Thank you ${data.name} for your booking request! Property: ${data.house}, Check-in: ${data.checkin}, Check-out: ${data.checkout}, Guests: ${data.guests}. We will contact you shortly for confirmation. Paybill 247247, Account No 466999 (Gonah Nexus)`
          });
        }
        break;
        
      case 'message':
        await emailjs.send(emailConfig.serviceId, emailConfig.adminTemplate, {
          to_name: "Admin",
          to_email: EMAIL_ADDRESSES.info,
          from_name: data.name,
          from_email: data.email || '',
          phone: '',
          house: 'Contact Form',
          guests: '',
          checkin: '',
          checkout: '',
          requests: data.message,
          access: '',
          message: `New contact message from ${data.name} (${data.email}): ${data.message}`,
          subject: "New Contact Message"
        });
        break;
        
      case 'review':
        await emailjs.send(emailConfig.serviceId, emailConfig.adminTemplate, {
          to_name: "Admin",
           to_email: EMAIL_ADDRESSES.admin,
          from_name: data.user?.name || 'Anonymous',
           from_email: data.user?.email || EMAIL_ADDRESSES.info,
          phone: '',
          house: '',
          guests: '',
          checkin: '',
          checkout: '',
          requests: data.review,
          access: '',
          message: `New ${data.rating}-star review: ${data.review}`,
          subject: "New Review Received"
        });
        break;
    }
    showToast('Notification sent successfully', 'success');
  } catch (error) {
    console.error('Error sending email notification:', error);
    showToast('Failed to send notification', 'error');
  }
}

// Load statistics
async function loadStats() {
  try {
    const [bookingsSnap, messagesSnap, reviewsSnap, serviceSnap] = await Promise.all([
      db.collection('bookings').get(),
      db.collection('messages').get(),
      db.collection('reviews').get(),
      db.collection('service_requests').get()
    ]);

    const totalBookings = bookingsSnap.size;
    const unreadMessages = messagesSnap.docs.filter(doc => doc.data().status === 'new').length;
    const pendingServices = serviceSnap.docs.filter(doc => doc.data().status === 'pending').length;
    const avgRating = reviewsSnap.docs.reduce((sum, doc) => sum + (parseFloat(doc.data().rating) || 0), 0) / reviewsSnap.size || 5.0;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const totalRevenue = bookingsSnap.docs.reduce((sum, doc) => {
      const booking = doc.data();
      if (String(booking.status || '').toLowerCase() !== 'confirmed') return sum;

      const confirmedAt = booking.confirmedAt?.toDate
        ? booking.confirmedAt.toDate()
        : new Date(booking.confirmedAt);

      if (isNaN(confirmedAt) || confirmedAt < monthStart || confirmedAt >= nextMonthStart) return sum;

      const amountPaid = Number(booking.amountPaid);
      return sum + (Number.isFinite(amountPaid) && amountPaid > 0 ? amountPaid : 0);
    }, 0);

    document.getElementById('total-bookings').textContent = totalBookings;
    document.getElementById('unread-messages').textContent = unreadMessages;
    document.getElementById('avg-rating').textContent = avgRating.toFixed(1);
    document.getElementById('monthly-revenue').textContent = `KSh ${totalRevenue.toLocaleString()}`;
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

// Load bookings
async function markBookingAsTestData(docId) {
  if (currentAdminRole !== 'primary_admin') {
    alert('Only the Primary Admin can mark bookings as test data.');
    return;
  }

  const booking = adminBookingCache.get(docId);
  if (!booking) {
    alert('Booking details are unavailable. Reload the bookings and try again.');
    return;
  }

  const status = String(booking.status || 'pending').toLowerCase();
  if (['confirmed', 'completed'].includes(status)) {
    alert('Confirmed and completed bookings cannot be marked as test data.');
    return;
  }
  if (booking.testData === true) {
    alert('This booking is already marked as test data.');
    return;
  }

  const displayedId = String(booking.id || docId.substring(0, 8));
  const reason = prompt(
    'MARK BOOKING AS TEST DATA\n\n' +
    'Guest: ' + (booking.name || 'N/A') + '\n' +
    'Booking ID: ' + displayedId + '\n\n' +
    'Explain why this booking and its linked payment/receipt records are test data:'
  );

  if (reason === null) return;
  if (reason.trim().length < 5 || reason.trim().length > 500) {
    alert('Please provide a reason between 5 and 500 characters. Nothing was changed.');
    return;
  }

  const typedId = prompt(
    'Confirm the booking you are classifying.\n\n' +
    'Type this booking ID exactly:\n' + displayedId
  );

  if (typedId === null) return;
  if (typedId.trim() !== displayedId) {
    alert('Booking ID did not match. Nothing was changed.');
    return;
  }

  try {
    const markBooking = firebase.functions().httpsCallable('markBookingAsTestDataSecure');
    const result = await markBooking({
      bookingDocId: docId,
      typedBookingId: typedId.trim(),
      reason: reason.trim()
    });

    const data = result.data || {};
    alert(
      'Booking marked as test data.\n\n' +
      'Linked payment records: ' + Number(data.linkedPaymentCount || 0) + '\n' +
      'Linked receipt records: ' + Number(data.linkedReceiptCount || 0) +
      '\n\nReloading bookings.'
    );
    await loadBookings();
  } catch (error) {
    console.error('Mark booking as test data failed:', error);
    alert('Booking was not classified.\n\n' + (error.message || 'The server rejected the request.'));
  }
}

async function deleteTestBooking(docId) {
  if (currentAdminRole !== 'primary_admin') {
    alert('Only the Primary Admin can permanently delete bookings.');
    return;
  }

  const booking = adminBookingCache.get(docId);
  if (!booking) {
    alert('Booking details are unavailable. Reload the bookings and try again.');
    return;
  }

  if (booking.testData !== true) {
    alert('Mark this booking as test data first. Deletion is blocked until the Primary Admin completes that step.');
    return;
  }

  const displayedId = String(booking.id || docId.substring(0, 8));
  const guest = booking.name || 'N/A';
  const dates = (booking.checkin || 'N/A') + ' to ' + (booking.checkout || 'N/A');

  const reason = prompt(
    'Why are you deleting this booking?\n\n' +
    'Guest: ' + guest + '\n' +
    'Booking ID: ' + displayedId + '\n\n' +
    'Enter a reason (at least 5 characters):'
  );

  if (reason === null) return;
  if (reason.trim().length < 5) {
    alert('Please provide a deletion reason of at least 5 characters. Nothing was deleted.');
    return;
  }

  const typedId = prompt(
    'PERMANENTLY DELETE THIS BOOKING?\n\n' +
    'Guest: ' + guest + '\n' +
    'Booking ID: ' + displayedId + '\n' +
    'Dates: ' + dates + '\n' +
    'Status: ' + String(booking.status || 'pending').toUpperCase() + '\n\n' +
    'This cannot be undone. Type the booking ID exactly to continue:'
  );

  if (typedId === null) return;
  if (typedId.trim() !== displayedId) {
    alert('Booking ID did not match. Nothing was deleted.');
    return;
  }

  try {
    const deleteBooking = firebase.functions().httpsCallable('deleteBookingSecure');
    await deleteBooking({
      bookingDocId: docId,
      typedBookingId: typedId.trim(),
      reason: reason.trim()
    });

    adminBookingCache.delete(docId);
    alert('Booking deleted and recorded in the activity log.');
    await loadBookings();
  } catch (error) {
    console.error('Secure booking deletion failed:', error);
    alert('Booking was not deleted.\n\n' + (error.message || 'The server rejected the request.'));
  }
}

async function loadBookings() {
  try {
    const bookingsTable = document.getElementById('bookings-table');
    if (!bookingsTable) {
        console.error('Bookings table element not found');
        return;
    }
    
    // Use a simpler query first to verify data exists
    const snapshot = await db.collection('bookings').get();
    bookingsTable.innerHTML = '';

    if (snapshot.empty) {
        bookingsTable.innerHTML = '<tr><td colspan="8" style="text-align:center;">No bookings found in database</td></tr>';
        return;
    }

    snapshot.docs.sort((a, b) => (b.data().timestamp?.seconds || 0) - (a.data().timestamp?.seconds || 0)).forEach(doc => {
      const booking = doc.data();
      const bookingId = booking.id || doc.id.substring(0, 8);
      adminBookingCache.set(doc.id, booking);
      const row = document.createElement('tr');
      row.innerHTML = `
        <td data-label="BOOKING ID" style="font-family:monospace;font-size:0.82rem;">${bookingId}</td>
        <td data-label="GUEST">
          <strong>${booking.name || 'N/A'}</strong><br>
          <small>${booking.email || ''}</small><br>
          <small>${booking.phone || ''}</small>
        </td>
        <td data-label="PROPERTY">${booking.house || 'N/A'}</td>
        <td data-label="CHECK-IN">${booking.checkin || 'N/A'}</td>
        <td data-label="CHECK-OUT">${booking.checkout || 'N/A'}</td>
        <td data-label="STATUS">
          <span class="status status-${booking.status || 'pending'}">${(booking.status || 'pending').toUpperCase()}</span>
          ${booking.paymentMethod ? `<br><small style="color:#2e7d32;font-size:0.75rem;"><i class="fas fa-check-circle"></i> ${booking.paymentMethod} · ${booking.transactionRef || ''}</small>` : ''}
          ${booking.cancellationReason ? `<br><small style="color:#c62828;font-size:0.75rem;" title="${booking.cancellationReason}"><i class="fas fa-times-circle"></i> ${booking.cancellationReason.substring(0,35)}${booking.cancellationReason.length>35?'...':''}</small>` : ''}
        </td>
        <td data-label="DOCUMENTS"><button class="btn btn-sm btn-outline" onclick="viewUserDocs('${bookingId}')"><i class="fas fa-id-card"></i> View IDs</button></td>
        <td data-label="ACTIONS" class="booking-actions-cell"><div class="booking-actions-grid">
          ${booking.status === 'confirmed' || booking.status === 'completed' ? `<button class="btn btn-outline btn-sm" onclick="receiptDownloadAdmin('${doc.id}')"><i class="fas fa-file-download"></i> Receipt</button><button class="btn btn-outline btn-sm" onclick="receiptWhatsAppAdmin('${doc.id}')"><i class="fab fa-whatsapp"></i> WhatsApp</button><button class="btn btn-outline btn-sm" onclick="receiptInAppAdmin('${doc.id}')"><i class="fas fa-bell"></i> In-app</button>` : ''}
          <button class="btn btn-outline btn-sm" onclick="openBookingDetails('${doc.id}')"><i class="fas fa-eye"></i> View</button>
          ${currentAdminRole === 'primary_admin' && !['confirmed', 'completed'].includes(String(booking.status || 'pending').toLowerCase()) ? (booking.testData === true ? `<span class="status status-approved" title="Marked by ${escapeDashboardHtml(booking.testDataMarkedBy || 'Primary Admin')}">TEST DATA</span><button class="btn btn-danger btn-sm" onclick="deleteTestBooking('${doc.id}')"><i class="fas fa-trash"></i> Delete</button>` : `<button class="btn btn-outline btn-sm" onclick="markBookingAsTestData('${doc.id}')"><i class="fas fa-flask"></i> Mark as Test Data</button>`) : ''}
          ${booking.status !== 'confirmed' && booking.status !== 'cancelled' && booking.status !== 'completed' ?
            `<button class="btn btn-success btn-sm" onclick="switchSection('mpesa-verification')"><i class="fas fa-money-bill-wave"></i> Review Payments</button>` : ''}
          ${booking.status !== 'cancelled' && booking.status !== 'completed' ?
            `<button class="btn btn-danger btn-sm" onclick="openCancellationModal('${doc.id}')"><i class="fas fa-times"></i> Cancel</button>` : ''}
          ${booking.status === 'confirmed' ?
            `<button class="btn btn-outline btn-sm" onclick="updateBookingStatus('${doc.id}', 'completed')"><i class="fas fa-flag-checkered"></i> Complete</button>` : ''}
        </div></td>
      `;
      bookingsTable.appendChild(row);
    });
  } catch (error) {
    console.error('Error loading bookings:', error);
    const bookingsTable = document.getElementById('bookings-table');
    if (bookingsTable) bookingsTable.innerHTML = `<tr><td colspan="8" style="text-align:center; color:red;">Error: ${error.message}</td></tr>`;
  }
}

function detailText(value) {
  return escapeDashboardHtml(value == null || value === '' ? '—' : String(value)).replace(/\n/g, '<br>');
}

function recordDate(value, fallback = 'Unknown') {
  if (!value) return fallback;
  try {
    return value.toDate ? value.toDate().toLocaleString() : new Date(value).toLocaleString();
  } catch (_) {
    return fallback;
  }
}

function openRecordDetail(kicker, title, body, actions, record) {
  activeRecordDetail = record;
  document.getElementById('record-detail-kicker').textContent = kicker;
  document.getElementById('record-detail-title').textContent = title;
  document.getElementById('record-detail-body').innerHTML = body;
  document.getElementById('record-detail-actions').innerHTML = actions;
  document.getElementById('record-detail-modal').classList.add('active');
}

function closeRecordDetail() {
  document.getElementById('record-detail-modal')?.classList.remove('active');
  activeRecordDetail = null;
}

function openBookingDetails(bookingDocId) {
  const booking = adminBookingCache.get(bookingDocId);
  if (!booking) {
    showToast('Booking details are no longer available. Refresh the list.', 'warning');
    return;
  }
  const bookingId = booking.id || bookingDocId;
  const status = booking.status || 'pending';
  const actions = [
    '<button class="btn btn-outline" onclick="closeRecordDetail()">Back to bookings</button>',
    `<button class="btn btn-outline" onclick="closeRecordDetail(); viewUserDocs('${escapeDashboardHtml(bookingId)}')"><i class="fas fa-id-card"></i> View IDs</button>`
  ];
  if (status !== 'confirmed' && status !== 'cancelled' && status !== 'completed') {
    actions.push(`<button class="btn btn-success" onclick="closeRecordDetail(); switchSection('mpesa-verification')"><i class="fas fa-money-bill-wave"></i> M-Pesa Verification</button>`);
  }
  if (status !== 'cancelled' && status !== 'completed') {
    actions.push(`<button class="btn btn-danger" onclick="closeRecordDetail(); openCancellationModal('${escapeDashboardHtml(bookingDocId)}')"><i class="fas fa-times"></i> Cancel Booking</button>`);
  }
  if (status === 'confirmed') {
    actions.push(`<button class="btn btn-primary" onclick="closeRecordDetail(); updateBookingStatus('${escapeDashboardHtml(bookingDocId)}', 'completed')"><i class="fas fa-flag-checkered"></i> Mark Completed</button>`);
  }
  openRecordDetail(
    'Booking details',
    bookingId,
    `<div class="detail-grid">
      <div class="detail-field"><label>Guest</label><p>${detailText(booking.name)}</p></div>
      <div class="detail-field"><label>Status</label><p><span class="status status-${escapeDashboardHtml(status)}">${escapeDashboardHtml(status.toUpperCase())}</span></p></div>
      <div class="detail-field"><label>Email</label><p>${booking.email ? `<a href="mailto:${escapeDashboardHtml(booking.email)}">${detailText(booking.email)}</a>` : '—'}</p></div>
      <div class="detail-field"><label>Phone</label><p>${detailText(booking.phone)}</p></div>
      <div class="detail-field"><label>Property</label><p>${detailText(booking.house)}</p></div>
      <div class="detail-field"><label>Guests</label><p>${detailText(booking.guests)}</p></div>
      <div class="detail-field"><label>Check-in</label><p>${detailText(booking.checkin)}</p></div>
      <div class="detail-field"><label>Check-out</label><p>${detailText(booking.checkout)}</p></div>
      <div class="detail-field"><label>Created</label><p>${detailText(recordDate(booking.timestamp))}</p></div>
      <div class="detail-field"><label>Booking ID</label><p>${detailText(bookingId)}</p></div>
      ${booking.paymentMethod ? `<div class="detail-field"><label>Payment</label><p>${detailText(booking.paymentMethod)}${booking.transactionRef ? ` · ${detailText(booking.transactionRef)}` : ''}</p></div>` : ''}
      ${booking.cancellationReason ? `<div class="detail-field full-width"><label>Cancellation reason</label><p>${detailText(booking.cancellationReason)}</p></div>` : ''}
    </div>`,
    actions.join(''),
    { type: 'booking', id: bookingDocId, record: booking }
  );
}

async function viewUserDocs(userId) {
  const bookingCode = String(userId || '').replace(/^booking_/, '');
  if (!bookingCode) return alert('No booking code associated');
  const docs = await db.collection('users').doc(`booking_${bookingCode}`).collection('documents').get();
  if (docs.empty) return alert('No documents uploaded');
  const firstDoc = docs.docs[0];
  const documentData = firstDoc.data();
  const cacheKey = `${bookingCode}_${firstDoc.id}`;
  adminDocumentCache.set(cacheKey, documentData);
  openAdminDocument(cacheKey);
}

function documentDate(value) {
  if (!value) return '';
  try {
    return value.toDate ? value.toDate().toLocaleString() : new Date(value).toLocaleString();
  } catch (_) {
    return '';
  }
}

function documentContentUrl(documentData) {
  if (!documentData) return '';
  return documentData.url || documentData.downloadURL || documentData.downloadUrl || documentData.data || '';
}

function openAdminDocument(documentId) {
  const documentData = adminDocumentCache.get(documentId);
  const contentUrl = documentContentUrl(documentData);
  if (!contentUrl) return alert('This document has no viewable file data.');
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return alert('Please allow pop-ups to view the document.');
  const safeUrl = String(contentUrl).replace(/"/g, '&quot;');
  const isPdf = documentData.type === 'application/pdf' || /\.pdf($|\?)/i.test(documentData.name || '');
  win.document.write(isPdf
    ? `<html><body style="margin:0;background:#222;"><iframe src="${safeUrl}" style="border:0;width:100vw;height:100vh;"></iframe></body></html>`
    : `<html><body style="margin:0;background:#222;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img src="${safeUrl}" alt="Guest document" style="max-width:100%;max-height:100vh;object-fit:contain;" onerror="document.body.innerHTML='<p style=color:white;font-family:sans-serif>Image unavailable</p>'"></body></html>`);
  win.document.close();
}

async function loadIdDocuments() {
  const container = document.getElementById('id-documents-list');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--text-light);text-align:center;padding:2rem;"><i class="fas fa-spinner fa-spin"></i> Loading documents...</p>';
  adminDocumentCache.clear();
  try {
    const bookingsSnapshot = await db.collection('bookings').get();
    const documentGroups = await Promise.all(bookingsSnapshot.docs.map(async bookingDoc => {
      const booking = bookingDoc.data();
      const bookingCode = booking.id || bookingDoc.id;
      const docsSnapshot = await db.collection('users').doc(`booking_${bookingCode}`).collection('documents').get();
      return docsSnapshot.docs.map(documentDoc => ({
        booking,
        bookingCode,
        id: documentDoc.id,
        data: documentDoc.data()
      }));
    }));
    const documents = documentGroups.flat().sort((a, b) => {
      const aTime = a.data.uploadedAt?.seconds || 0;
      const bTime = b.data.uploadedAt?.seconds || 0;
      return bTime - aTime;
    });
    if (!documents.length) {
      container.innerHTML = '<p style="color:var(--text-light);text-align:center;padding:2rem;">No guest documents uploaded yet.</p>';
      return;
    }
    container.innerHTML = documents.map(item => {
      const cacheKey = `${item.bookingCode}_${item.id}`;
      adminDocumentCache.set(cacheKey, item.data);
      const contentUrl = documentContentUrl(item.data);
      const isPdf = item.data.type === 'application/pdf' || /\.pdf$/i.test(item.data.name || '');
      const encodedId = cacheKey.replace(/'/g, '&#39;');
      return `<article class="review-card">
        <div class="review-header">
          <div style="flex:1;">
            <strong>${item.booking.name || 'Guest'}</strong>
            <div style="font-size:0.82rem;color:var(--text-light);">${item.booking.email || ''}</div>
            <div style="font-size:0.82rem;color:var(--text-light);">Booking: ${item.bookingCode}</div>
          </div>
          <i class="fas ${isPdf ? 'fa-file-pdf' : 'fa-file-image'}" style="font-size:2rem;color:var(--primary-color);"></i>
        </div>
        <p style="margin:0.75rem 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.data.name || 'Uploaded document'}</p>
        <small style="color:var(--text-light);">${documentDate(item.data.uploadedAt)}</small>
        ${contentUrl ? `<button class="btn btn-primary btn-sm" style="margin-top:0.75rem;" onclick="openAdminDocument('${encodedId}')"><i class="fas fa-eye"></i> View</button>` : '<small style="color:#c62828;">File data unavailable</small>'}
      </article>`;
    }).join('');
  } catch (error) {
    console.error('Error loading ID documents:', error);
    container.innerHTML = `<p style="color:#c62828;text-align:center;padding:2rem;">Error loading documents: ${error.message}</p>`;
  }
}

// Update booking status
async function updateBookingStatus(bookingId, status) {
  try {
    if (status !== 'completed') {
      throw new Error('Only the secure completion action is supported here.');
    }

    await firebase.functions().httpsCallable('completeBookingSecure')({
      bookingDocId: bookingId
    });
    
    // Send email to client about status update
    const bookingDoc = await db.collection('bookings').doc(bookingId).get();
    const booking = bookingDoc.data();
    
    if (booking.email) {
      let message = '';
      switch(status) {
        case 'confirmed':
          message = `Your booking for ${booking.house} has been confirmed! Check-in: ${booking.checkin}, Check-out: ${booking.checkout}. We look forward to hosting you!`;
          break;
        case 'completed':
          message = `Thank you for staying with us! We hope you enjoyed your time at ${booking.house}. Please leave us a review!`;
          break;
        case 'cancelled':
          message = `Your booking for ${booking.house} has been cancelled. If you have any questions, please contact us.`;
          break;
      }
      
      try {
        await emailjs.send(emailConfig.serviceId, emailConfig.clientTemplate, {
          to_name: booking.name,
          to_email: booking.email,
          from_name: "Gonah Homes",
          subject: `Booking ${status.charAt(0).toUpperCase() + status.slice(1)} - Gonah Homes`,
          message: message
        });
      } catch (emailErr) {
        console.warn('Status email could not be sent (booking still updated):', emailErr.message);
      }
    }
    

    showToast(`Booking ${status} successfully`, 'success');
    loadBookings();
  } catch (error) {
    console.error('Error updating booking:', error);
    showToast('Error updating booking', 'error');
  }
}

// Load messages
async function loadMessages() {
  try {
    const snapshot = await db.collection('messages').orderBy('timestamp', 'desc').get();
    const messagesList = document.getElementById('messages-list');
    messagesList.innerHTML = '';

    if (snapshot.empty) {
      messagesList.innerHTML = '<div class="empty-state"><i class="fas fa-envelope-open"></i><p>No messages yet.</p></div>';
      return;
    }

    snapshot.forEach(doc => {
      const message = doc.data();
      const messageItem = document.createElement('div');
      messageItem.className = 'message-item';
      messageItem.onclick = () => showMessageDetail(doc.id, message);
      
      messageItem.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
          <strong>${detailText(message.name)}</strong>
          <span class="status status-${message.status || 'new'}">${(message.status || 'new').toUpperCase()}</span>
        </div>
        <div style="color: var(--text-light); font-size: 0.9rem; margin-bottom: 0.5rem;">${detailText(message.email)}</div>
        <div style="color: var(--text-color); font-size: 0.9rem;">${detailText((message.message || '').substring(0, 100))}${(message.message || '').length > 100 ? '…' : ''}</div>
      `;
      
      messagesList.appendChild(messageItem);
    });
  } catch (error) {
    console.error('Error loading messages:', error);
  }
}

// Load service requests
async function loadServiceRequests() {
  try {
    const snapshot = await db.collection('service_requests').orderBy('timestamp', 'desc').get();
    const list = document.getElementById('service-requests-list');
    list.innerHTML = '';

    if (snapshot.empty) {
      list.innerHTML = '<div class="empty-state"><i class="fas fa-concierge-bell"></i><p>No service requests yet.</p></div>';
      return;
    }

    snapshot.forEach(doc => {
      const req = doc.data();
      const item = document.createElement('div');
      item.className = 'message-item';
      item.onclick = () => showServiceRequestDetail(doc.id, req);
      const date = req.timestamp ? new Date(req.timestamp.toDate()).toLocaleDateString() : 'N/A';
      item.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
          <strong>${req.type || 'Request'}</strong>
          <span class="status status-${req.status || 'pending'}">${(req.status || 'pending').toUpperCase()}</span>
        </div>
        <div style="color: var(--text-light); font-size: 0.9rem; margin-bottom: 0.5rem;">${req.userEmail || req.userId || 'Guest'}</div>
        <div style="color: var(--text-color); font-size: 0.9rem;">${(req.details || '').substring(0, 100)}...</div>
        <div style="font-size: 0.78rem; color: #999; margin-top: 0.3rem;">${date}</div>
      `;
      list.appendChild(item);
    });
  } catch (error) {
    console.error('Error loading service requests:', error);
  }
}

// Show service request detail
function showServiceRequestDetail(requestId, req) {
  const status = req.status || 'pending';
  const actions = [
    '<button class="btn btn-outline" onclick="closeRecordDetail()">Back to requests</button>',
    `<button class="btn btn-danger" onclick="deleteServiceRequest('${escapeDashboardHtml(requestId)}')"><i class="fas fa-trash"></i> Delete</button>`
  ];
  if (status !== 'completed') {
    actions.unshift(`<button class="btn btn-success" onclick="updateServiceRequestStatus('${escapeDashboardHtml(requestId)}', 'completed')"><i class="fas fa-check"></i> Mark Completed</button>`);
  }
  if (status !== 'cancelled' && status !== 'completed') {
    actions.unshift(`<button class="btn btn-danger" onclick="updateServiceRequestStatus('${escapeDashboardHtml(requestId)}', 'cancelled')"><i class="fas fa-times"></i> Cancel</button>`);
  }
  openRecordDetail(
    'Guest service request',
    req.type || 'Service Request',
    `<div class="detail-grid">
      <div class="detail-field"><label>From</label><p>${detailText(req.userEmail || req.userId || 'Guest')}</p></div>
      <div class="detail-field"><label>Status</label><p><span class="status status-${escapeDashboardHtml(status)}">${escapeDashboardHtml(status.toUpperCase())}</span></p></div>
      <div class="detail-field"><label>Received</label><p>${detailText(recordDate(req.timestamp))}</p></div>
      <div class="detail-field"><label>Request type</label><p>${detailText(req.type || 'General')}</p></div>
      <div class="detail-field full-width"><label>Details</label><div class="detail-message">${detailText(req.details || 'No details provided.')}</div></div>
    </div>`,
    actions.join(''),
    { type: 'service', id: requestId, record: req }
  );
}

// Update service request status
async function updateServiceRequestStatus(requestId, status) {
  try {
    await db.collection('service_requests').doc(requestId).update({ status, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    closeRecordDetail();
    await loadServiceRequests();
    updateStats();
    showToast(`Request marked ${status}.`, 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// Show message detail
function showMessageDetail(messageId, message) {
  const status = message.status || 'new';
  const actions = [
    '<button class="btn btn-outline" onclick="closeRecordDetail()">Back to messages</button>',
    `<button class="btn btn-danger" onclick="deleteMessage('${escapeDashboardHtml(messageId)}')"><i class="fas fa-trash"></i> Delete</button>`
  ];
  if (status === 'new') {
    actions.unshift(`<button class="btn btn-outline" onclick="markMessageAsRead('${escapeDashboardHtml(messageId)}')"><i class="fas fa-check"></i> Mark as Read</button>`);
  }
  actions.unshift('<button class="btn btn-primary" onclick="replyToActiveMessage()"><i class="fas fa-reply"></i> Send Reply</button>');
  openRecordDetail(
    'Guest message',
    message.name || 'Message',
    `<div class="detail-grid">
      <div class="detail-field"><label>From</label><p>${detailText(message.name)}</p></div>
      <div class="detail-field"><label>Status</label><p><span class="status status-${escapeDashboardHtml(status)}">${escapeDashboardHtml(status.toUpperCase())}</span></p></div>
      <div class="detail-field"><label>Email</label><p>${message.email ? `<a href="mailto:${escapeDashboardHtml(message.email)}">${detailText(message.email)}</a>` : '—'}</p></div>
      <div class="detail-field"><label>Received</label><p>${detailText(recordDate(message.timestamp))}</p></div>
      <div class="detail-field full-width"><label>Message</label><div class="detail-message">${detailText(message.message)}</div></div>
      <div class="detail-field full-width"><label>Reply</label><textarea id="reply-text-${escapeDashboardHtml(messageId)}" class="detail-reply" placeholder="Write a reply to this guest..."></textarea></div>
    </div>`,
    actions.join(''),
    { type: 'message', id: messageId, record: message }
  );
}

function replyToActiveMessage() {
  if (!activeRecordDetail || activeRecordDetail.type !== 'message') return;
  const message = activeRecordDetail.record;
  replyToMessage(activeRecordDetail.id, message.email, message.name);
}

async function deleteMessage(messageId) {
  if (!confirm('Delete this message permanently? This cannot be undone.')) return;
  try {
    await db.collection('messages').doc(messageId).delete();
    closeRecordDetail();
    await loadMessages();
    updateStats();
    showToast('Message deleted.', 'success');
  } catch (error) {
    console.error('Error deleting message:', error);
    showToast('Error deleting message: ' + error.message, 'error');
  }
}

async function deleteServiceRequest(requestId) {
  if (!confirm('Delete this service request permanently? This cannot be undone.')) return;
  try {
    await db.collection('service_requests').doc(requestId).delete();
    closeRecordDetail();
    await loadServiceRequests();
    updateStats();
    showToast('Service request deleted.', 'success');
  } catch (error) {
    console.error('Error deleting service request:', error);
    showToast('Error deleting service request: ' + error.message, 'error');
  }
}

// Reply to message
async function replyToMessage(messageId, clientEmail, clientName) {
  const replyText = document.getElementById(`reply-text-${messageId}`).value.trim();
  
  if (!replyText) {
    showToast('Please enter a reply message', 'warning');
    return;
  }
  
  try {
    await emailjs.send(emailConfig.serviceId, emailConfig.clientTemplate, {
      to_name: clientName,
      to_email: clientEmail,
      from_name: "Gonah Homes",
      subject: "Reply from Gonah Homes",
      message: replyText
    });
    
    // Update message status
    await db.collection('messages').doc(messageId).update({
      status: 'replied',
      reply: replyText,
      repliedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    showToast('Reply sent successfully', 'success');
    closeRecordDetail();
    loadMessages();
  } catch (error) {
    console.error('Error sending reply:', error);
    showToast('Error sending reply', 'error');
  }
}

// Mark message as read
async function markMessageAsRead(messageId) {
  try {
    await db.collection('messages').doc(messageId).update({
      status: 'read',
      readAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast('Message marked as read', 'success');
    closeRecordDetail();
    loadMessages();
  } catch (error) {
    console.error('Error marking message as read:', error);
  }
}

// Load reviews
async function loadReviews() {
  try {
    const snapshot = await db.collection('reviews').orderBy('timestamp', 'desc').get();
    const reviewsGrid = document.getElementById('reviews-grid');
    if (!reviewsGrid) return;
    reviewsGrid.innerHTML = '';

    if (snapshot.empty) {
      reviewsGrid.innerHTML = '<p style="color:var(--text-light);text-align:center;padding:2rem;">No reviews yet.</p>';
      return;
    }

    snapshot.forEach(doc => {
      const review = doc.data();
      const reviewCard = document.createElement('div');
      reviewCard.className = 'review-card';
      const stars = '★'.repeat(parseInt(review.rating) || 5).padEnd(5, '☆');
      const isApproved = review.approved === true;
      const verificationLabel = review.verificationType === 'visitor_review' || review.verifiedBooking === false
        ? 'Visitor review'
        : (review.verificationType === 'verified_stay' ? 'Verified stay' : 'Verified booking');
      const guestName = review.name || review.user?.name || 'Anonymous';
      const guestEmail = review.email || review.user?.email || '';
      const safeEmail = guestEmail.replace(/'/g, '');
      const safeName = guestName.replace(/'/g, '');

      reviewCard.innerHTML = `
        <div class="review-header" style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div style="flex:1;">
            <strong>${guestName}</strong>
            ${guestEmail ? `<div style="font-size:0.8rem;color:var(--text-light);">${guestEmail}</div>` : ''}
            <div class="review-rating" style="margin-top:0.25rem;">${stars}</div>
            <span style="display:inline-block;margin-top:0.35rem;background:#f5f5f5;padding:2px 6px;border-radius:4px;font-size:0.75rem;">${verificationLabel}</span>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;">
            <span style="background:${isApproved ? '#e8f5e9' : '#fce4ec'};${isApproved ? 'color:#2e7d32' : 'color:#c2185b'};padding:4px 8px;border-radius:4px;font-size:0.75rem;font-weight:bold;">
              ${isApproved ? '✓ Visible to guests' : '🚫 Hidden from guests'}
            </span>
          </div>
        </div>
        <p style="margin:0.75rem 0;line-height:1.5;">${review.review || ''}</p>
        ${review.imageUrl ? `<div style="margin:0.5rem 0;"><img src="${review.imageUrl}" alt="Review" /></div>` : ''}
        <small style="color: var(--text-light); display:block; margin-bottom:0.5rem;">
          ${review.property ? `<strong>${review.property}</strong> · ` : ''}
          ${review.timestamp ? new Date(review.timestamp.toDate()).toLocaleDateString() : 'Unknown date'}
        </small>
        ${review.adminReply ? `
          <div style="margin-top: 1rem; padding: 1rem; background: var(--bg-color); border-radius: 4px;">
            <strong>Management Reply:</strong><br>${review.adminReply}
          </div>
        ` : ''}
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-top:1rem;padding-top:0.75rem;border-top:1px dashed #eee;">
          <button class="btn ${isApproved ? 'btn-warning' : 'btn-success'} btn-sm" onclick="toggleReviewApproval('${doc.id}', ${!isApproved})">
            ${isApproved ? 'Hide' : 'Approve'}
          </button>
          <button class="btn btn-info btn-sm" onclick="replyToReview('${doc.id}', '${safeEmail}', '${safeName}')">Reply</button>
          <button class="btn btn-danger btn-sm" onclick="deleteReview('${doc.id}')"><i class="fa fa-trash"></i> Delete</button>
        </div>
      `;

      reviewsGrid.appendChild(reviewCard);
    });
  } catch (error) {
    console.error('Error loading reviews:', error);
    const reviewsGrid = document.getElementById('reviews-grid');
    if (reviewsGrid) reviewsGrid.innerHTML = `<p style="color:red;padding:1rem;">Error loading reviews: ${error.message}</p>`;
  }
}

async function toggleReviewVisibility(reviewId, currentlyVisible) {
  try {
    await db.collection('reviews').doc(reviewId).update({
      approved: !currentlyVisible,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast(currentlyVisible ? 'Review hidden from guests.' : 'Review is now visible to guests.', 'success');
    loadReviews();
  } catch (error) {
    console.error('Error updating review visibility:', error);
    showToast('Error updating review: ' + error.message, 'error');
  }
}

async function deleteReview(reviewId) {
  if (!confirm('Permanently delete this review? This cannot be undone.')) return;
  try {
    await db.collection('reviews').doc(reviewId).delete();
    showToast('Review deleted.', 'success');
    loadReviews();
  } catch (error) {
    console.error('Error deleting review:', error);
    showToast('Error deleting review: ' + error.message, 'error');
  }
}

// Reply to review
async function replyToReview(reviewId, clientEmail, clientName) {
  const replyText = prompt('Enter your reply to this review:');
  
  if (!replyText) return;
  
  try {
    // Update review with admin reply
    await db.collection('reviews').doc(reviewId).update({
      adminReply: replyText,
      repliedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Send email to client if email exists8
    if (clientEmail) {
      await emailjs.send(emailConfig.serviceId, emailConfig.clientTemplate, {
        to_name: clientName || 'Guest',
        to_email: clientEmail,
        from_name: "Gonah Homes",
        subject: "Reply to your review - Gonah Homes",
        message: `Thank you for your review! Here's our response:\n\n${replyText}\n\nWe appreciate your feedback and look forward to serving you again.`
      });
    }
    
    showToast('Reply sent successfully', 'success');
    loadReviews();
  } catch (error) {
    console.error('Error replying to review:', error);
    showToast('Error sending reply', 'error');
  }
}

// Load announcements
async function loadAnnouncements() {
  try {
    const snapshot = await db.collection('announcements').orderBy('createdAt', 'desc').get();
    const announcementsGrid = document.getElementById('announcements-grid');
    announcementsGrid.innerHTML = '';

    snapshot.forEach(doc => {
      const announcement = doc.data();
      const announcementCard = document.createElement('div');
      announcementCard.className = 'announcement-card';
      
      announcementCard.innerHTML = `
        <div class="announcement-type ${announcement.type}">${announcement.type.toUpperCase()}</div>
        <h3>${announcement.title}</h3>
        <p>${announcement.message}</p>
        <div style="margin-top: 1rem;">
          <small style="color: var(--text-light);">
            Created: ${announcement.createdAt ? new Date(announcement.createdAt.toDate()).toLocaleDateString() : 'Unknown'}
            ${announcement.validUntil ? ` | Valid until: ${new Date(announcement.validUntil.toDate()).toLocaleDateString()}` : ''}
          </small>
        </div>
        <div style="margin-top: 1rem;">
          <button class="btn btn-danger btn-sm" onclick="deleteAnnouncement('${doc.id}')">Delete</button>
          <button class="btn btn-outline btn-sm" onclick="toggleAnnouncementStatus('${doc.id}', ${announcement.active || true})">${announcement.active ? 'Deactivate' : 'Activate'}</button>
        </div>
      `;
      
      announcementsGrid.appendChild(announcementCard);
    });
  } catch (error) {
    console.error('Error loading announcements:', error);
  }
}

// Create announcement
async function createAnnouncement(formData) {
  try {
    await db.collection('announcements').add({
      title: formData.title,
      type: formData.type,
      message: formData.message,
      validUntil: formData.validUntil ? firebase.firestore.Timestamp.fromDate(new Date(formData.validUntil)) : null,
      active: formData.active,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      views: 0,
      clicks: 0
    });
    
    showToast('Announcement created successfully', 'success');
    loadAnnouncements();
    closeAnnouncementModal();
  } catch (error) {
    console.error('Error creating announcement:', error);
    showToast('Error creating announcement', 'error');
  }
}

// Delete announcement
async function deleteAnnouncement(announcementId) {
  if (!confirm('Are you sure you want to delete this announcement?')) return;
  try {
    await db.collection('announcements').doc(announcementId).delete();
    showToast('Announcement deleted successfully', 'success');
    loadAnnouncements();
  } catch (error) {
    console.error('Error deleting announcement:', error);
    showToast('Error deleting announcement', 'error');
  }
}

async function toggleAnnouncementStatus(announcementId, currentlyActive) {
  try {
    await db.collection('announcements').doc(announcementId).update({ active: !currentlyActive });
    showToast(`Announcement ${currentlyActive ? 'deactivated' : 'activated'}.`, 'success');
    loadAnnouncements();
  } catch (error) {
    console.error('Error toggling announcement:', error);
    showToast('Error updating announcement', 'error');
  }
}

// Load clients
async function loadClients() {
  try {
    const snapshot = await db.collection('bookings').get();
    const clientsMap = new Map();
    
    snapshot.forEach(doc => {
      const booking = doc.data();
      if (booking.email) {
        if (clientsMap.has(booking.email)) {
          const client = clientsMap.get(booking.email);
          client.totalBookings++;
          client.lastBooking = booking.timestamp?.toDate() || new Date();
        } else {
          clientsMap.set(booking.email, {
            name: booking.name,
            email: booking.email,
            phone: booking.phone,
            totalBookings: 1,
            firstBooking: booking.timestamp?.toDate() || new Date(),
            lastBooking: booking.timestamp?.toDate() || new Date()
          });
        }
      }
    });
    
    const clientsGrid = document.getElementById('clients-grid');
    clientsGrid.innerHTML = '';
    
    Array.from(clientsMap.values()).forEach(client => {
      const clientCard = document.createElement('div');
      clientCard.className = 'client-card';
      
      clientCard.innerHTML = `
        <div class="client-header">
          <div class="client-avatar">${client.name.charAt(0).toUpperCase()}</div>
          <div>
            <strong>${client.name}</strong>
            <div style="color: var(--text-light); font-size: 0.9rem;">${client.email}</div>
          </div>
        </div>
        <div style="margin-bottom: 0.5rem;"><strong>Phone:</strong> ${client.phone}</div>
        <div style="margin-bottom: 0.5rem;"><strong>Total Bookings:</strong> ${client.totalBookings}</div>
        <div style="margin-bottom: 0.5rem;"><strong>First Booking:</strong> ${client.firstBooking.toLocaleDateString()}</div>
        <div><strong>Last Booking:</strong> ${client.lastBooking.toLocaleDateString()}</div>
      `;
      
      clientsGrid.appendChild(clientCard);
    });
  } catch (error) {
    console.error('Error loading clients:', error);
  }
}

// Initialize charts with empty data, then populate from Firestore
function initializeCharts() {
  ['bookingsChart', 'propertiesChart'].forEach(id => {
    const canvas = document.getElementById(id);
    const existingChart = canvas && Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();
  });

  const bookingsCtx = document.getElementById('bookingsChart')?.getContext('2d');
  const propertiesCtx = document.getElementById('propertiesChart')?.getContext('2d');

  if (bookingsCtx) {
    charts.bookingsChart = new Chart(bookingsCtx, {
      type: 'line',
      data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        datasets: [{
          label: 'Bookings',
          data: [0,0,0,0,0,0,0,0,0,0,0,0],
          borderColor: 'rgb(128, 0, 0)',
          backgroundColor: 'rgba(128, 0, 0, 0.1)',
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  if (propertiesCtx) {
    charts.propertiesChart = new Chart(propertiesCtx, {
      type: 'doughnut',
      data: {
        labels: ['Studio', 'One Bedroom', 'Two Bedroom', 'Three Bedroom', 'Four Bedroom', 'Maisonette'],
        datasets: [{
          data: [0,0,0,0,0,0],
          backgroundColor: [
            'rgba(128, 0, 0, 0.85)',
            'rgba(160, 32, 0, 0.85)',
            'rgba(200, 64, 0, 0.85)',
            'rgba(128, 0, 0, 0.6)',
            'rgba(160, 32, 0, 0.6)',
            'rgba(200, 64, 0, 0.6)'
          ]
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  loadAnalyticsData();
}

async function loadAnalyticsData() {
  try {
    const snapshot = await db.collection('bookings').get();
    const monthCounts = new Array(12).fill(0);
    const propMap = {
      'Studio Apartment': 0,
      'One Bedroom Apartment': 0,
      'Two Bedroom Apartment': 0,
      'Three Bedroom Apartment': 0,
      'Four Bedroom Apartment': 0,
      'Luxury Maisonette': 0
    };
    snapshot.forEach(doc => {
      const b = doc.data();
      if (b.status === 'cancelled') return;
      if (b.timestamp) monthCounts[new Date(b.timestamp.toDate()).getMonth()]++;
      if (b.house && propMap.hasOwnProperty(b.house)) propMap[b.house]++;
    });

    if (charts.bookingsChart) {
      charts.bookingsChart.data.datasets[0].data = monthCounts;
      charts.bookingsChart.update();
    }

    if (charts.propertiesChart) {
      charts.propertiesChart.data.datasets[0].data = Object.values(propMap);
      charts.propertiesChart.update();
    }

  } catch (error) {
    console.error('Error loading analytics:', error);
  }
}

// Notification system
function addNotification(type, message, data) {
  notifications.unshift({
    id: Date.now(),
    type: type,
    message: message,
    data: data,
    timestamp: new Date(),
    read: false
  });
  
  updateNotificationCount();
  updateNotificationList();
  showToast(message, 'info');
}

function updateNotificationCount() {
  const unreadCount = notifications.filter(n => !n.read).length;
  document.getElementById('notification-count').textContent = unreadCount;
  document.getElementById('notification-count').style.display = unreadCount > 0 ? 'flex' : 'none';
}

function updateNotificationList() {
  const notificationList = document.getElementById('notification-list');
  notificationList.innerHTML = '';
  
  notifications.slice(0, 10).forEach(notification => {
    const notificationItem = document.createElement('div');
    notificationItem.style.padding = '1rem';
    notificationItem.style.borderBottom = '1px solid var(--border-color)';
    notificationItem.style.backgroundColor = notification.read ? 'transparent' : 'var(--bg-color)';
    
    notificationItem.innerHTML = `
      <div style="font-weight: ${notification.read ? 'normal' : 'bold'};">
        ${notification.message}
      </div>
      <small style="color: var(--text-light);">
        ${notification.timestamp.toLocaleString()}
      </small>
    `;
    
    notificationItem.onclick = () => {
      notification.read = true;
      updateNotificationCount();
      updateNotificationList();
    };
    
    notificationList.appendChild(notificationItem);
  });
}

function toggleNotifications() {
  const dropdown = document.getElementById('notification-dropdown');
  dropdown.classList.toggle('active');
}

function markAllRead() {
  notifications.forEach(n => n.read = true);
  updateNotificationCount();
  updateNotificationList();
}

function loadNotifications() {
  updateNotificationCount();
  updateNotificationList();
}

// Toast notifications
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  setTimeout(() => toast.classList.add('show'), 100);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => document.body.removeChild(toast), 300);
  }, 3000);
}

// Modal functions
function showAnnouncementModal() {
  document.getElementById('announcement-modal').classList.add('active');
}

function closeAnnouncementModal() {
  document.getElementById('announcement-modal').classList.remove('active');
  document.getElementById('announcement-form').reset();
}

// Navigation
// ===================== STAFF ACCOUNT MANAGEMENT =====================
async function loadStaff() {
  const list = document.getElementById('staff-list');
  if (!list) return;
  list.innerHTML = '<p style="color:var(--text-light);padding:1rem;">Loading...</p>';
  try {
    const snap = await db.collection('staff_accounts').get();
    if (snap.empty) {
      list.innerHTML = '<p style="color:var(--text-light);padding:1rem;">No additional staff accounts yet. Click "Add Staff" to create one.</p>';
      return;
    }
    let html = '';
    snap.forEach(doc => {
      const s = doc.data();
      html += `
        <div class="card" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;margin-bottom:0.75rem;padding:1rem 1.25rem;">
          <div>
            <strong style="display:block;">${s.displayName || s.email}</strong>
            <span style="font-size:0.85rem;color:var(--text-light);">${s.email}</span>
            ${s.createdAt ? `<span style="font-size:0.8rem;color:var(--text-light);display:block;">Added ${new Date(s.createdAt.toDate()).toLocaleDateString()}</span>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:0.75rem;">
            <span style="background:#e8f5e9;color:#2e7d32;padding:2px 10px;border-radius:12px;font-size:0.8rem;font-weight:600;">${(s.role||'staff').toUpperCase()}</span>
            <button class="btn btn-danger btn-sm" onclick="removeStaffAccess('${doc.id}')"><i class="fas fa-user-minus"></i> Remove Access</button>
          </div>
        </div>`;
    });
    list.innerHTML = html;
  } catch (err) {
    list.innerHTML = `<p style="color:red;padding:1rem;">Error loading staff: ${err.message}</p>`;
  }
}

async function createStaffAccount() {
  const currentUser = firebase.auth().currentUser;
  if (!currentUser || !currentUser.emailVerified ||
      !isPrimaryAdminEmail(currentUser.email) ||
      currentAdminRole !== 'primary_admin') {
    showToast('Only the verified Primary Admin can create staff accounts.', 'error');
    return;
  }

  const allowedStaffRoles = ['admin', 'accountant', 'manager', 'receptionist'];

  const email = document.getElementById('staff-email').value.trim();
  const password = document.getElementById('staff-password').value;
  const displayName = document.getElementById('staff-name').value.trim();
  const role = document.getElementById('staff-role').value;
  if (!allowedStaffRoles.includes(role)) {
    showToast('Invalid staff role selected.', 'error');
    return;
  }


  if (!email || !password || password.length < 6) {
    showToast('Fill all fields. Password must be at least 6 characters.', 'error');
    return;
  }
  const btn = document.getElementById('create-staff-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

  try {
    // Create user via a secondary Firebase app instance (avoids signing out the current admin)
    let secondaryApp;
    try { secondaryApp = firebase.app('StaffCreation'); }
    catch(_) { secondaryApp = firebase.initializeApp(firebaseConfig, 'StaffCreation'); }

    const cred = await secondaryApp.auth().createUserWithEmailAndPassword(email, password);
    const uid = cred.user.uid;

    await db.collection('staff_accounts').doc(uid).set({
      email,
      displayName: displayName || email.split('@')[0],
      role,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: firebase.auth().currentUser?.email || ADMIN_EMAIL,
      active: true
    });

    await secondaryApp.auth().signOut();
    try { secondaryApp.delete(); } catch(_) {}

    showToast(`Staff account created for ${email}.`, 'success');
    document.getElementById('staff-modal').classList.remove('active');
    document.getElementById('staff-form').reset();
    loadStaff();
  } catch (err) {
    const msgs = {
      'auth/email-already-in-use': 'An account with that email already exists.',
      'auth/weak-password': 'Password must be at least 6 characters.',
      'auth/invalid-email': 'Invalid email address.'
    };
    showToast(msgs[err.code] || 'Error creating account: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-user-plus"></i> Create Account';
  }
}

async function removeStaffAccess(uid) {
  const currentUser = firebase.auth().currentUser;
  if (!currentUser || !currentUser.emailVerified ||
      !isPrimaryAdminEmail(currentUser.email) ||
      currentAdminRole !== 'primary_admin') {
    showToast('Only the verified Primary Admin can remove staff access.', 'error');
    return;
  }

  if (!confirm('Remove this staff member\'s dashboard access?\n\nTheir Firebase account remains, but they will no longer be able to log into the admin dashboard.')) return;
  try {
    await db.collection('staff_accounts').doc(uid).delete();
    showToast('Staff access removed.', 'success');
    loadStaff();
  } catch (err) {
    showToast('Error removing staff: ' + err.message, 'error');
  }
}

// ===================== PROPERTY MANAGEMENT =====================
const MAX_PROPERTY_IMAGES = 10;

function propertyTextList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function propertyMultilineList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return String(value || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean);
}

function defaultOccupancyForType(type) {
  return ({
    studio: 2,
    '1bedroom': 2,
    '2bedroom': 4,
    '3bedroom': 6,
    '4bedroom': 8,
    maisonette: 6,
    villa: 6,
    townhouse: 6
  })[type] || 2;
}

const PROPERTY_TYPE_VALUES = new Set([
  'studio', '1bedroom', '2bedroom', '3bedroom', '4bedroom',
  'maisonette', 'villa', 'townhouse'
]);

function normalizePropertyType(value) {
  const raw = String(value || '').trim();
  const key = raw.toLowerCase().replace(/[\s_-]+/g, '');
  const aliases = {
    studio: 'studio',
    studioapartment: 'studio',
    apartment: '1bedroom',
    onebedroom: '1bedroom',
    '1bedroom': '1bedroom',
    twobedroom: '2bedroom',
    '2bedroom': '2bedroom',
    threebedroom: '3bedroom',
    '3bedroom': '3bedroom',
    fourbedroom: '4bedroom',
    '4bedroom': '4bedroom',
    maisonette: 'maisonette',
    villa: 'villa',
    townhouse: 'townhouse'
  };
  return aliases[key] || (PROPERTY_TYPE_VALUES.has(raw) ? raw : '');
}

function propertyDocumentId(name) {
  const slug = String(name || '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || `property-${Date.now()}`;
}

function escapeDashboardHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[character]));
}

function propertyDefaults(name) {
  return {};
}

function updateSeasonalRateEmptyState() {
  const list = document.getElementById('seasonal-rates-list');
  const empty = document.getElementById('seasonal-rates-empty');
  if (list && empty) empty.hidden = list.querySelectorAll('.seasonal-rate-row').length > 0;
}

function renderSeasonalRateRows(rates = []) {
  const list = document.getElementById('seasonal-rates-list');
  const error = document.getElementById('seasonal-rates-error');
  if (!list) return;
  if (error) error.textContent = '';
  const safeRates = window.GonahPricing
    ? window.GonahPricing.normalizeSeasonalRates(rates)
    : [];
  list.innerHTML = safeRates.map(rate => `
    <div class="seasonal-rate-row">
      <label>Season name
        <input type="text" data-seasonal-name maxlength="60" value="${escapeDashboardHtml(rate.name)}" placeholder="e.g. Festive season">
      </label>
      <label>Start date
        <input type="date" data-seasonal-start value="${escapeDashboardHtml(rate.startDate)}">
      </label>
      <label>End date
        <input type="date" data-seasonal-end value="${escapeDashboardHtml(rate.endDate)}">
      </label>
      <label>Rate per night (KSh)
        <input type="number" data-seasonal-price min="0" step="1" value="${escapeDashboardHtml(rate.price)}" placeholder="e.g. 9000">
      </label>
      <button type="button" class="seasonal-rate-remove" aria-label="Remove seasonal rate" onclick="this.closest('.seasonal-rate-row').remove(); updateSeasonalRateEmptyState();">
        <i class="fas fa-trash" aria-hidden="true"></i>
      </button>
    </div>
  `).join('');
  updateSeasonalRateEmptyState();
}

function addSeasonalRateRow() {
  const list = document.getElementById('seasonal-rates-list');
  if (!list) return;
  const maximum = window.GonahPricing?.MAX_SEASONAL_RATES || 20;
  if (list.querySelectorAll('.seasonal-rate-row').length >= maximum) {
    showToast(`A property can have at most ${maximum} seasonal date ranges.`, 'error');
    return;
  }
  const row = document.createElement('div');
  row.className = 'seasonal-rate-row';
  row.innerHTML = `
    <label>Season name
      <input type="text" data-seasonal-name maxlength="60" placeholder="e.g. Festive season">
    </label>
    <label>Start date
      <input type="date" data-seasonal-start>
    </label>
    <label>End date
      <input type="date" data-seasonal-end>
    </label>
    <label>Rate per night (KSh)
      <input type="number" data-seasonal-price min="0" step="1" placeholder="e.g. 9000">
    </label>
    <button type="button" class="seasonal-rate-remove" aria-label="Remove seasonal rate" onclick="this.closest('.seasonal-rate-row').remove(); updateSeasonalRateEmptyState();">
      <i class="fas fa-trash" aria-hidden="true"></i>
    </button>
  `;
  list.appendChild(row);
  document.getElementById('seasonal-rates-error').textContent = '';
  updateSeasonalRateEmptyState();
}

function readSeasonalRateRows() {
  return Array.from(document.querySelectorAll('#seasonal-rates-list .seasonal-rate-row')).map(row => ({
    name: row.querySelector('[data-seasonal-name]')?.value || '',
    startDate: row.querySelector('[data-seasonal-start]')?.value || '',
    endDate: row.querySelector('[data-seasonal-end]')?.value || '',
    price: row.querySelector('[data-seasonal-price]')?.value || ''
  }));
}

async function loadProperties() {
  const container = document.getElementById('properties-list');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--text-light);">Loading...</p>';

  const properties = {};
  try {
    const snap = await db.collection('property_settings').get();
    snap.forEach(doc => {
      const data = doc.data() || {};
      const name = data.name || doc.id;
      properties[doc.id] = { ...data, name, docId: doc.id };
    });
  } catch (error) {
    showToast('Could not load properties: ' + error.message, 'error');
    container.innerHTML = '<p style="color:#c62828;">Properties are temporarily unavailable. Please try again.</p>';
    return;
  }

  const records = Object.values(properties);
  container.innerHTML = `
    <div style="display:grid;gap:1.25rem;">
      ${records.map(property => {
        const images = Array.isArray(property.images) ? property.images.slice(0, MAX_PROPERTY_IMAGES) : [];
        const docId = property.docId || property.name;
        const seasonalRateCount = window.GonahPricing
          ? window.GonahPricing.normalizeSeasonalRates(property.seasonalRates).length
          : 0;
        const features = propertyTextList(property.amenities || property.features);
        const nearby = propertyTextList(property.landmarks);
        const houseRules = propertyMultilineList(property.houseRules);
        const propertyStatus = String(property.status || 'available').toLowerCase();
        const isArchived = property.archived === true;
        return `
          <article class="card" style="padding:1.25rem 1.5rem;">
            <div style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap;">
              <div>
                <h3 style="margin:0 0 .25rem;">${escapeDashboardHtml(property.name)}
                  <span class="status ${isArchived ? 'status-cancelled' : (propertyStatus === 'maintenance' ? 'status-cancelled' : 'status-confirmed')}" style="margin-left:.4rem;">${isArchived ? 'ARCHIVED' : (propertyStatus === 'maintenance' ? 'MAINTENANCE' : 'AVAILABLE')}</span>
                </h3>
                <p style="font-size:.84rem;color:var(--text-light);margin:0;">
                  ${escapeDashboardHtml(property.type || 'Property')} ${property.location ? ` • ${escapeDashboardHtml(property.location)}` : ''}
                  ${property.price !== undefined ? ` • KSh ${Number(property.price || 0).toLocaleString()}/night` : ''}
                  ${seasonalRateCount ? ` • ${seasonalRateCount} seasonal rate${seasonalRateCount === 1 ? '' : 's'}` : ''}
                </p>
              </div>
            </div>
            <div style="margin-top:1rem;">
              <p style="font-size:.78rem;color:var(--text-light);margin:0 0 .4rem;">Photos (${images.length}/${MAX_PROPERTY_IMAGES}) — first photo is the cover</p>
              ${images.length ? `<div style="display:flex;gap:.45rem;flex-wrap:wrap;">${images.map((url, index) => `
                <div style="position:relative;">
                  <div class="admin-photo-skeleton" aria-hidden="true"></div>
                  <img src="${escapeDashboardHtml(url)}" alt="Photo ${index + 1}" loading="lazy" decoding="async" style="width:88px;height:64px;object-fit:cover;border-radius:7px;border:${index === 0 ? '3px solid #800000' : '1px solid #ddd'};opacity:0;" onload="this.style.opacity='1';this.previousElementSibling.style.display='none'" onerror="this.style.display='none'">
                  ${index === 0 ? '<span style="position:absolute;left:3px;bottom:3px;background:#800000;color:#fff;font-size:9px;padding:1px 4px;border-radius:3px;">COVER</span>' : ''}
            </div>`).join('')}</div>` : '<p style="font-size:.82rem;color:#888;margin:0;">No photos uploaded for this property.</p>'}
            </div>
            <div style="display:flex;gap:.45rem;flex-wrap:wrap;margin-top:1.25rem;padding-top:1rem;border-top:1px solid #f0f0f0;">
              <a class="btn btn-outline btn-sm" href="https://gonahhomes.com/property.html?id=${encodeURIComponent(docId)}" target="_blank" rel="noopener">
                Public page
              </a>
              <button class="btn btn-outline btn-sm edit-property-btn" data-doc-id="${escapeDashboardHtml(docId)}">Edit Details</button>
              <button class="btn btn-outline btn-sm toggle-property-archive-btn" data-doc-id="${escapeDashboardHtml(docId)}" data-archived="${isArchived ? 'true' : 'false'}">${isArchived ? 'Restore' : 'Archive'}</button>
            </div>
            ${features.length ? `<p style="font-size:.82rem;margin:.75rem 0 0;"><strong>Amenities:</strong> ${escapeDashboardHtml(features.join(', '))}</p>` : ''}
            ${nearby.length ? `<p style="font-size:.82rem;margin:.3rem 0 0;"><strong>Nearby:</strong> ${escapeDashboardHtml(nearby.join(', '))}</p>` : ''}
            ${property.description ? `<p style="font-size:.82rem;margin:.3rem 0 0;"><strong>Description:</strong> ${escapeDashboardHtml(property.description)}</p>` : ''}
            <p style="font-size:.82rem;margin:.3rem 0 0;"><strong>Max guests:</strong> ${Number(property.occupancy || defaultOccupancyForType(normalizePropertyType(property.type)))}</p>
            ${houseRules.length ? `<p style="font-size:.82rem;margin:.3rem 0 0;"><strong>House rules:</strong> ${escapeDashboardHtml(houseRules.join(' · '))}</p>` : ''}
          </article>
        `;
      }).join('')}
    </div>`;

  container.querySelectorAll('.edit-property-btn').forEach(button => {
    button.addEventListener('click', () => openPropertyModal(button.dataset.docId));
  });

  container.querySelectorAll('.toggle-property-archive-btn').forEach(button => {
    button.addEventListener('click', async () => {
      const docId = button.dataset.docId;
      const currentlyArchived = button.dataset.archived === 'true';
      const action = currentlyArchived ? 'restore' : 'archive';
      const propertyName = button.closest('.card')?.querySelector('h3')?.textContent?.trim() || 'this property';

      if (!docId) {
        showToast('Property ID is missing. No changes were made.', 'error');
        return;
      }

      const confirmed = window.confirm(
        currentlyArchived
          ? `Restore "${propertyName}" to the public property catalogue?`
          : `Archive "${propertyName}"? It will be hidden from customers, but its records will be preserved.`
      );
      if (!confirmed) return;

      button.disabled = true;
      try {
        await db.collection('property_settings').doc(docId).update({
          archived: !currentlyArchived,
          archivedAt: currentlyArchived ? null : firebase.firestore.FieldValue.serverTimestamp(),
          archivedBy: currentlyArchived ? null : (firebase.auth().currentUser?.email || ADMIN_EMAIL),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedBy: firebase.auth().currentUser?.email || ADMIN_EMAIL
        });

        showToast(
          currentlyArchived ? 'Property restored successfully.' : 'Property archived successfully.',
          'success'
        );
        await loadProperties();
      } catch (error) {
        console.error(`Could not ${action} property:`, error);
        showToast(`Could not ${action} property: ${error.message}`, 'error');
        button.disabled = false;
      }
    });
  });
}

function openPropertyModal(docId = '') {
  const form = document.getElementById('property-form');
  if (!form) return;
  form.reset();
  const photoPreview = document.getElementById('property-photo-preview');
  if (photoPreview) photoPreview.innerHTML = '';
  renderSeasonalRateRows([]);
  document.getElementById('property-doc-id').value = docId;
  document.getElementById('property-modal-title').innerHTML = docId
    ? '<i class="fas fa-pen"></i> Edit Property'
    : '<i class="fas fa-building"></i> Add Property';

  if (docId) {
    const fallback = propertyDefaults(docId);
    db.collection('property_settings').doc(docId).get().then(snapshot => {
      const property = snapshot.exists ? { ...fallback, ...snapshot.data() } : fallback;
      document.getElementById('property-name').value = property.name || docId;
      document.getElementById('property-description').value = property.description || '';
      const typeSelect = document.getElementById('property-type');
      const normalizedType = normalizePropertyType(property.type);
      if (property.type && !normalizedType && !Array.from(typeSelect.options).some(option => option.value === property.type)) {
        typeSelect.insertAdjacentHTML('beforeend', `<option value="${escapeDashboardHtml(property.type)}">Legacy: ${escapeDashboardHtml(property.type)}</option>`);
      }
      typeSelect.value = normalizedType || property.type || '';
      document.getElementById('property-price').value = property.price ?? '';
      const locationSelect = document.getElementById('property-location');
      const location = property.location || '';
      if (location && !Array.from(locationSelect.options).some(option => option.value === location)) {
        locationSelect.insertAdjacentHTML('beforeend', `<option value="${escapeDashboardHtml(location)}">${escapeDashboardHtml(location)}</option>`);
      }
      locationSelect.value = location;
      document.getElementById('property-location-details').value = property.locationDetails || '';
      document.getElementById('property-map-url').value = property.mapUrl || '';
      document.getElementById('property-status').value = property.status || 'available';
      document.getElementById('property-occupancy').value = Number(property.occupancy) || defaultOccupancyForType(normalizedType);
      const savedAmenities = propertyTextList(property.amenities || property.features);
      document.querySelectorAll('#property-amenities-options input[type="checkbox"]').forEach(input => {
        input.checked = savedAmenities.some(amenity => amenity.toLowerCase() === input.value.toLowerCase());
      });
      const presetAmenities = Array.from(document.querySelectorAll('#property-amenities-options input[type="checkbox"]'))
        .filter(input => input.checked).map(input => input.value.toLowerCase());
      document.getElementById('property-amenities-custom').value = savedAmenities
        .filter(amenity => !presetAmenities.includes(amenity.toLowerCase())).join(', ');
      document.getElementById('property-landmarks').value = propertyTextList(property.landmarks).join(', ');
      document.getElementById('property-house-rules').value = propertyMultilineList(property.houseRules).join('\n');
      document.getElementById('property-pricing-notes').value = property.pricingNotes || '';
      renderSeasonalRateRows(property.seasonalRates || []);
      document.getElementById('property-booking-instructions').value = property.bookingInstructions || '';
       document.getElementById('property-photo-urls').value = Array.isArray(property.images) ? property.images.slice(0, MAX_PROPERTY_IMAGES).join('\n') : '';
       renderPropertyPhotoPreview(property.images || []);
    }).catch(error => showToast('Could not load property: ' + error.message, 'error'));
  } else {
    document.getElementById('property-occupancy').value = '';
  }
  document.getElementById('property-modal').classList.add('active');
}

function closePropertyModal() {
  document.getElementById('property-modal')?.classList.remove('active');
}
function renderPropertyPhotoPreview(images) {
  const preview = document.getElementById('property-photo-preview');
  if (!preview) return;
  const values = Array.from(images || []).filter(Boolean).slice(0, MAX_PROPERTY_IMAGES);
  preview.innerHTML = values.map((image, index) => `
    <div style="position:relative;">
      <div class="admin-photo-skeleton" aria-hidden="true"></div>
      <img src="${escapeDashboardHtml(typeof image === 'string' ? image : '')}" alt="Photo preview ${index + 1}" loading="lazy" decoding="async" style="width:88px;height:64px;object-fit:cover;border-radius:7px;border:${index === 0 ? '3px solid #800000' : '1px solid #ddd'};opacity:0;" onload="this.style.opacity='1';this.previousElementSibling.style.display='none'" onerror="this.style.display='none'">
      ${index === 0 ? '<span style="position:absolute;left:3px;bottom:3px;background:#800000;color:#fff;font-size:9px;padding:1px 4px;border-radius:3px;">COVER</span>' : ''}
    </div>
  `).join('');
}
function compressPropertyImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => {
      const image = new Image();
      image.onload = () => {
        let width = image.width;
        let height = image.height;
        const maxDimension = 1200;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) { height = Math.round(height * maxDimension / width); width = maxDimension; }
          else { width = Math.round(width * maxDimension / height); height = maxDimension; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      image.onerror = reject;
      image.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadPropertyImages(files, propertyName) {
  if (!files.length) return [];
  if (!firebase.storage) throw new Error('Firebase Storage is not available.');
  const folder = String(propertyName).replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80);
  return Promise.all(files.map(async (file, index) => {
    const dataUrl = await compressPropertyImage(file);
    const fileRef = firebase.storage().ref().child(
      `properties/${folder}/${Date.now()}-${index}.jpg`
    );
    await fileRef.putString(dataUrl, 'data_url', {
      contentType: 'image/jpeg',
      cacheControl: 'public,max-age=31536000,immutable',
      customMetadata: {
        propertyName: String(propertyName),
        imageRole: index === 0 ? 'cover' : 'gallery'
      }
    });
    return fileRef.getDownloadURL();
  }));
}
function withTimeout(promise, milliseconds) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Photo upload timed out.')), milliseconds))
  ]);
}
async function savePropertyDetails() {
  const button = document.getElementById('property-submit-btn');
  const docId = document.getElementById('property-doc-id').value.trim();
  const name = document.getElementById('property-name').value.trim();
  const description = document.getElementById('property-description').value.trim();
    const type = normalizePropertyType(document.getElementById('property-type').value);
  const location = document.getElementById('property-location').value.trim();
  const price = Number(document.getElementById('property-price').value);
  if (!window.GonahPricing) {
    showToast('Pricing tools could not load. Refresh the dashboard and try again.', 'error');
    return;
  }
  const seasonalRateValidation = window.GonahPricing.validateSeasonalRates(readSeasonalRateRows());
  const seasonalError = document.getElementById('seasonal-rates-error');
  if (seasonalError) seasonalError.textContent = seasonalRateValidation.errors.join(' ');
  if (!seasonalRateValidation.valid) {
    showToast(seasonalRateValidation.errors[0], 'error');
    return;
  }
  const selectedAmenities = Array.from(document.querySelectorAll('#property-amenities-options input[type="checkbox"]:checked')).map(input => input.value);
  const customAmenities = propertyTextList(document.getElementById('property-amenities-custom').value);
  const amenities = [...new Set([...selectedAmenities, ...customAmenities])];
  const landmarks = propertyTextList(document.getElementById('property-landmarks').value);
  const occupancy = Number(document.getElementById('property-occupancy').value);
  const locationDetails = document.getElementById('property-location-details').value.trim();
  const mapUrl = document.getElementById('property-map-url').value.trim();
  const houseRules = propertyMultilineList(document.getElementById('property-house-rules').value);
  const pricingNotes = document.getElementById('property-pricing-notes').value.trim();
  const bookingInstructions = document.getElementById('property-booking-instructions').value.trim();
  const status = document.getElementById('property-status').value || 'available';
  const urls = document.getElementById('property-photo-urls').value.split(/\n+/).map(url => url.trim()).filter(url => /^https?:\/\/\S+$/i.test(url));
  const files = Array.from(document.getElementById('property-photo-files').files || []);

  if (!name || !type || !location || !Number.isFinite(price) || price < 0 || !Number.isInteger(occupancy) || occupancy < 1 || occupancy > 50) {
    showToast('Please complete the property name, type, location, price, and maximum occupancy (1–50).', 'error');
    return;
  }
  if (mapUrl && !/^https?:\/\/\S+$/i.test(mapUrl)) {
    showToast('Please enter a valid https:// map link.', 'error');
    return;
  }
  if (urls.length + files.length > MAX_PROPERTY_IMAGES) {
    showToast(`Please provide no more than ${MAX_PROPERTY_IMAGES} photos.`, 'error');
    return;
  }
  if (button) { button.disabled = true; button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }
  try {
    const propertiesSnapshot = await db.collection('property_settings').get();
    const normalizedName = name.replace(/\s+/g, ' ').trim().toLowerCase();

    const duplicate = propertiesSnapshot.docs.find(doc => {
      if (doc.id === docId) return false;
      const savedName = String(doc.data()?.name || '').replace(/\s+/g, ' ').trim().toLowerCase();
      return savedName === normalizedName;
    });

    if (duplicate) {
      showToast('A property with this name already exists. Please use a different name.', 'error');
      return;
    }

    const targetId = docId || propertyDocumentId(name);
    if (!docId && propertiesSnapshot.docs.some(doc => doc.id === targetId)) {
      showToast('This property ID is already in use. Please choose a different property name.', 'error');
      return;
    }

    const existingSnapshot = docId ? await db.collection('property_settings').doc(docId).get() : null;
    const existing = existingSnapshot?.exists ? existingSnapshot.data() : {};
    const existingImages = Array.isArray(existing.images) ? existing.images.filter(Boolean) : [];
    let uploadedImages = [];
    if (files.length) {
      button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading photos...';
      uploadedImages = await withTimeout(uploadPropertyImages(files, name), 120000);
    }
    const suppliedImages = [...urls, ...uploadedImages].slice(0, MAX_PROPERTY_IMAGES);
    const images = suppliedImages.length ? suppliedImages : existingImages;
    await db.collection('property_settings').doc(targetId).set({
      name, description, type, location, price, currency: 'KSh', perNight: true,
      locationDetails, mapUrl, occupancy,
      amenities, landmarks, houseRules, pricingNotes, seasonalRates: seasonalRateValidation.rates, bookingInstructions, images, status,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: firebase.auth().currentUser?.email || ADMIN_EMAIL
    }, { merge: true });
    closePropertyModal();
    showToast(`${name} saved successfully.`, 'success');
    loadProperties();

    if (files.length) {
      withTimeout(uploadPropertyImages(files, name), 20000).then(uploaded => {
        const images = [...(urls.length ? urls : []), ...uploaded].slice(0, MAX_PROPERTY_IMAGES);
        return db.collection('property_settings').doc(targetId).set({ images }, { merge: true });
      }).then(() => {
        showToast(`${name} photos uploaded successfully.`, 'success');
        loadProperties();
      }).catch(error => {
        showToast(`${name} was saved, but the photo upload failed: ${error.message}`, 'warning');
      });
    }
  } catch (error) {
    showToast('Error saving property or uploading photos: ' + error.message, 'error');
  } finally {
    if (button) { button.disabled = false; button.innerHTML = '<i class="fas fa-save"></i> Save Property'; }
  }
}

document.getElementById('property-photo-files')?.addEventListener('change', event => {
  const files = Array.from(event.target.files || []);
  renderPropertyPhotoPreview(files.map(file => URL.createObjectURL(file)));
});

// ===================== PAYMENT & CANCELLATION MODALS =====================
let _pendingPaymentId = null;
let _pendingCancelId = null;
let _pendingBooking = null;
let _pendingExpectedTotal = 0;
let _pendingNights = 0;
let _pendingPricingBreakdown = [];

function bookingNights(checkin, checkout) {
  if (window.GonahPricing) {
    const start = window.GonahPricing.toDateKey(checkin);
    const end = window.GonahPricing.toDateKey(checkout);
    if (start && end && end > start) {
      return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000;
    }
  }
  const nights = Math.round((new Date(checkout) - new Date(checkin)) / 86400000);
  return nights > 0 ? nights : 0;
}

async function getPropertyPricingForBooking(booking) {
  if (booking.pricingSnapshot) {
    return {
      price: Number(booking.pricingSnapshot.basePrice),
      currency: booking.pricingSnapshot.currency || booking.currency || 'KSh',
      seasonalRates: booking.pricingSnapshot.seasonalRates || []
    };
  }
  const byName = await db.collection('property_settings')
    .where('name', '==', booking.house)
    .limit(1)
    .get();
  if (!byName.empty) return byName.docs[0].data();
  const byId = await db.collection('property_settings').doc(propertyDocumentId(booking.house)).get();
  return byId.exists ? byId.data() : null;
}

function bookingPricingBreakdownHtml(lines) {
  if (!Array.isArray(lines) || !lines.length) return '';
  return `<div style="margin-top:.35rem;color:#666;font-size:.82rem;">${lines.map(line => {
    const range = line.startDate && line.endDate
      ? ` (${escapeDashboardHtml(window.GonahPricing?.formatDate(line.startDate) || line.startDate)} – ${escapeDashboardHtml(window.GonahPricing?.formatDate(line.endDate) || line.endDate)})`
      : '';
    return `<div>${escapeDashboardHtml(line.label || 'Nightly rate')}: ${Number(line.nights || 0)} night${Number(line.nights) === 1 ? '' : 's'} × ${escapeDashboardHtml(line.currency || 'KSh')} ${Number(line.pricePerNight || 0).toLocaleString('en-KE')} = ${escapeDashboardHtml(line.currency || 'KSh')} ${Number(line.total || 0).toLocaleString('en-KE')}${range}</div>`;
  }).join('')}</div>`;
}


async function loadPendingMpesaNotices() {
  const container = document.getElementById('mpesa-notice-list');
  if (!container) return;

  if (currentAdminRole !== 'primary_admin') {
    container.innerHTML = '<p>Access restricted to the Primary Admin.</p>';
    return;
  }

  container.innerHTML = '<p>Loading pending M-Pesa notices...</p>';

  try {
    const result = await firebase.functions()
      .httpsCallable('listPendingMpesaPaymentNoticesSecure')({});

    const notices = Array.isArray(result.data?.notices)
      ? result.data.notices
      : [];

    if (!notices.length) {
      container.innerHTML = '<p>No pending M-Pesa payment notices.</p>';
      return;
    }

    container.innerHTML = notices.map(n => {
      const submitted = n.submittedAt;
      let submittedText = 'Not available';

      try {
        const date = submitted?.toDate
          ? submitted.toDate()
          : new Date(submitted?.seconds
              ? submitted.seconds * 1000
              : submitted);
        if (!Number.isNaN(date.getTime())) {
          submittedText = date.toLocaleString('en-KE');
        }
      } catch (_) {}

      const amount = Number(n.expectedAmount);
      const amountText = Number.isFinite(amount)
        ? amount.toLocaleString('en-KE')
        : 'Requires review';

      return `
        <div style="background:#fff;border:1px solid #ddd;border-radius:10px;padding:1rem;margin-bottom:1rem;">
          <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;">
            <strong>Booking: ${escapeDashboardHtml(n.bookingId)}</strong>
            <strong>KSh ${amountText}</strong>
          </div>
          <p><strong>Guest email:</strong> ${escapeDashboardHtml(n.guestEmail)}</p>
          <p><strong>Payer phone:</strong> ${escapeDashboardHtml(n.payerPhone)}</p>
          <p><strong>M-Pesa code:</strong> ${escapeDashboardHtml(n.transactionCode)}</p>
          <p><strong>Payment option:</strong> ${escapeDashboardHtml(n.paymentOption)}</p>
          <p><strong>Submitted:</strong> ${escapeDashboardHtml(submittedText)}</p>
          <p style="color:#9c1c1c;font-weight:600;">
            Verify the transaction code, amount and payer phone against actual M-Pesa records before approval.
          </p>
          <div style="display:flex;gap:.6rem;flex-wrap:wrap;">
            <button class="btn btn-success btn-sm"
              onclick="verifyMpesaNotice('${n.paymentId}')">
              Verify payment
            </button>
            <button class="btn btn-danger btn-sm"
              onclick="rejectMpesaNotice('${n.paymentId}')">
              Reject notice
            </button>
          </div>
        </div>`;
    }).join('');
  } catch (error) {
    console.error('Unable to load M-Pesa notices:', error);
    container.innerHTML = '<p style="color:#b00020;">Unable to load payment notices. Please refresh and try again.</p>';
  }
}

async function verifyMpesaNotice(paymentId) {
  if (currentAdminRole !== 'primary_admin') {
    showToast('Only the Primary Admin can verify payments.', 'error');
    return;
  }

  if (!window.confirm(
    'Have you checked this transaction code, amount and payer phone against actual M-Pesa records?'
  )) return;

  const notes = window.prompt('Verification notes (optional):', '');
  if (notes === null) return;

  try {
    const result = await firebase.functions()
      .httpsCallable('verifyMpesaPaymentNoticeSecure')({
        paymentId,
        notes: notes.trim()
      });

    showToast(
      `Payment verified. Amount: KSh ${Number(result.data.amountVerified).toLocaleString('en-KE')}. Balance: KSh ${Number(result.data.balanceDue).toLocaleString('en-KE')}.`,
      'success'
    );

    await loadPendingMpesaNotices();
    loadBookings();
  } catch (error) {
    showToast('Payment verification failed: ' + (error.message || error), 'error');
  }
}

async function rejectMpesaNotice(paymentId) {
  if (currentAdminRole !== 'primary_admin') {
    showToast('Only the Primary Admin can reject payment notices.', 'error');
    return;
  }

  const reason = window.prompt('Enter the reason for rejecting this payment notice:');
  if (reason === null) return;

  if (reason.trim().length < 5) {
    showToast('Please enter a rejection reason of at least 5 characters.', 'error');
    return;
  }

  try {
    await firebase.functions()
      .httpsCallable('rejectMpesaPaymentNoticeSecure')({
        paymentId,
        reason: reason.trim()
      });

    showToast('Payment notice rejected. Booking payment details were not changed.', 'success');
    await loadPendingMpesaNotices();
  } catch (error) {
    showToast('Rejection failed: ' + (error.message || error), 'error');
  }
}

async function openCancellationModal(bookingId) {
  _pendingCancelId = bookingId;
  try {
    const snap = await db.collection('bookings').doc(bookingId).get();
    _pendingBooking = snap.data();
    const b = _pendingBooking;
    document.getElementById('cancel-modal-info').innerHTML =
      `<strong>${b.house || 'N/A'}</strong> &bull; ${b.name || ''}<br>
       <span style="color:#666;">${b.checkin || ''} → ${b.checkout || ''} &bull; ${b.email || ''}</span>`;
  } catch(_) {}
  document.getElementById('cancel-form').reset();
  document.getElementById('cancel-modal').classList.add('active');
}

function closeCancellationModal() {
  document.getElementById('cancel-modal').classList.remove('active');
  _pendingCancelId = null; _pendingBooking = null;
}

async function submitCancellation() {
  if (!_pendingCancelId) return;
  const reason = document.getElementById('cancel-reason').value.trim();
  if (!reason) { showToast('Please provide a cancellation reason.', 'error'); return; }

  const btn = document.getElementById('confirm-cancel-btn');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cancelling...';
  try {
    await firebase.functions().httpsCallable('cancelBookingSecure')({
      bookingDocId: _pendingCancelId,
      reason: reason
    });

    const b = _pendingBooking || {};
    if (b.email) {
      const msg = `We regret to inform you that your booking has been CANCELLED.\n\nBooking ID: ${_pendingCancelId}\nProperty: ${b.house}\nCheck-in: ${b.checkin}\nCheck-out: ${b.checkout}\n\nReason: ${reason}\n\nFor any queries please contact us at ${EMAIL_ADDRESSES.support} or +254 799 466 723. We apologise for the inconvenience.`;
      try {
        await emailjs.send(emailConfig.serviceId, emailConfig.clientTemplate, {
          to_name: b.name, to_email: b.email, from_name: 'Gonah Homes',
          from_email: EMAIL_ADDRESSES.support, reply_to: EMAIL_ADDRESSES.support,
          subject: `Booking Cancelled — ${_pendingCancelId}`, message: msg
        });
      } catch(e) { console.warn('Email failed:', e.message); }
    }

    showToast('Booking cancelled. Guest notified by email.', 'success');
    closeCancellationModal(); loadBookings();
  } catch(err) {
    showToast('Error cancelling: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-times-circle"></i> Cancel Booking & Notify Guest';
  }
}

// Load immutable audit records. Access is restricted by both dashboard roles
// and Firestore rules; only trusted backend functions can write these records.
async function loadDashboardActivity() {
  const container = document.getElementById('dashboard-activity-list');
  if (!container) return;

  if (!['primary_admin', 'admin'].includes(currentAdminRole)) {
    container.textContent = 'You do not have permission to view activity records.';
    return;
  }

  container.textContent = 'Loading activity records...';

  try {
    const snapshot = await db.collection('dashboard_activity')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    container.replaceChildren();

    if (snapshot.empty) {
      container.textContent = 'No activity records have been recorded yet.';
      return;
    }

    snapshot.forEach(doc => {
      const item = doc.data() || {};
      const card = document.createElement('div');
      card.style.cssText = 'padding:1rem;margin-bottom:.75rem;border:1px solid #e5e5e5;border-radius:8px;background:#fff;';

      const heading = document.createElement('strong');
      heading.textContent = String(item.action || 'Activity').replace(/_/g, ' ').toUpperCase();
      card.appendChild(heading);

      const details = [
        ['Actor', item.actorEmail || 'Unknown'],
        ['Role', item.actorRole || 'N/A'],
        ['Record', item.bookingId || item.bookingDocId || item.entityType || 'N/A'],
        ['Guest', item.guestName || 'N/A'],
        ['Previous status', item.previousStatus || 'N/A'],
        ['Reason / details', item.reason || item.details || 'N/A']
      ];

      details.forEach(([label, value]) => {
        const line = document.createElement('p');
        line.style.cssText = 'margin:.4rem 0;color:#555;overflow-wrap:anywhere;';
        const labelNode = document.createElement('strong');
        labelNode.textContent = label + ': ';
        line.appendChild(labelNode);
        line.appendChild(document.createTextNode(String(value)));
        card.appendChild(line);
      });

      const time = document.createElement('p');
      time.style.cssText = 'margin:.5rem 0 0;color:#888;font-size:.85rem;';
      let dateText = 'Time unavailable';
      if (item.createdAt && typeof item.createdAt.toDate === 'function') {
        dateText = item.createdAt.toDate().toLocaleString();
      }
      time.textContent = 'Recorded: ' + dateText;
      card.appendChild(time);

      container.appendChild(card);
    });
  } catch (error) {
    console.error('Activity log loading failed:', error);
    container.textContent = 'Unable to load activity records. Check your access and connection.';
  }
}

// ===================== SECTION SWITCHING =====================
function switchSection(sectionName) {
  if (!canAccessSection(sectionName)) {
    showToast('You do not have permission to access this section.', 'error');
    return;
  }

  const targetSection = document.getElementById(`${sectionName}-section`);
  const targetLink = document.querySelector(`[data-section="${sectionName}"]`);

  if (!targetSection || !targetLink) {
    showToast('Section not found.', 'error');
    return;
  }

  document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
  targetLink.classList.add('active');

  document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
  targetSection.classList.add('active');

  const titles = {
    overview: 'Dashboard Overview',
    bookings: 'Booking Management',
    messages: 'Message Management',
    'service-requests': 'Service Requests',
    reviews: 'Review Management',
    analytics: 'Analytics & Reports',
    announcements: 'Announcements & Offers',
    clients: 'Client Management',
    documents: 'Guest ID Documents',
    staff: 'Staff Accounts',
    properties: 'Property Management',
    settings: 'System Settings',
    'activity-log': 'Dashboard Activity Log',
    'mpesa-verification': 'M-Pesa Payment Verification'
  };

  document.getElementById('page-title').textContent = titles[sectionName] || sectionName;

  if (sectionName === 'staff') loadStaff();
  if (sectionName === 'properties') loadProperties();
  if (sectionName === 'activity-log') loadDashboardActivity();
  if (sectionName === 'mpesa-verification') loadPendingMpesaNotices();

  currentSection = sectionName;
}

function updateStats() {
  loadStats();
}

// Event listeners
function setSidebarOpen(open) {
  const sidebar = document.querySelector('.sidebar');
  const toggle = document.getElementById('menu-toggle');
  const icon = toggle?.querySelector('i');

  if (!sidebar || !toggle) return;

  sidebar.classList.toggle('active', open);
  toggle.setAttribute('aria-expanded', String(open));

  if (icon) {
    icon.classList.toggle('fa-bars', !open);
    icon.classList.toggle('fa-times', open);
  }
}

function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) setSidebarOpen(!sidebar.classList.contains('active'));
}

// Close the floating menu when clicking outside it on any screen
document.addEventListener('click', function(e) {
  const sidebar = document.querySelector('.sidebar');
  const toggle = document.getElementById('menu-toggle');

  if (!sidebar || !toggle || !sidebar.classList.contains('active')) return;

  if (!sidebar.contains(e.target) && !toggle.contains(e.target)) {
    setSidebarOpen(false);
  }
});

document.addEventListener('DOMContentLoaded', function() {
  const recordDetailModal = document.getElementById('record-detail-modal');
  recordDetailModal?.addEventListener('click', function(e) {
    if (e.target === recordDetailModal) closeRecordDetail();
  });

  // Login form
  document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    await login(username, password);
  });

  // Navigation
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const section = this.getAttribute('data-section');
      switchSection(section);
      // Close the floating menu after navigation on every screen
      setSidebarOpen(false);
    });
  });
  
  // Announcement form
  document.getElementById('announcement-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const formData = {
      title: document.getElementById('announcement-title').value,
      type: document.getElementById('announcement-type').value,
      message: document.getElementById('announcement-message').value,
      validUntil: document.getElementById('announcement-expiry').value,
      active: document.getElementById('announcement-active').checked
    };
    createAnnouncement(formData);
  });
  
  // Close modals when clicking outside
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });
  });
  
  // Search and filter functionality
  document.getElementById('booking-search').addEventListener('input', filterBookings);
  document.getElementById('booking-status-filter').addEventListener('change', filterBookings);
  document.getElementById('message-search').addEventListener('input', filterMessages);
  document.getElementById('service-request-search').addEventListener('input', filterServiceRequests);
  document.getElementById('rating-filter').addEventListener('change', filterReviews);
  document.getElementById('client-search').addEventListener('input', filterClients);
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && document.getElementById('record-detail-modal')?.classList.contains('active')) {
    closeRecordDetail();
  }
});

// Filter functions
function filterBookings() {
  const search = document.getElementById('booking-search').value.toLowerCase();
  const status = document.getElementById('booking-status-filter').value;
  
  const rows = document.querySelectorAll('#bookings-table tr');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    const statusSpan = row.querySelector('.status');
    const rowStatus = statusSpan ? statusSpan.textContent.toLowerCase() : '';
    
    const matchesSearch = text.includes(search);
    const matchesStatus = !status || status === 'archived' || rowStatus.includes(status);
    
    row.style.display = matchesSearch && matchesStatus ? '' : 'none';
  });
}

function filterMessages() {
  const search = document.getElementById('message-search').value.toLowerCase();
  
  const messages = document.querySelectorAll('.message-item');
  messages.forEach(message => {
    const text = message.textContent.toLowerCase();
    message.style.display = text.includes(search) ? '' : 'none';
  });
}

function filterServiceRequests() {
  const search = document.getElementById('service-request-search').value.toLowerCase();
  document.querySelectorAll('#service-requests-list .message-item').forEach(item => {
    item.style.display = item.textContent.toLowerCase().includes(search) ? '' : 'none';
  });
}

function filterReviews() {
  const rating = document.getElementById('rating-filter').value;
  
  const reviews = document.querySelectorAll('.review-card');
  reviews.forEach(review => {
    const stars = review.querySelectorAll('.review-rating');
    if (stars.length > 0) {
      const reviewRating = (stars[0].textContent.match(/★/g) || []).length;
      review.style.display = !rating || reviewRating.toString() === rating ? '' : 'none';
    }
  });
}

function filterClients() {
  const search = document.getElementById('client-search').value.toLowerCase();
  
  const clients = document.querySelectorAll('.client-card');
  clients.forEach(client => {
    const text = client.textContent.toLowerCase();
    client.style.display = text.includes(search) ? '' : 'none';
  });
}

console.log('Gonah Homes Backend Dashboard initialized successfully!');

// ---- Analytics & Reports (fills the four report cards) ----
const analyticsCharts = {};

function analyticsEsc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

function analyticsNights(b) {
  const nights = Math.round((new Date(b.checkout) - new Date(b.checkin)) / 86400000);
  return nights > 0 ? nights : 0;
}

function analyticsEstimate(b) {
  if (String(b.status || '').toLowerCase() !== 'confirmed') return 0;
  const paid = Number(b.amountPaid);
  return Number.isFinite(paid) && paid > 0 ? paid : 0;
}

function analyticsInRange(b, start, end) {
  if (!start && !end) return true;
  const d = new Date(b.checkin);
  if (isNaN(d)) return false;
  if (start && d < new Date(start)) return false;
  if (end && d > new Date(end + 'T23:59:59')) return false;
  return true;
}

function renderTopProperties(list) {
  const el = document.getElementById('top-properties');
  if (!el) return;
  const map = {};
  list.forEach(b => {
    const key = b.house || 'Unknown';
    map[key] = map[key] || { count: 0, revenue: 0 };
    map[key].count++;
    map[key].revenue += analyticsEstimate(b);
  });
  const rows = Object.entries(map).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
  el.innerHTML = rows.length ? rows.map(([name, v], i) =>
    '<div style="display:flex;justify-content:space-between;gap:0.5rem;padding:0.5rem 0;border-bottom:1px solid var(--border-color);">' +
    '<span>' + (i + 1) + '. ' + analyticsEsc(name) + '</span>' +
    '<span style="text-align:right;"><strong>' + v.count + '</strong> booking' + (v.count === 1 ? '' : 's') +
    '<br><small>Est. KSh ' + v.revenue.toLocaleString() + '</small></span></div>'
  ).join('') : '<p style="color:var(--text-light);">No bookings in this period.</p>';
}

function renderFrequentClients(list) {
  const el = document.getElementById('frequent-clients');
  if (!el) return;
  const map = {};
  list.forEach(b => {
    const key = ((b.email || b.phone || '') + '').trim().toLowerCase();
    if (!key) return;
    map[key] = map[key] || { name: b.name || 'Guest', count: 0 };
    map[key].count++;
  });
  const rows = Object.values(map).filter(v => v.count > 1).sort((a, b) => b.count - a.count).slice(0, 5);
  el.innerHTML = rows.length ? rows.map(v =>
    '<div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid var(--border-color);">' +
    '<span>' + analyticsEsc(v.name) + '</span><strong>' + v.count + ' bookings</strong></div>'
  ).join('') : '<p style="color:var(--text-light);">No repeat guests in this period.</p>';
}

function drawAnalyticsChart(key, canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;
  if (analyticsCharts[key]) analyticsCharts[key].destroy();
  analyticsCharts[key] = new Chart(canvas, config);
}

async function updateAnalytics() {
  try {
    const start = (document.getElementById('start-date') || {}).value || '';
    const end = (document.getElementById('end-date') || {}).value || '';
    const snapshot = await db.collection('bookings').get();
    const list = [];
    snapshot.forEach(doc => {
      const b = doc.data() || {};
      if (b.status === 'cancelled') return;
      if (analyticsInRange(b, start, end)) list.push(b);
    });

    renderTopProperties(list);
    renderFrequentClients(list);

    const months = {};
    const revenue = {};
    list.forEach(b => {
      const d = new Date(b.checkin);
      if (!isNaN(d)) {
        const m = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        months[m] = (months[m] || 0) + 1;
      }
      const name = b.house || 'Unknown';
      revenue[name] = (revenue[name] || 0) + analyticsEstimate(b);
    });
    const monthKeys = Object.keys(months).sort().slice(-12);

    drawAnalyticsChart('monthly', 'monthlyChart', {
      type: 'bar',
      data: { labels: monthKeys, datasets: [{ label: 'Bookings', data: monthKeys.map(k => months[k]), backgroundColor: '#800000' }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });

    drawAnalyticsChart('revenue', 'revenueChart', {
      type: 'doughnut',
      data: { labels: Object.keys(revenue), datasets: [{ data: Object.values(revenue) }] },
      options: { responsive: true, plugins: { legend: { position: 'bottom' }, title: { display: true, text: 'Estimated revenue (KSh)' } } }
    });
  } catch (error) {
    console.error('Error updating analytics:', error);
  }
}
window.updateAnalytics = updateAnalytics;

(function hookAnalyticsNav() {
  const attach = () => {
    const link = document.querySelector('[data-section="analytics"]');
    if (link) link.addEventListener('click', () => setTimeout(updateAnalytics, 250));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
})();

// ---- Booking archive (bulk archive / restore, nothing is deleted) ----
function bookingLocalDate(value) {
  if (!value) return null;
  let d;
  if (typeof value.toDate === 'function') d = value.toDate();
  else {
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(value);
  }
  return isNaN(d) ? null : d;
}

function bookingArchiveBlockReason(b) {
  const ci = bookingLocalDate(b.checkin);
  const co = bookingLocalDate(b.checkout);
  if (!ci || !co) return 'Dates unreadable';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (ci <= today && today <= co) return 'Stay in progress';
  const status = String(b.status || 'pending').toLowerCase();
  if (ci > today && status !== 'cancelled') return 'Upcoming booking';
  return '';
}

function bookingViewIsArchived() {
  const f = document.getElementById('booking-status-filter');
  return !!f && f.value === 'archived';
}

function ensureBookingArchiveUi() {
  const filter = document.getElementById('booking-status-filter');
  if (filter && !filter.querySelector('option[value="archived"]')) {
    const opt = document.createElement('option');
    opt.value = 'archived';
    opt.textContent = 'Archived bookings';
    filter.appendChild(opt);
  }
  if (filter && !filter.dataset.archiveHooked) {
    filter.dataset.archiveHooked = '1';
    filter.addEventListener('change', () => { loadBookings(); });
  }
  const container = document.querySelector('#bookings-section .table-container');
  if (container && !document.getElementById('bk-toolbar')) {
    const bar = document.createElement('div');
    bar.id = 'bk-toolbar';
    bar.style.cssText = 'display:flex;gap:0.6rem;align-items:center;flex-wrap:wrap;margin:0.75rem 0 0.25rem;';
    bar.innerHTML = '<button id="bk-action-btn" class="btn btn-outline btn-sm" type="button" disabled>Archive selected</button>' +
      '<span id="bk-count" style="font-size:0.85rem;color:var(--text-light);"></span>' +
      '<small style="flex-basis:100%;color:var(--text-light);">Running and upcoming bookings cannot be archived. Archived bookings are hidden, not deleted: pick "Archived bookings" in the status filter to restore them.</small>';
    container.parentNode.insertBefore(bar, container);
    document.getElementById('bk-action-btn').addEventListener('click', runBookingArchiveAction);
  }
  const headRow = document.querySelector('#bookings-section thead tr');
  if (headRow && !headRow.querySelector('.bk-select-th')) {
    const th = document.createElement('th');
    th.className = 'bk-select-th';
    th.style.width = '2.5rem';
    const all = document.createElement('input');
    all.type = 'checkbox';
    all.id = 'bk-select-all';
    all.title = 'Select all';
    all.style.cssText = 'width:1.1rem;height:1.1rem;';
    all.addEventListener('change', () => {
      document.querySelectorAll('#bookings-table tr').forEach(row => {
        const cb = row.querySelector('.bk-select');
        if (cb && !cb.disabled && row.style.display !== 'none') cb.checked = all.checked;
      });
      updateBookingSelectionCount();
    });
    th.appendChild(all);
    headRow.insertBefore(th, headRow.firstChild);
  }
}

function updateBookingSelectionCount() {
  const btn = document.getElementById('bk-action-btn');
  const label = document.getElementById('bk-count');
  if (!btn) return;
  const n = document.querySelectorAll('#bookings-table .bk-select:checked').length;
  btn.textContent = bookingViewIsArchived() ? 'Restore selected' : 'Archive selected';
  btn.disabled = n === 0;
  if (label) label.textContent = n ? n + ' selected' : '';
}

function decorateBookingRows() {
  const tbody = document.getElementById('bookings-table');
  if (!tbody) return;
  ensureBookingArchiveUi();
  const archivedView = bookingViewIsArchived();
  const all = document.getElementById('bk-select-all');
  if (all) all.checked = false;
  let shown = 0;
  Array.from(tbody.querySelectorAll('tr')).forEach(row => {
    const m = row.innerHTML.match(/openBookingDetails\('([^']+)'\)/);
    if (!m) return;
    const id = m[1];
    const b = adminBookingCache.get(id) || {};
    if (!!b.archived !== archivedView) { row.remove(); return; }
    shown++;
    if (!row.querySelector('.bk-select-cell')) {
      const td = document.createElement('td');
      td.className = 'bk-select-cell';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'bk-select';
      cb.value = id;
      cb.style.cssText = 'width:1.1rem;height:1.1rem;';
      const reason = archivedView ? '' : bookingArchiveBlockReason(b);
      if (reason) { cb.disabled = true; td.title = reason; }
      cb.addEventListener('change', updateBookingSelectionCount);
      td.appendChild(cb);
      row.insertBefore(td, row.firstChild);
    }
  });
  if (!shown) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">' + (archivedView ? 'No archived bookings.' : 'No bookings to show.') + '</td></tr>';
  }
  updateBookingSelectionCount();
  if (typeof filterBookings === 'function') filterBookings();
}

async function runBookingArchiveAction() {
  const archivedView = bookingViewIsArchived();
  const ids = Array.from(
    document.querySelectorAll('#bookings-table .bk-select:checked')
  ).map(cb => cb.value);

  if (!ids.length) return;

  const verb = archivedView ? 'Restore' : 'Archive';
  const msg = verb + ' ' + ids.length + ' selected booking' +
    (ids.length === 1 ? '' : 's') + '?' +
    (archivedView
      ? '\n\nRestored bookings will return to the active bookings list.'
      : '\n\nBookings will be hidden from this list, not deleted. You can restore them from the "Archived bookings" view.');

  if (!confirm(msg)) return;

  const btn = document.getElementById('bk-action-btn');
  if (btn) btn.disabled = true;

  try {
    const callable = firebase.functions().httpsCallable(
      'manageBookingArchiveSecure'
    );

    const response = await callable({
      action: archivedView ? 'restore' : 'archive',
      bookingDocIds: ids
    });

    const result = response.data || {};
    await loadBookings();

    const updated = Number(result.updatedCount || 0);
    const skipped = Number(result.skippedCount || 0);

    showToast(
      updated + ' booking(s) ' +
      (archivedView ? 'restored' : 'archived') +
      (skipped ? '; ' + skipped + ' skipped.' : '.'),
      updated ? 'success' : 'info'
    );

    if (Array.isArray(result.skipped) && result.skipped.length) {
      console.warn('Archive/restore skipped bookings:', result.skipped);
    }
  } catch (error) {
    console.error('Archive/restore action failed:', error);
    alert('Could not update bookings: ' + (error.message || error));
  } finally {
    if (btn) btn.disabled = false;
    updateBookingSelectionCount();
  }
}

const loadBookingsOriginal = loadBookings;
loadBookings = async function () {
  await loadBookingsOriginal.apply(this, arguments);
  try { decorateBookingRows(); } catch (e) { console.warn('Booking archive UI failed:', e.message); }
};

// ---- Display status: expired / awaiting completion (display only, data unchanged) ----
function bookingDisplayStatus(b) {
  const status = String(b.status || 'pending').toLowerCase();
  const ci = bookingLocalDate(b.checkin);
  const co = bookingLocalDate(b.checkout);
  if (!ci || !co) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (status === 'pending' && ci < today) {
    return { text: 'EXPIRED', cls: 'status-expired', tip: 'Check-in date passed without confirmation' };
  }
  if (status === 'confirmed' && co < today) {
    return { text: 'AWAITING COMPLETION', cls: 'status-awaiting', tip: 'Check-out date has passed; mark as completed' };
  }
  return null;
}

function applyDisplayStatuses() {
  const filter = document.getElementById('booking-status-filter');
  if (filter && !filter.querySelector('option[value="expired"]')) {
    const opt = document.createElement('option');
    opt.value = 'expired';
    opt.textContent = 'Expired';
    filter.insertBefore(opt, filter.querySelector('option[value="archived"]') || null);
  }
  document.querySelectorAll('#bookings-table tr').forEach(row => {
    const m = row.innerHTML.match(/openBookingDetails\('([^']+)'\)/);
    const span = row.querySelector('.status');
    if (!m || !span) return;
    const b = adminBookingCache.get(m[1]);
    if (!b) return;
    const d = bookingDisplayStatus(b);
    if (!d) return;
    span.textContent = d.text;
    span.className = 'status ' + d.cls;
    span.title = d.tip;
  });
  if (typeof filterBookings === 'function') filterBookings();
}

const loadBookingsStatusStep = loadBookings;
loadBookings = async function () {
  await loadBookingsStatusStep.apply(this, arguments);
  try { applyDisplayStatuses(); } catch (e) { console.warn('Display statuses failed:', e.message); }
};


// ---- Receipt tools (download / WhatsApp / in-app) ----
function _receiptBooking(docId) {
  const b = adminBookingCache.get(docId);
  if (!b) { showToast('Booking not loaded. Refresh the dashboard and try again.', 'error'); return null; }
  return b;
}
function receiptDownloadAdmin(docId) {
  const b = _receiptBooking(docId); if (!b) return;
  if (!window.GonahReceipt) { showToast('Receipt tools could not load. Refresh and try again.', 'error'); return; }
  window.GonahReceipt.open(docId, Object.assign({ id: b.id || docId.substring(0, 8) }, b));
}
function _kenyaPhone(raw) {
  let d = String(raw || '').replace(/[^0-9]/g, '');
  if (d.startsWith('0') && d.length === 10) d = '254' + d.slice(1);
  else if (d.length === 9 && /^[17]/.test(d)) d = '254' + d;
  return /^254[17][0-9]{8}$/.test(d) ? d : '';
}
function receiptWhatsAppAdmin(docId) {
  const b = _receiptBooking(docId); if (!b) return;
  const phone = _kenyaPhone(b.phone);
  if (!phone) { showToast('This guest has no valid phone number, so WhatsApp was not opened.', 'error'); return; }
  const ref = b.id || docId.substring(0, 8);
  const paid = Number(b.amountPaid || b.total || 0).toLocaleString();
  const msg = 'Hello ' + (b.name || 'there') + ', thank you for choosing Gonah Homes. Your booking ' + ref +
    ' for ' + (b.house || 'your stay') + ' (' + (b.checkin || '') + ' to ' + (b.checkout || '') + ') is confirmed. Amount paid: KSh ' + paid +
    '. You can download your receipt any time from your account at gonahhomes.com. Karibu Mombasa!';
  window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(msg), '_blank');
  db.collection('receipt_log').add({ booking: docId, channel: 'whatsapp', at: firebase.firestore.FieldValue.serverTimestamp(), by: (firebase.auth().currentUser || {}).email || '' }).catch(() => {});
}
async function receiptInAppAdmin(docId) {
  const b = _receiptBooking(docId); if (!b) return;
  try {
    await db.collection('bookings').doc(docId).update({ receiptSentAt: firebase.firestore.FieldValue.serverTimestamp() });
    db.collection('receipt_log').add({ booking: docId, channel: 'in-app', at: firebase.firestore.FieldValue.serverTimestamp(), by: (firebase.auth().currentUser || {}).email || '' }).catch(() => {});
    showToast('Receipt marked as sent in the guest account.', 'success');
  } catch (e) { showToast('Could not mark the receipt as sent.', 'error'); }
}

// GONAH HOMES — CUSTOM BOOKING STATUS DROPDOWN
document.addEventListener('DOMContentLoaded', function () {
  const original = document.getElementById('booking-status-filter');
  if (!original || original.dataset.customDropdownReady) return;

  original.dataset.customDropdownReady = '1';

  const wrapper = document.createElement('div');
  wrapper.className = 'gonah-select';
  wrapper.innerHTML = `
    <button type="button" class="gonah-select-trigger"
      aria-haspopup="listbox" aria-expanded="false">
      <span class="gonah-select-value">All Status</span>
      <i class="fas fa-chevron-down"></i>
    </button>
    <div class="gonah-select-menu" role="listbox" hidden></div>
  `;

  original.parentNode.insertBefore(wrapper, original);
  original.classList.add('gonah-native-select-hidden');

  const trigger = wrapper.querySelector('.gonah-select-trigger');
  const valueText = wrapper.querySelector('.gonah-select-value');
  const menu = wrapper.querySelector('.gonah-select-menu');

  function syncOptions() {
    menu.innerHTML = '';

    Array.from(original.options).forEach(option => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'gonah-select-option';
      item.textContent = option.textContent;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(option.value === original.value));

      if (option.value === original.value) item.classList.add('selected');

      item.addEventListener('click', function () {
        original.value = option.value;
        original.dispatchEvent(new Event('change', { bubbles: true }));
        closeMenu();
        syncOptions();
      });

      menu.appendChild(item);
    });

    const selected = original.options[original.selectedIndex];
    valueText.textContent = selected ? selected.textContent : 'All Status';
  }

  function openMenu() {
    syncOptions();
    menu.hidden = false;
    wrapper.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    menu.hidden = true;
    wrapper.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
  }

  trigger.addEventListener('click', function () {
    if (menu.hidden) openMenu();
    else closeMenu();
  });

  original.addEventListener('change', syncOptions);

  document.addEventListener('click', function (event) {
    if (!wrapper.contains(event.target)) closeMenu();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeMenu();
  });

  new MutationObserver(syncOptions).observe(original, {
    childList: true
  });

  syncOptions();
});
