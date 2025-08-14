
// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyABTVp797tNu353FBVLzsOp90aIX2mNF74",
  authDomain: "my-website-project2797.firebaseapp.com",
  projectId: "my-website-project2797",
  storageBucket: "my-website-project2797.appspot.com",
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

// Authentication credentials
const credentials = {
  username: 'gonahhomes0@gmail.com',
  password: 'gonahhomes@0799466723'
};

// Global variables
let currentSection = 'overview';
let notifications = [];
let charts = {};

// Authentication
function login(username, password) {
  if (username === credentials.username && password === credentials.password) {
    document.getElementById('login-modal').classList.remove('active');
    document.getElementById('dashboard').classList.remove('hidden');
    initializeDashboard();
    return true;
  }
  return false;
}

function logout() {
  document.getElementById('login-modal').classList.add('active');
  document.getElementById('dashboard').classList.add('hidden');
  document.getElementById('login-form').reset();
}

// Initialize Dashboard
function initializeDashboard() {
  loadStats();
  loadBookings();
  loadMessages();
  loadReviews();
  loadAnnouncements();
  loadClients();
  setupRealTimeListeners();
  initializeCharts();
  loadNotifications();
}

// Real-time listeners
function setupRealTimeListeners() {
  // Listen for new bookings
  db.collection('bookings').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added') {
        const booking = change.doc.data();
        addNotification('booking', `New booking from ${booking.name} for ${booking.house}`, booking);
        sendEmailNotification('booking', booking);
      }
    });
    loadBookings();
    updateStats();
  });

  // Listen for new messages
  db.collection('messages').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added') {
        const message = change.doc.data();
        addNotification('message', `New message from ${message.name}: ${message.message.substring(0, 50)}...`, message);
        sendEmailNotification('message', message);
      }
    });
    loadMessages();
    updateStats();
  });

  // Listen for new reviews
  db.collection('reviews').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added') {
        const review = change.doc.data();
        addNotification('review', `New ${review.rating}-star review: ${review.review.substring(0, 50)}...`, review);
        sendEmailNotification('review', review);
      }
    });
    loadReviews();
    updateStats();
  });
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
          to_email: credentials.username,
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
            message: `Thank you ${data.name} for your booking request! Property: ${data.house}, Check-in: ${data.checkin}, Check-out: ${data.checkout}, Guests: ${data.guests}. We will contact you shortly for confirmation. Payment to M-Pesa: 0799466723`
          });
        }
        break;
        
      case 'message':
        await emailjs.send(emailConfig.serviceId, emailConfig.adminTemplate, {
          to_name: "Admin",
          to_email: credentials.username,
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
          to_email: credentials.username,
          from_name: data.user?.name || 'Anonymous',
          from_email: data.user?.email || credentials.username,
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
    const [bookingsSnap, messagesSnap, reviewsSnap] = await Promise.all([
      db.collection('bookings').get(),
      db.collection('messages').get(),
      db.collection('reviews').get()
    ]);

    const totalBookings = bookingsSnap.size;
    const unreadMessages = messagesSnap.docs.filter(doc => doc.data().status === 'new').length;
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
    const snapshot = await db.collection('bookings').orderBy('timestamp', 'desc').get();
    const bookingsTable = document.getElementById('bookings-table');
    bookingsTable.innerHTML = '';

    snapshot.forEach(doc => {
      const booking = doc.data();
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${doc.id.substring(0, 8)}...</td>
        <td>
          <strong>${booking.name}</strong><br>
          <small>${booking.email}</small><br>
          <small>${booking.phone}</small>
        </td>
        <td>${booking.house}</td>
        <td>${booking.checkin}</td>
        <td>${booking.checkout}</td>
        <td>${booking.guests}</td>
        <td><span class="status status-${booking.status || 'pending'}">${(booking.status || 'pending').toUpperCase()}</span></td>
        <td>
          <button class="btn btn-success btn-sm" onclick="updateBookingStatus('${doc.id}', 'confirmed')">Confirm</button>
          <button class="btn btn-warning btn-sm" onclick="updateBookingStatus('${doc.id}', 'completed')">Complete</button>
          <button class="btn btn-danger btn-sm" onclick="updateBookingStatus('${doc.id}', 'cancelled')">Cancel</button>
        </td>
      `;
      bookingsTable.appendChild(row);
    });
  } catch (error) {
    console.error('Error loading bookings:', error);
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
      
      await emailjs.send(emailConfig.serviceId, emailConfig.clientTemplate, {
        to_name: booking.name,
        to_email: booking.email,
        from_name: "Gonah Homes",
        subject: `Booking ${status.charAt(0).toUpperCase() + status.slice(1)} - Gonah Homes`,
        message: message
      });
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

    snapshot.forEach(doc => {
      const message = doc.data();
      const messageItem = document.createElement('div');
      messageItem.className = 'message-item';
      messageItem.onclick = () => showMessageDetail(doc.id, message);
      
      messageItem.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
          <strong>${message.name}</strong>
          <span class="status status-${message.status || 'new'}">${(message.status || 'new').toUpperCase()}</span>
        </div>
        <div style="color: var(--text-light); font-size: 0.9rem; margin-bottom: 0.5rem;">${message.email}</div>
        <div style="color: var(--text-color); font-size: 0.9rem;">${message.message.substring(0, 100)}...</div>
      `;
      
      messagesList.appendChild(messageItem);
    });
  } catch (error) {
    console.error('Error loading messages:', error);
  }
}

