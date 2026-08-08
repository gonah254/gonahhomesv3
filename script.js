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

// Initialize EmailJS
if (typeof emailjs !== 'undefined') {
  emailjs.init("VgDakmh3WscKrr_wQ");
}

const db = firebase.firestore();

// ---- Load property photo overrides from Firestore (admin updates) ----
// This runs early so gallery/booking always uses the latest photos
async function loadPropertyOverrides() {
  try {
    const snap = await db.collection('property_settings').get();
    snap.forEach(doc => {
      const data = doc.data();
      if (data.images && Array.isArray(data.images) && data.images.length > 0 && typeof propertiesData !== 'undefined' && propertiesData[doc.id]) {
        propertiesData[doc.id].images = data.images;
      }
    });
  } catch (err) {
    console.warn('Could not load property overrides:', err.message);
  }
}
loadPropertyOverrides();
let currentUser = null;
const adminEmail = "gonahhomes0@gmail.com";

// Utility Functions
function scrollToSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (section) {
    section.scrollIntoView({ behavior: 'smooth' });
  }
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Mobile Navigation
function initMobileNav() {
  const hamburger = document.getElementById('hamburger');
  const navMenu = document.getElementById('nav-menu');

  if (hamburger && navMenu) {
    hamburger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      navMenu.classList.toggle('active');
      hamburger.classList.toggle('active');
    });

    navMenu.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('active');
        hamburger.classList.remove('active');
      });
    });

    document.addEventListener('click', (e) => {
      if (!navMenu.contains(e.target) && !hamburger.contains(e.target)) {
        navMenu.classList.remove('active');
        hamburger.classList.remove('active');
      }
    });
  }
}

// Booking Modal Functions
function openBookingModal(house) {
  const modal = document.getElementById('booking-modal-bg');
  const form = document.getElementById('booking-form');
  const confirmDiv = document.getElementById('booking-confirm');
  const summaryDiv = document.getElementById('booking-summary');

  if (modal && form && confirmDiv) {
    modal.classList.add('active');
    document.getElementById('booking-house').value = house;
    form.style.display = 'block';
    confirmDiv.style.display = 'none';
    if (summaryDiv) summaryDiv.style.display = 'none';
    form.reset();

    if (typeof initializeFlatpickr === 'function') {
      initializeFlatpickr(house);
    }
  }
}

function closeBookingModal() {
  const modal = document.getElementById('booking-modal-bg');
  if (modal) {
    modal.classList.remove('active');
  }
}

function openBookingConfirmation() {
  const name = document.getElementById("booking-name").value.trim();
  const email = document.getElementById("booking-email").value.trim();
  const phone = document.getElementById("booking-phone").value.trim();
  const guests = document.getElementById("booking-guests").value;
  const checkin = document.getElementById("booking-checkin").value;
  const checkout = document.getElementById("booking-checkout").value;

  if (!name || !email || !phone || !guests || !checkin || !checkout) {
    alert("Please fill all required fields.");
    return;
  }

  document.getElementById("booking-form").style.display = "none";
  document.getElementById("booking-confirmation").style.display = "block";

  document.getElementById("confirm-summary").innerHTML = `
    <div class="confirm-row"><strong>Name:</strong> ${name}</div>
    <div class="confirm-row"><strong>Email:</strong> ${email}</div>
    <div class="confirm-row"><strong>Phone:</strong> ${phone}</div>
    <div class="confirm-row"><strong>Guests:</strong> ${guests}</div>
    <div class="confirm-row"><strong>Check-In:</strong> ${checkin}</div>
    <div class="confirm-row"><strong>Check-Out:</strong> ${checkout}</div>
    <div class="confirm-row"><strong>Nights:</strong> ${document.getElementById("summary-nights").textContent}</div>
    <div class="confirm-row"><strong>Total:</strong> ${document.getElementById("summary-total").textContent}</div>
  `;
}

function backToBookingForm() {
  document.getElementById("booking-confirmation").style.display = "none";
  document.getElementById("booking-form").style.display = "block";
}

