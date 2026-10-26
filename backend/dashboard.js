
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
let currentAdminRole = 'admin';
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
async function login(email, password) {
  const loginBtn = document.querySelector('#login-form button[type="submit"]');
  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
  }
  try {
    const result = await firebase.auth().signInWithEmailAndPassword(email, password);
    let role = 'admin';
    try {
      const staffDoc = await db.collection('staff_accounts').doc(result.user.uid).get();
      if (staffDoc.exists) {
        role = staffDoc.data().role || 'admin';
      } else if (!isPrimaryAdminEmail(result.user.email)) {
        await firebase.auth().signOut();
        showToast('Access denied — contact the administrator.', 'error');
        return false;
      }
    } catch (_) {
      if (!isPrimaryAdminEmail(result.user.email)) {
        await firebase.auth().signOut();
        showToast('Access denied.', 'error');
        return false;
      }
    }
    currentAdminRole = role;
    document.getElementById('login-modal').classList.remove('active');
    document.getElementById('dashboard').classList.remove('hidden');
    if (!dashboardInitialized) { initializeDashboard(); dashboardInitialized = true; }
    return true;
  } catch (error) {
    const msgs = {
      'auth/user-not-found': 'No account found with that email.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/invalid-email': 'Invalid email address.',
      'auth/too-many-requests': 'Too many sign-in attempts — try again later.',
      'auth/invalid-credential': 'Invalid email or password.'
    };
    showToast(msgs[error.code] || 'Login failed. Please check your credentials.', 'error');
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
    if (user) {
      try {
        const staffDoc = await db.collection('staff_accounts').doc(user.uid).get();
        if (!staffDoc.exists && !isPrimaryAdminEmail(user.email)) {
          firebase.auth().signOut();
          return;
        }
        if (staffDoc.exists) currentAdminRole = staffDoc.data().role || 'admin';
      } catch (_) {}
      document.getElementById('login-modal')?.classList.remove('active');
      document.getElementById('dashboard')?.classList.remove('hidden');
      if (!dashboardInitialized) { initializeDashboard(); dashboardInitialized = true; }
    }
  });
}

checkLoginStatus();