// Show message detail
function showMessageDetail(messageId, message) {
  const messageDetail = document.getElementById('message-detail');
  messageDetail.innerHTML = `
    <div style="padding: 1.5rem;">
      <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 1rem;">
        <h3>${message.name}</h3>
        <span class="status status-${message.status || 'new'}">${(message.status || 'new').toUpperCase()}</span>
      </div>
      <p><strong>Email:</strong> ${message.email}</p>
      <p><strong>Received:</strong> ${message.timestamp ? new Date(message.timestamp.toDate()).toLocaleString() : 'Unknown'}</p>
      <hr style="margin: 1rem 0;">
      <div style="margin-bottom: 1.5rem;">
        <h4>Message:</h4>
        <p>${message.message}</p>
      </div>
      <div>
        <h4>Reply:</h4>
        <textarea id="reply-text-${messageId}" rows="4" style="width: 100%; margin-bottom: 1rem; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: var(--border-radius);"></textarea>
        <button class="btn btn-primary" onclick="replyToMessage('${messageId}', '${message.email}', '${message.name}')">Send Reply</button>
        <button class="btn btn-outline" onclick="markMessageAsRead('${messageId}')">Mark as Read</button>
      </div>
    </div>
  `;
  
  // Mark message items as active
  document.querySelectorAll('.message-item').forEach(item => item.classList.remove('active'));
  event.target.closest('.message-item').classList.add('active');
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
    reviewsGrid.innerHTML = '';

    snapshot.forEach(doc => {
      const review = doc.data();
      const reviewCard = document.createElement('div');
      reviewCard.className = 'review-card';
      
      const stars = '★'.repeat(parseInt(review.rating)).padEnd(5, '☆');
      
      reviewCard.innerHTML = `
        <div class="review-header">
          <div>
            <strong>${review.user?.name || 'Anonymous'}</strong>
            <div class="review-rating">${stars}</div>
          </div>
          <div class="review-actions">
            <button class="btn btn-info btn-sm" onclick="replyToReview('${doc.id}', '${review.user?.email}', '${review.user?.name}')">Reply</button>
          </div>
        </div>
        <p>${review.review}</p>
        <small style="color: var(--text-light);">
          ${review.timestamp ? new Date(review.timestamp.toDate()).toLocaleDateString() : 'Unknown date'}
        </small>
        ${review.adminReply ? `
          <div style="margin-top: 1rem; padding: 1rem; background: var(--bg-color); border-radius: var(--border-radius); border-left: 3px solid var(--primary-color);">
            <strong>Management Reply:</strong><br>
            ${review.adminReply}
          </div>
        ` : ''}
      `;
      
      reviewsGrid.appendChild(reviewCard);
    });
  } catch (error) {
    console.error('Error loading reviews:', error);
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
    
    // Send email to client if email exists
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

// Initialize charts
function initializeCharts() {
  // Bookings trend chart
  const bookingsCtx = document.getElementById('bookingsChart').getContext('2d');
  charts.bookingsChart = new Chart(bookingsCtx, {
    type: 'line',
    data: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      datasets: [{
        label: 'Bookings',
        data: [12, 19, 3, 5, 2, 3, 7, 11, 8, 15, 20, 25],
        borderColor: 'rgb(128, 0, 0)',
        backgroundColor: 'rgba(128, 0, 0, 0.1)',
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: false
        }
      }
    }
  });
  
  // Properties chart
  const propertiesCtx = document.getElementById('propertiesChart').getContext('2d');
  charts.propertiesChart = new Chart(propertiesCtx, {
    type: 'doughnut',
    data: {
      labels: ['Studio', 'One Bedroom', 'Two Bedroom', 'Three Bedroom', 'Four Bedroom', 'Maisonette'],
      datasets: [{
        data: [30, 25, 20, 15, 7, 3],
        backgroundColor: [
          'rgba(128, 0, 0, 0.8)',
          'rgba(160, 0, 0, 0.8)',
          'rgba(255, 107, 107, 0.8)',
          'rgba(128, 0, 0, 0.6)',
          'rgba(160, 0, 0, 0.6)',
          'rgba(255, 107, 107, 0.6)'
        ]
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  });
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
    settings: 'System Settings'
  };
  document.getElementById('page-title').textContent = titles[sectionName];
  
  currentSection = sectionName;
}

function updateStats() {
  loadStats();
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
  // Login form
  document.getElementById('login-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    if (!login(username, password)) {
      showToast('Invalid credentials', 'error');
    }
  });
  
  // Navigation
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const section = this.getAttribute('data-section');
      switchSection(section);
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
  document.getElementById('rating-filter').addEventListener('change', filterReviews);
  document.getElementById('client-search').addEventListener('input', filterClients);
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
    const matchesStatus = !status || rowStatus.includes(status);
    
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