function showBookingConfirmation(bookingData) {
  const form = document.getElementById('booking-form');
  const confirmStep = document.getElementById('booking-confirmation');
  const confirmDiv = document.getElementById('booking-confirm');
  const detailsDiv = document.getElementById('booking-details');
  const codeDisplays = document.querySelectorAll('#display-booking-code');

  if (confirmStep) confirmStep.style.display = 'none';
  if (form) form.style.display = 'none';
  if (confirmDiv) confirmDiv.style.display = 'block';

  codeDisplays.forEach(el => { el.textContent = bookingData.id; el.style.display = 'inline'; });

  if (detailsDiv) {
    detailsDiv.innerHTML = `
      <div style="background:#fff5f5;border:1.5px solid #ffcdd2;border-radius:10px;padding:1rem 1.25rem;margin:0.75rem 0 0.5rem;text-align:left;">
        <p style="margin:0 0 0.4rem;font-weight:700;color:#800000;font-size:0.9rem;"><i class="fas fa-mobile-alt"></i> Pay to confirm your booking</p>
        <p style="margin:0;font-size:0.83rem;color:#555;">Business: <strong style="color:#800000;">Gonah Nexus</strong></p>
        <p style="margin:0.15rem 0 0;font-size:0.83rem;color:#555;">Paybill Number: <strong style="color:#800000;">247247</strong></p>
        <p style="margin:0.15rem 0 0;font-size:0.83rem;color:#555;">Account Number: <strong style="color:#800000;">466999</strong></p>
        <p style="margin:0.15rem 0 0;font-size:0.83rem;color:#555;">Amount: <strong style="color:#800000;">KSh ${bookingData.total ? bookingData.total.toLocaleString() : '—'}</strong></p>
        <p style="margin:0.35rem 0 0;font-size:0.78rem;color:#888;">Use <strong style="color:#800000;">${bookingData.id}</strong> as the payment reference in your SMS or receipt.</p>
      </div>
      <p style="margin:0.6rem 0 0;font-size:0.82rem;color:#888;text-align:center;"><i class="fas fa-receipt"></i> Your full receipt is available to download from <strong>My Account</strong></p>
    `;
  }
}

function submitBookingFinal() {
  const name = document.getElementById("booking-name").value.trim();
  const email = document.getElementById("booking-email").value.trim();
  const phone = document.getElementById("booking-phone").value.trim();
  const guests = document.getElementById("booking-guests").value;
  const checkin = document.getElementById("booking-checkin").value;
  const checkout = document.getElementById("booking-checkout").value;
  const house = document.getElementById("booking-house").value;
  
  // Get calculated total from the hidden summary fields
  const totalText = document.getElementById('summary-total').textContent || '';
  const totalMatch = totalText.match(/[\d,]+/);
  const total = totalMatch ? parseInt(totalMatch[0].replace(/,/g, ''), 10) : 0;

  const bookingData = {
    name, email, phone, guests, checkin, checkout, house, total
  };

  const bookingId = 'GNH-' + Math.random().toString(36).substr(2, 6).toUpperCase();
  const finalBookingData = {
    ...bookingData,
    id: bookingId,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    status: 'pending'
  };

  db.collection("bookings").doc(bookingId).set(finalBookingData).then(() => {
    showBookingConfirmation(finalBookingData);

    // Update "Go to My Account" button so it pre-fills the login form with this booking
    const params = new URLSearchParams({ email: finalBookingData.email.toLowerCase(), code: bookingId });
    const accountBtn = document.querySelector('#booking-confirm .btn-primary');
    if (accountBtn) accountBtn.setAttribute('onclick', `window.location.href='account.html?${params}'`);

    // Send email via EmailJS
    if (typeof emailjs !== 'undefined') {
        emailjs.send("service_ky2kj3t", "template_6duvs5n", {
            to_name: finalBookingData.name,
            to_email: finalBookingData.email,
            booking_id: bookingId,
            property: finalBookingData.house,
            checkin: finalBookingData.checkin,
            checkout: finalBookingData.checkout
        }).then(() => console.log("Email sent")).catch(err => console.error("Email failed", err));
    }

    db.collection("messages").add({
      name: "System",
      email: "system@gonahhomes.com",
      message: `New booking: ${bookingId} for ${finalBookingData.house} by ${finalBookingData.name}`,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      status: 'new'
    });
  }).catch((error) => {
    console.error("Error saving booking: ", error);
    alert("Error processing booking: " + error.message);
  });
}