function logout() {
  stopRealTimeListeners();
  firebase.auth().signOut().then(() => {
    dashboardInitialized = false;
    document.getElementById('login-modal').classList.add('active');
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('login-form').reset();
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
function applyRoleRestrictions() {
  const isPrimaryAdmin = isPrimaryAdminEmail(firebase.auth().currentUser?.email);
  const staffLink = document.querySelector('[data-section="staff"]');
  if (staffLink) staffLink.style.display = isPrimaryAdmin ? '' : 'none';
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
    const monthlyRevenue = totalBookings * 5000; // Example calculation

    document.getElementById('total-bookings').textContent = totalBookings;
    document.getElementById('unread-messages').textContent = unreadMessages;
    document.getElementById('avg-rating').textContent = avgRating.toFixed(1);
    document.getElementById('monthly-revenue').textContent = `KSh ${monthlyRevenue.toLocaleString()}`;
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

// Load bookings
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
        <td style="font-family:monospace;font-size:0.82rem;">${bookingId}</td>
        <td>
          <strong>${booking.name || 'N/A'}</strong><br>
          <small>${booking.email || ''}</small><br>
          <small>${booking.phone || ''}</small>
        </td>
        <td>${booking.house || 'N/A'}</td>
        <td>${booking.checkin || 'N/A'}</td>
        <td>${booking.checkout || 'N/A'}</td>
        <td>
          <span class="status status-${booking.status || 'pending'}">${(booking.status || 'pending').toUpperCase()}</span>
          ${booking.paymentMethod ? `<br><small style="color:#2e7d32;font-size:0.75rem;"><i class="fas fa-check-circle"></i> ${booking.paymentMethod} · ${booking.transactionRef || ''}</small>` : ''}
          ${booking.cancellationReason ? `<br><small style="color:#c62828;font-size:0.75rem;" title="${booking.cancellationReason}"><i class="fas fa-times-circle"></i> ${booking.cancellationReason.substring(0,35)}${booking.cancellationReason.length>35?'...':''}</small>` : ''}
        </td>
        <td><button class="btn btn-sm btn-outline" onclick="viewUserDocs('${bookingId}')"><i class="fas fa-id-card"></i> View IDs</button></td>
        <td style="white-space:nowrap;display:flex;flex-direction:column;gap:0.3rem;padding:0.5rem;">
          ${booking.status === 'confirmed' || booking.status === 'completed' ? `<button class="btn btn-outline btn-sm" onclick="receiptDownloadAdmin('${doc.id}')"><i class="fas fa-file-download"></i> Receipt</button><button class="btn btn-outline btn-sm" onclick="receiptWhatsAppAdmin('${doc.id}')"><i class="fab fa-whatsapp"></i> WhatsApp</button><button class="btn btn-outline btn-sm" onclick="receiptInAppAdmin('${doc.id}')"><i class="fas fa-bell"></i> In-app</button>` : ''}
          <button class="btn btn-outline btn-sm" onclick="openBookingDetails('${doc.id}')"><i class="fas fa-eye"></i> View</button>
          ${booking.status !== 'confirmed' && booking.status !== 'cancelled' && booking.status !== 'completed' ?
            `<button class="btn btn-success btn-sm" onclick="openPaymentModal('${doc.id}')"><i class="fas fa-check"></i> Confirm</button>` : ''}
          ${booking.status !== 'cancelled' && booking.status !== 'completed' ?
            `<button class="btn btn-danger btn-sm" onclick="openCancellationModal('${doc.id}')"><i class="fas fa-times"></i> Cancel</button>` : ''}
          ${booking.status === 'confirmed' ?
            `<button class="btn btn-outline btn-sm" onclick="updateBookingStatus('${doc.id}', 'completed')"><i class="fas fa-flag-checkered"></i> Complete</button>` : ''}
        </td>
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
    actions.push(`<button class="btn btn-success" onclick="closeRecordDetail(); openPaymentModal('${escapeDashboardHtml(bookingDocId)}')"><i class="fas fa-check"></i> Confirm Booking</button>`);
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
    await db.collection('bookings').doc(bookingId).update({
      status: status,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
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
    
    // Write in-app notification to Firestore
    try {
      await db.collection('admin_notifications').add({
        type: 'booking_' + status,
        bookingId: bookingId,
        house: booking.house || '',
        guestName: booking.name || '',
        guestEmail: booking.email || '',
        message: `Booking ${bookingId} (${booking.house || 'N/A'}) marked as ${status} for ${booking.name || 'guest'}`,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        read: false
      });
    } catch (_) {}

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
        <div class="review-header">
          <div style="flex:1;">
            <strong>${guestName}</strong>
            ${guestEmail ? `<div style="font-size:0.8rem;color:var(--text-light);">${guestEmail}</div>` : ''}
            <div class="review-rating" style="margin-top:0.25rem;">${stars}</div>
            <span style="display:inline-block;margin-top:0.35rem;background:${verificationLabel === 'Visitor review' ? '#fff8e1' : '#e8f5e9'};color:${verificationLabel === 'Visitor review' ? '#e65100' : '#2e7d32'};padding:2px 8px;border-radius:12px;font-size:0.72rem;font-weight:600;">${verificationLabel}</span>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.4rem;flex-shrink:0;">
            <span style="background:${isApproved ? '#e8f5e9' : '#fce4ec'};color:${isApproved ? '#2e7d32' : '#b71c1c'};padding:2px 10px;border-radius:12px;font-size:0.75rem;font-weight:600;white-space:nowrap;">
              ${isApproved ? '✓ Visible to guests' : '🚫 Hidden from guests'}
            </span>
            <div style="display:flex;gap:0.3rem;flex-wrap:wrap;justify-content:flex-end;">
              <button class="btn ${isApproved ? 'btn-warning' : 'btn-success'} btn-sm" onclick="toggleReviewVisibility('${doc.id}', ${isApproved})"><i class="fas fa-eye${isApproved ? '-slash' : ''}"></i> ${isApproved ? 'Hide' : 'Show'}</button>
              <button class="btn btn-info btn-sm" onclick="replyToReview('${doc.id}', '${safeEmail}', '${safeName}')"><i class="fas fa-reply"></i> Reply</button>
              <button class="btn btn-danger btn-sm" onclick="deleteReview('${doc.id}')"><i class="fas fa-trash"></i> Delete</button>
            </div>
          </div>
        </div>
        <p style="margin:0.75rem 0;line-height:1.5;">${review.review || ''}</p>
        ${review.imageUrl ? `<div style="margin:0.5rem 0;"><img src="${review.imageUrl}" alt="Review image" style="max-width:100%;max-height:200px;object-fit:cover;border-radius:8px;"></div>` : ''}
        <small style="color: var(--text-light);">
          ${review.property ? `<strong>${review.property}</strong> · ` : ''}
          ${review.timestamp ? new Date(review.timestamp.toDate()).toLocaleDateString() : 'Unknown date'}
        </small>
        ${review.adminReply ? `
          <div style="margin-top: 1rem; padding: 1rem; background: var(--bg-color); border-radius: var(--border-radius); border-left: 3px solid var(--primary-color);">
            <strong>Management Reply:</strong><br>${review.adminReply}
          </div>
        ` : ''}
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
    let totalRevenue = 0;

    snapshot.forEach(doc => {
      const b = doc.data();
      if (b.status === 'cancelled') return;
      if (b.timestamp) monthCounts[new Date(b.timestamp.toDate()).getMonth()]++;
      if (b.house && propMap.hasOwnProperty(b.house)) propMap[b.house]++;
      const paid = Number(b.amountPaid);
      const bookedTotal = Number(b.total);
      totalRevenue += Number.isFinite(paid) && paid > 0
        ? paid
        : (Number.isFinite(bookedTotal) && bookedTotal > 0 ? bookedTotal : 0);
    });

    if (charts.bookingsChart) {
      charts.bookingsChart.data.datasets[0].data = monthCounts;
      charts.bookingsChart.update();
    }

    if (charts.propertiesChart) {
      charts.propertiesChart.data.datasets[0].data = Object.values(propMap);
      charts.propertiesChart.update();
    }

    const revenueEl = document.getElementById('monthly-revenue');
    if (revenueEl) revenueEl.textContent = `KSh ${totalRevenue.toLocaleString()}`;
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
  const email = document.getElementById('staff-email').value.trim();
  const password = document.getElementById('staff-password').value;
  const displayName = document.getElementById('staff-name').value.trim();
  const role = document.getElementById('staff-role').value;

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
        return `
          <article class="card" style="padding:1.25rem 1.5rem;">
            <div style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap;">
              <div>
                <h3 style="margin:0 0 .25rem;">${escapeDashboardHtml(property.name)}
                  <span class="status ${propertyStatus === 'maintenance' ? 'status-cancelled' : 'status-confirmed'}" style="margin-left:.4rem;">${propertyStatus === 'maintenance' ? 'MAINTENANCE' : 'AVAILABLE'}</span>
                </h3>
                <p style="font-size:.84rem;color:var(--text-light);margin:0;">
                  ${escapeDashboardHtml(property.type || 'Property')} ${property.location ? ` • ${escapeDashboardHtml(property.location)}` : ''}
                  ${property.price !== undefined ? ` • KSh ${Number(property.price || 0).toLocaleString()}/night` : ''}
                  ${seasonalRateCount ? ` • ${seasonalRateCount} seasonal rate${seasonalRateCount === 1 ? '' : 's'}` : ''}
                </p>
              </div>
              <div style="display:flex;gap:.45rem;flex-wrap:wrap;">
                <a class="btn btn-outline btn-sm" href="../property.html?id=${encodeURIComponent(docId)}" target="_blank" rel="noopener"><i class="fas fa-arrow-up-right-from-square"></i> Public page</a>
                <button class="btn btn-outline btn-sm edit-property-btn" data-doc-id="${escapeDashboardHtml(docId)}"><i class="fas fa-pen"></i> Edit Details</button>
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
            ${features.length ? `<p style="font-size:.82rem;margin:.75rem 0 0;"><strong>Amenities:</strong> ${escapeDashboardHtml(features.join(', '))}</p>` : ''}
            ${nearby.length ? `<p style="font-size:.82rem;margin:.3rem 0 0;"><strong>Nearby:</strong> ${escapeDashboardHtml(nearby.join(', '))}</p>` : ''}
            ${property.description ? `<p style="font-size:.82rem;margin:.3rem 0 0;"><strong>Description:</strong> ${escapeDashboardHtml(property.description)}</p>` : ''}
            <p style="font-size:.82rem;margin:.3rem 0 0;"><strong>Max guests:</strong> ${Number(property.occupancy || defaultOccupancyForType(normalizePropertyType(property.type)))}</p>
            ${houseRules.length ? `<p style="font-size:.82rem;margin:.3rem 0 0;"><strong>House rules:</strong> ${escapeDashboardHtml(houseRules.join(' · '))}</p>` : ''}
          </article>`;
      }).join('')}
    </div>`;

  container.querySelectorAll('.edit-property-btn').forEach(button => {
    button.addEventListener('click', () => openPropertyModal(button.dataset.docId));
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
    const existingSnapshot = docId ? await db.collection('property_settings').doc(docId).get() : null;
    const existing = existingSnapshot?.exists ? existingSnapshot.data() : {};
    const targetId = docId || propertyDocumentId(name);
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

async function openPaymentModal(bookingId) {
  _pendingPaymentId = bookingId;
  _pendingExpectedTotal = 0;
  _pendingNights = 0;
  _pendingPricingBreakdown = [];
  try {
    const snap = await db.collection('bookings').doc(bookingId).get();
    _pendingBooking = snap.data();
    const b = _pendingBooking || {};
    const nights = Number(b.nights) || bookingNights(b.checkin, b.checkout);
    const hasSavedTotal = b.total !== undefined && b.total !== null && b.total !== ''
      && Number.isFinite(Number(b.total));
    let expectedTotal = hasSavedTotal ? Number(b.total) : 0;
    let breakdown = Array.isArray(b.pricingBreakdown) ? b.pricingBreakdown : [];
    const currency = b.currency || b.pricingSnapshot?.currency || 'KSh';

    if (!hasSavedTotal && window.GonahPricing) {
      const pricingProperty = await getPropertyPricingForBooking(b);
      if (pricingProperty) {
        const quote = window.GonahPricing.calculateStay(pricingProperty, b.checkin, b.checkout);
        if (quote.valid) {
          expectedTotal = quote.total;
          breakdown = quote.breakdown;
        }
      }
    }
    _pendingExpectedTotal = expectedTotal;
    _pendingNights = nights;
    _pendingPricingBreakdown = breakdown;

    document.getElementById('payment-modal-info').innerHTML =
      `<strong>${escapeDashboardHtml(b.house || 'N/A')}</strong> &bull; ${escapeDashboardHtml(b.name || '')}<br>
       <span style="color:#666;">${escapeDashboardHtml(b.checkin || '')} → ${escapeDashboardHtml(b.checkout || '')} &bull; ${nights} night${nights !== 1 ? 's' : ''} &bull; ${escapeDashboardHtml(b.email || '')}</span><br>
       ${expectedTotal >= 0 && (hasSavedTotal || expectedTotal > 0) ? `<strong style="color:#800000;">Expected Total: ${escapeDashboardHtml(currency)} ${expectedTotal.toLocaleString('en-KE')}</strong>${bookingPricingBreakdownHtml(breakdown)}` : '<strong style="color:#9c1c1c;">No saved quote is available. Verify the rate before confirming payment.</strong>'}`;

    // Auto-fill amount with expected total
    if (expectedTotal >= 0 && (hasSavedTotal || expectedTotal > 0)) {
      document.getElementById('payment-amount').value = expectedTotal;
    }
  } catch(_) {}
  document.getElementById('payment-form').reset();
  if (_pendingExpectedTotal > 0) document.getElementById('payment-amount').value = _pendingExpectedTotal;
  document.getElementById('payment-modal').classList.add('active');
}

function closePaymentModal() {
  document.getElementById('payment-modal').classList.remove('active');
  _pendingPaymentId = null; _pendingBooking = null; _pendingExpectedTotal = 0;
}

async function submitPaymentConfirmation() {
  if (!_pendingPaymentId) return;
  const method = document.getElementById('payment-method').value;
  const ref    = document.getElementById('payment-ref').value.trim();
  const amount = document.getElementById('payment-amount').value;
  const notes  = document.getElementById('payment-notes').value.trim();
  if (!method || !ref || !amount) { showToast('Please fill all required fields.', 'error'); return; }

  // Validate amount matches expected total
  if (_pendingExpectedTotal > 0 && Number(amount) !== _pendingExpectedTotal) {
    const entered = Number(amount).toLocaleString();
    const expected = _pendingExpectedTotal.toLocaleString();
    showToast(
      `Amount KSh ${entered} does not match the expected total of KSh ${expected} for ${_pendingNights} night${_pendingNights!==1?'s':''}. Please enter the correct amount to confirm.`,
      'error'
    );
    return;
  }

  const btn = document.getElementById('confirm-payment-btn');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Confirming...';
  try {
    await db.collection('bookings').doc(_pendingPaymentId).update({
      status: 'confirmed',
      paymentMethod: method, transactionRef: ref,
      amountPaid: Number(amount), paymentNotes: notes,
      paymentConfirmedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    const b = _pendingBooking || {};
    if (b.email) {
      const msg = `Your booking has been CONFIRMED!\n\nBooking ID: ${_pendingPaymentId}\nProperty: ${b.house}\nCheck-in: ${b.checkin}\nCheck-out: ${b.checkout}\n\nPayment Received:\nMethod: ${method}\nTransaction Reference: ${ref}\nAmount: KSh ${Number(amount).toLocaleString()}${notes ? '\nNotes: ' + notes : ''}\n\nWe look forward to hosting you at Gonah Homes!`;
      try {
        await emailjs.send(emailConfig.serviceId, emailConfig.clientTemplate, {
          to_name: b.name, to_email: b.email, from_name: 'Gonah Homes',
          subject: `Booking Confirmed — ${_pendingPaymentId}`, message: msg
        });
      } catch(e) { console.warn('Email failed:', e.message); }
    }
    try {
      await db.collection('admin_notifications').add({
        type: 'booking_confirmed', bookingId: _pendingPaymentId,
        house: b.house || '', guestName: b.name || '',
        message: `Booking ${_pendingPaymentId} confirmed. ${method} ref: ${ref}`,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(), read: false
      });
    } catch(_) {}

    showToast('Booking confirmed. Guest notified by email.', 'success');
    closePaymentModal(); loadBookings();
  } catch(err) {
    showToast('Error confirming: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-check-circle"></i> Confirm Booking & Notify Guest';
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
    await db.collection('bookings').doc(_pendingCancelId).update({
      status: 'cancelled',
      cancellationReason: reason,
      cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
      cancelledBy: firebase.auth().currentUser?.email || ADMIN_EMAIL,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
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

// ===================== SECTION SWITCHING =====================
function switchSection(sectionName) {
  // Update nav links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
  });
  document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');
  
  // Update content sections
  document.querySelectorAll('.content-section').forEach(section => {
    section.classList.remove('active');
  });
  document.getElementById(`${sectionName}-section`).classList.add('active');
  
  // Update page title
  const titles = {
    overview: 'Dashboard Overview',
    bookings: 'Booking Management',
    messages: 'Message Management',
    reviews: 'Review Management',
    analytics: 'Analytics & Reports',
    announcements: 'Announcements & Offers',
    clients: 'Client Management',
    documents: 'Guest ID Documents',
    staff: 'Staff Accounts',
    properties: 'Property Management',
    settings: 'System Settings'
  };
  document.getElementById('page-title').textContent = titles[sectionName] || sectionName;

  // Lazy-load data for sections not loaded at startup
  if (sectionName === 'staff') {
    if (!isPrimaryAdminEmail(firebase.auth().currentUser?.email)) {
      showToast('Only the primary admin can manage staff accounts.', 'error');
      switchSection('overview');
      return;
    }
    loadStaff();
  }
  if (sectionName === 'properties') loadProperties();

  currentSection = sectionName;
}

function updateStats() {
  loadStats();
}

// Event listeners
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) sidebar.classList.toggle('active');
}

// Close sidebar when clicking a nav link on mobile
document.addEventListener('click', function(e) {
  const sidebar = document.querySelector('.sidebar');
  const toggle = document.getElementById('menu-toggle');
  if (!sidebar || !toggle) return;
  // If mobile sidebar is open and click is outside sidebar and not on toggle
  if (window.innerWidth <= 768 && sidebar.classList.contains('active')) {
    if (!sidebar.contains(e.target) && e.target !== toggle && !toggle.contains(e.target)) {
      sidebar.classList.remove('active');
    }
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
      // Close mobile sidebar after navigation
      if (window.innerWidth <= 768) {
        document.querySelector('.sidebar')?.classList.remove('active');
      }
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
  const paid = Number(b.amountPaid);
  if (Number.isFinite(paid) && paid > 0) return paid;
  const total = Number(b.total);
  return Number.isFinite(total) && total > 0 ? total : 0;
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
  const ids = Array.from(document.querySelectorAll('#bookings-table .bk-select:checked')).map(cb => cb.value);
  if (!ids.length) return;
  const allowed = [];
  let skipped = 0;
  ids.forEach(id => {
    const b = adminBookingCache.get(id) || {};
    if (!archivedView && bookingArchiveBlockReason(b)) skipped++;
    else allowed.push(id);
  });
  if (!allowed.length) { alert('None of the selected bookings can be archived right now.'); return; }
  const verb = archivedView ? 'Restore' : 'Archive';
  let msg = verb + ' ' + allowed.length + ' booking' + (allowed.length === 1 ? '' : 's') + '?';
  if (!archivedView) msg += '\n\nThey will be hidden from this list, not deleted. You can restore them from the "Archived bookings" view.';
  if (skipped) msg += '\n\n' + skipped + ' selected booking(s) cannot be archived and will be skipped.';
  if (!confirm(msg)) return;
  const btn = document.getElementById('bk-action-btn');
  if (btn) btn.disabled = true;
  try {
    for (let i = 0; i < allowed.length; i += 400) {
      const batch = db.batch();
      allowed.slice(i, i + 400).forEach(id => {
        const ref = db.collection('bookings').doc(id);
        batch.update(ref, archivedView
          ? { archived: false, archivedAt: firebase.firestore.FieldValue.delete() }
          : { archived: true, archivedAt: firebase.firestore.FieldValue.serverTimestamp() });
      });
      await batch.commit();
    }
    await loadBookings();
  } catch (error) {
    console.error('Archive action failed:', error);
    alert('Could not update bookings: ' + error.message);
  }
  updateBookingSelectionCount();
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