// ---- Returning Guest Recognition ----
async function checkReturningGuest(email) {
  const banner = document.getElementById('returning-guest-banner');
  const bannerText = document.getElementById('returning-guest-text');
  if (!banner) return;
  banner.style.display = 'none';
  if (!email || !email.includes('@')) return;

  try {
    const snap = await firebase.firestore().collection('bookings')
      .where('email', '==', email)
      .limit(5)
      .get();
    if (snap.empty) return;

    let count = 0;
    let guestName = '';
    snap.forEach(doc => {
      const b = doc.data();
      if (b.status !== 'cancelled') {
        count++;
        if (!guestName) guestName = b.name || '';
      }
    });

    if (count > 0 && bannerText) {
      const firstName = guestName.split(' ')[0];
      bannerText.innerHTML = firstName
        ? `Welcome back, <strong>${firstName}</strong>! Great to have you again — ${count} stay${count > 1 ? 's' : ''} with us.`
        : `Welcome back! You're a returning guest.`;
      banner.style.display = 'block';
    }
  } catch (e) {
    // Silently fail — non-critical feature
  }
}

// Review System Functions
function showUserInfo(email) {
  const userInfo = document.getElementById('user-info');
  const userName = document.getElementById('user-name');
  const userEmail = document.getElementById('user-email');
  const emailForm = document.getElementById('email-form');
  const reviewForm = document.getElementById('review-form');

  if (userInfo && userName && userEmail && emailForm && reviewForm) {
    userInfo.style.display = 'block';
    userName.textContent = email.split('@')[0];
    userEmail.textContent = email;
    reviewForm.style.display = 'block';
    emailForm.style.display = 'none';
  }
}

function hideUserInfo() {
  const userInfo = document.getElementById('user-info');
  const emailForm = document.getElementById('email-form');
  const reviewForm = document.getElementById('review-form');

  if (userInfo && emailForm && reviewForm) {
    userInfo.style.display = 'none';
    emailForm.style.display = 'block';
    reviewForm.style.display = 'none';
  }
}

function renderTestimonials(reviews) {
  const testimonialsGrid = document.getElementById('testimonials-grid');
  if (!testimonialsGrid) return;

  if (!reviews || reviews.length === 0) {
    testimonialsGrid.innerHTML = `
      <div class="testimonial-card">
        <div class="testimonial-rating">
          <i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i>
        </div>
        <p class="testimonial-text">"Amazing experience! The apartment was spotless, beautifully furnished, and the location was perfect. Will definitely book again!"</p>
        <div class="testimonial-author">
          <img src="https://images.unsplash.com/photo-1494790108755-2616b612b577?w=100&h=100&fit=crop&crop=face" alt="Sarah Johnson" class="author-avatar">
          <div class="author-info">
            <h4>Sarah Johnson</h4>
            <span>Verified Guest</span>
          </div>
        </div>
      </div>
    `;
    return;
  }

  let html = '';
  reviews.slice(0, 6).forEach(review => {
    const rating = '★'.repeat(Number(review.rating || 5));
    const reviewDate = review.timestamp ? new Date(review.timestamp.toDate()).toLocaleDateString() : '';
    const userName = review.name || 'Anonymous';
    const userEmail = (review.email || '').trim().toLowerCase();
    // Generate a consistent color from the email/name
    let hash = 0;
    const seed = (userEmail || userName).toLowerCase();
    for (let i = 0; i < seed.length; i++) { hash = seed.charCodeAt(i) + ((hash << 5) - hash); hash = hash & hash; }
    const palette = ['7B2D00','8B1A1A','6A0F49','0D47A1','1B5E20','006064','4A148C','E65100','37474F','880E4F'];
    const bg = palette[Math.abs(hash) % palette.length];
    const userAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&size=100&background=${bg}&color=fff&rounded=true&bold=true`;

    html += `
      <div class="testimonial-card">
        <div class="testimonial-rating">
          ${rating.split('').map(() => '<i class="fas fa-star"></i>').join('')}
        </div>
        <p class="testimonial-text">"${review.review}"</p>
        ${review.imageUrl ? `<div class="testimonial-image" style="margin: 1rem 0;"><img src="${review.imageUrl}" style="width: 100%; border-radius: 8px; max-height: 200px; object-fit: cover;"></div>` : ''}
        <div class="testimonial-author">
          <img src="${userAvatar}" alt="${userName}" class="author-avatar">
          <div class="author-info">
            <h4>${userName}</h4>
            <span>Verified Guest ${reviewDate ? '• ' + reviewDate : ''}</span>
          </div>
        </div>
      </div>
    `;
  });

  testimonialsGrid.innerHTML = html;
}

function loadReviews() {
  db.collection("reviews").where("approved", "==", true).orderBy("timestamp", "desc").onSnapshot((snapshot) => {
    const reviews = [];
    snapshot.forEach((doc) => {
      reviews.push({ id: doc.id, ...doc.data() });
    });
    renderTestimonials(reviews);
  }, (error) => {
    if (error.message && error.message.includes('index')) {
      db.collection("reviews").orderBy("timestamp", "desc").onSnapshot((snap) => {
        const reviews = [];
        snap.forEach(doc => {
          const d = doc.data();
          if (d.approved === true) reviews.push({ id: doc.id, ...d });
        });
        renderTestimonials(reviews);
      });
    } else {
      console.error("Error loading reviews:", error);
      renderTestimonials([]);
    }
  });
}

// New Review Validation Logic
const validationForm = document.getElementById('review-validation-form');
const submissionForm = document.getElementById('review-submission-form');
let verifiedReviewer = null;

function activateReviewForm(reviewer) {
  verifiedReviewer = reviewer;
  if (validationForm) validationForm.style.display = 'none';
  if (submissionForm) {
    submissionForm.style.display = 'block';
    const badge = document.getElementById('reviewer-badge');
    if (badge) badge.innerHTML = `<i class="fas fa-check-circle" style="color:#2e7d32;"></i> Verified: ${reviewer.name}`;
  }
}

// Auto-verify if guest is already logged in
(function checkLoggedInGuest() {
  try {
    const saved = JSON.parse(localStorage.getItem('booking_code_user') || 'null');
    if (saved && saved.email && saved.code) {
      activateReviewForm({ email: saved.email, code: saved.code, name: saved.name });
    }
  } catch(e) {}
})();

if (validationForm) {
  validationForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('review-email-input').value.trim();
    const code = document.getElementById('review-code-input').value.trim().toUpperCase();
    const btn = validationForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Verifying...';
    
    try {
      const snapshot = await db.collection('bookings')
        .where('email', '==', email)
        .where('id', '==', code)
        .get();
        
      if (snapshot.empty) {
        alert("No matching booking found. Please check your email and Booking ID.");
        return;
      }
      
      const b = snapshot.docs[0].data();
      activateReviewForm({ email, code, name: b.name });
    } catch (err) {
      console.error("Verification error:", err);
      alert("Error verifying booking. Please try again.");
    } finally {
      btn.disabled = false;
      btn.textContent = 'Verify & Review';
    }
  });
}

if (submissionForm) {
  submissionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!verifiedReviewer) return;

    const rating = document.querySelector('#review-submission-form input[name="rating"]:checked')?.value;
    const text = document.getElementById('review-text-input').value.trim();
    const imageFile = document.getElementById('review-image-input').files[0];

    const submitBtn = submissionForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    try {
      if (!firebase.auth().currentUser) {
        await firebase.auth().signInAnonymously();
      }
      let imageUrl = null;
      if (imageFile) {
        const storageRef = firebase.storage().ref(`reviews/${Date.now()}_${imageFile.name}`);
        await storageRef.put(imageFile);
        imageUrl = await storageRef.getDownloadURL();
      }

      await db.collection('reviews').add({
        name: verifiedReviewer.name,
        email: verifiedReviewer.email,
        bookingCode: verifiedReviewer.code,
        rating: parseInt(rating),
        review: text,
        imageUrl: imageUrl,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        approved: false
      });

      alert("Review submitted for moderation! Thank you.");
      submissionForm.reset();
      submissionForm.style.display = 'none';
      validationForm.style.display = 'block';
    } catch (error) {
      alert("Error: " + error.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Review";
    }
  });
}

function initFormHandlers() {
  loadReviews();
  
  // Setup footer admin link
  document.querySelectorAll('a').forEach(link => {
      if (link.href.includes('dashboard.html') || link.textContent.toLowerCase().includes('admin dashboard')) {
          link.onclick = (e) => {
              e.preventDefault();
              openAdminModal();
          };
      }
  });

  const bookingForm = document.getElementById('booking-form');
  if (bookingForm) {
    bookingForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(bookingForm);
      const bookingData = Object.fromEntries(formData.entries());

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const checkinDate = new Date(bookingData.checkin);
      const checkoutDate = new Date(bookingData.checkout);

      if (!bookingData.name || !bookingData.guests || !bookingData.checkin || 
          !bookingData.checkout || !bookingData.phone || !bookingData.email) {
        showCustomAlert("Please fill all required booking fields.", "error");
        return;
      }

      if (checkinDate < today) {
        showCustomAlert("Check-in date cannot be in the past.", "error");
        return;
      }

      if (checkoutDate <= checkinDate) {
        showCustomAlert("Check-out date must be after check-in date.", "error");
        return;
      }

      // Show confirmation step instead of immediate submission
      openBookingConfirmation();
    });
  }

  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('contact-name').value.trim();
      const email = document.getElementById('contact-email').value.trim();
      const message = document.getElementById('contact-message').value.trim();

      if (!name || !email || !message) {
        alert("Please fill all required fields.");
        return;
      }

      const submitBtn = contactForm.querySelector('[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
      submitBtn.disabled = true;

      db.collection("messages").add({
        name: name,
        email: email,
        message: message,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'new'
      }).then(() => {
        showCustomAlert("Thank you for your message!", "success");
        contactForm.reset();
      }).catch((error) => {
        console.error("Error sending message: ", error);
        showCustomAlert("Error sending message.", "error");
      }).finally(() => {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
      });
    });
  }
}

function initSmoothScrolling() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      if (this.getAttribute('href').length > 1) {
          e.preventDefault();
          const target = document.querySelector(this.getAttribute('href'));
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
      }
    });
  });
}

function initAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('fade-in');
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.accommodation-card, .feature-card, .testimonial-card, .quick-link-card').forEach(el => {
    observer.observe(el);
  });
}

function initModalHandlers() {
  const modal = document.getElementById('booking-modal-bg');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeBookingModal();
    });
  }
}

function initNavbarScroll() {
  const navbar = document.querySelector('.main-header');
  if (navbar) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 100) {
        navbar.style.background = 'rgba(255, 255, 255, 0.98)';
      } else {
        navbar.style.background = 'rgba(255, 255, 255, 0.95)';
      }
    });
  }
}

let slideIndex = 0;
function showSlide(index) {
  const slides = document.querySelectorAll('.slide');
  const indicators = document.querySelectorAll('.indicator');
  if (!slides.length) return;
  slides.forEach(slide => slide.classList.remove('active'));
  indicators.forEach(indicator => indicator.classList.remove('active'));
  slides[index].classList.add('active');
  indicators[index].classList.add('active');
}

function nextSlide() {
  const slides = document.querySelectorAll('.slide');
  if (!slides.length) return;
  slideIndex = (slideIndex + 1) % slides.length;
  showSlide(slideIndex);
}

function initSlideshow() {
  const slides = document.querySelectorAll('.slide');
  if (slides.length > 0) setInterval(nextSlide, 5000);
}

function openAdminModal() {
  if (localStorage.getItem('admin_logged_in') === 'true') {
    window.open('backend/dashboard.html', '_blank');
    return;
  }
  const modal = document.getElementById('admin-login-modal');
  if (modal) modal.style.display = 'flex';
}

function closeAdminModal() {
  const modal = document.getElementById('admin-login-modal');
  if (modal) {
    modal.style.display = 'none';
    document.getElementById('admin-login-error').style.display = 'none';
  }
}

function handleAdminLogin(e) {
  e.preventDefault();
  const username = document.getElementById('admin-username').value.trim();
  const password = document.getElementById('admin-password').value;
  const errorDiv = document.getElementById('admin-login-error');
  // Authenticate via Firebase Auth (same credentials used in dashboard.html)
  firebase.auth().signInWithEmailAndPassword(username, password)
    .then(() => {
      closeAdminModal();
      window.open('backend/dashboard.html', '_blank');
    })
    .catch(() => {
      errorDiv.textContent = 'Invalid credentials. Please check your email and password.';
      errorDiv.style.display = 'block';
    });
}

function initAdminAccess() {
  const adminBtn = document.getElementById('admin-access-btn');
  if (adminBtn) adminBtn.onclick = (e) => { e.preventDefault(); openAdminModal(); };
  const adminForm = document.getElementById('admin-login-form');
  if (adminForm) adminForm.addEventListener('submit', handleAdminLogin);
}

function showCustomAlert(message, type = "success") {
  const alertBox = document.createElement('div');
  alertBox.classList.add('custom-alert', type);
  alertBox.innerHTML = `<p>${message}</p><span>&times;</span>`;
  document.body.appendChild(alertBox);
  alertBox.querySelector('span').onclick = () => alertBox.remove();
  setTimeout(() => alertBox.remove(), 5000);
}

window.openBookingModal = openBookingModal;
window.closeBookingModal = closeBookingModal;
window.openAdminModal = openAdminModal;
window.closeAdminModal = closeAdminModal;
window.scrollToSection = scrollToSection;
window.currentSlide = (i) => { slideIndex = i-1; showSlide(slideIndex); };

document.addEventListener('DOMContentLoaded', () => {
  initMobileNav();
  initFormHandlers();
  initSmoothScrolling();
  initAnimations();
  initModalHandlers();
  initNavbarScroll();
  initSlideshow();
  initAdminAccess();

  // Returning guest detection — runs when user leaves email field
  const bookingEmailField = document.getElementById('booking-email');
  if (bookingEmailField) {
    bookingEmailField.addEventListener('blur', function() {
      const val = this.value.trim().toLowerCase();
      if (val) checkReturningGuest(val);
    });
    // Also clear banner when field is cleared
    bookingEmailField.addEventListener('input', function() {
      if (!this.value.trim()) {
        const banner = document.getElementById('returning-guest-banner');
        if (banner) banner.style.display = 'none';
      }
    });
  }

  console.log('Gonah Homes initialized!');
});
// OPEN BOOKING MODAL - for dynamic properties
function openBookingModal(propertyName) {
  const modal = document.getElementById('booking-modal-bg');
  if(!modal) return;
  
  // Set property name in the modal
  document.getElementById('booking-property-name').value = propertyName;
  document.querySelector('#booking-modal-bg .modal h3').innerHTML = `<i class="fas fa-calendar-check"></i> Book ${propertyName}`;
  
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

// OPEN GALLERY MODAL - for dynamic properties  
async function openGalleryModal(propertyName) {
  const modal = document.getElementById('gallery-modal-bg');
  const galleryGrid = document.getElementById('gallery-grid');
  if(!modal || !galleryGrid) return;

  document.getElementById('gallery-property-name').textContent = propertyName;
  galleryGrid.innerHTML = '<p>Loading images...</p>';
  modal.style.display = 'flex';

  try {
    const db = firebase.firestore();
    const doc = await db.collection('property_settings').doc(propertyName).get();
    
    if(doc.exists && doc.data().images && doc.data().images.length > 0) {
      const images = doc.data().images;
      galleryGrid.innerHTML = images.map(img => `
        <img src="${img}" alt="${propertyName}" onclick="openLightbox('${img}')">
      `).join('');
    } else {
      galleryGrid.innerHTML = '<p>No images uploaded for this property yet.</p>';
    }
  } catch(e) {
    console.error(e);
    galleryGrid.innerHTML = '<p>Error loading images.</p>';
  }
}

function closeGalleryModal() {
  document.getElementById('gallery-modal-bg').style.display = 'none';
}
