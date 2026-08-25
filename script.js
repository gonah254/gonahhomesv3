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
const MAX_PROPERTY_IMAGES = 10;
let propertyOverridesLoaded = false;

// ---- Load property photo overrides from Firestore (admin updates) ----
// This runs early so gallery, cover photos, cards, and booking use the latest data.
async function loadPropertyOverrides() {
  try {
    const snap = await db.collection('property_settings').get();
    snap.forEach(doc => {
      const data = doc.data();
      if (typeof propertiesData === 'undefined') return;
      const existing = propertiesData[doc.id] || {};
      const propertyName = data.name || existing.name || doc.id;
      const overrideImages = Array.isArray(data.images)
        ? data.images.filter(image => typeof image === 'string' && image.trim())
        : [];
      propertiesData[doc.id] = {
        ...existing,
        ...data,
        name: propertyName,
        images: overrideImages.length
          ? overrideImages.slice(0, MAX_PROPERTY_IMAGES)
          : (existing.images || [])
      };
      // Custom properties use their Firestore id as the document key, while
      // bookings and gallery buttons use the display name.
      propertiesData[propertyName] = propertiesData[doc.id];
    });
    propertyOverridesLoaded = true;
    renderPublicProperties();
  } catch (err) {
    console.warn('Could not load property overrides:', err.message);
    propertyOverridesLoaded = true;
    renderPublicProperties();
  }
}
loadPropertyOverrides();
let currentUser = null;
const adminEmail = "admin@gonahhomes.com";

function escapePropertyHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[ch]));
}

function propertyList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function propertyFeatures(property) {
  const amenities = propertyList(property.amenities);
  const fallback = propertyList(property.features);
  return (amenities.length ? amenities : fallback).slice(0, 4);
}

function amenityIcon(amenity) {
  const value = String(amenity || '').toLowerCase();
  if (value.includes('wi-fi') || value.includes('wifi') || value.includes('internet')) return 'fa-wifi';
  if (value.includes('pool')) return 'fa-person-swimming';
  if (value.includes('kitchen')) return 'fa-utensils';
  if (value.includes('parking')) return 'fa-square-parking';
  if (value.includes('air condition')) return 'fa-snowflake';
  if (value.includes('tv') || value.includes('television')) return 'fa-tv';
  if (value.includes('wash')) return 'fa-shirt';
  if (value.includes('balcony')) return 'fa-building';
  if (value.includes('bath')) return 'fa-bath';
  if (value.includes('bed')) return 'fa-bed';
  if (value.includes('guest')) return 'fa-users';
  return 'fa-star';
}

function renderPublicProperties() {
  const grid = document.getElementById('accommodations-grid');
  if (!grid || typeof propertiesData === 'undefined' || !propertyOverridesLoaded) return;

  const properties = Object.entries(propertiesData)
    .map(([id, property]) => ({ id, ...property, name: property.name || id }))
    .filter(property => property.name)
    .filter((property, index, list) => list.findIndex(item => item.name === property.name) === index);
  const filteredProperties = applyPropertyFilters(properties);
  if (!filteredProperties.length) {
    grid.innerHTML = '<div class="property-empty-state"><i class="fas fa-search"></i><p>No stays match those filters.</p><button class="btn btn-outline" type="button" id="clear-property-filters">Clear filters</button></div>';
    document.getElementById('clear-property-filters')?.addEventListener('click', clearPropertyFilters);
    return;
  }

  grid.innerHTML = filteredProperties.map(property => {
    const images = Array.isArray(property.images) ? property.images : [];
    const cover = images[0] || 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&h=600&fit=crop';
    const features = propertyFeatures(property);
    const details = [property.type, property.location].filter(Boolean).join(' • ');
    const isMaintenance = String(property.status || 'available').toLowerCase() === 'maintenance';
    return `
      <article class="accommodation-card${property.name === 'Luxury Maisonette' ? ' featured' : ''}${isMaintenance ? ' maintenance-property' : ''}">
        <div class="card-image">
          <img src="${escapePropertyHtml(cover)}" alt="${escapePropertyHtml(property.name)}" onerror="this.style.opacity=.35">
          ${property.type ? `<div class="card-badge">${escapePropertyHtml(property.type)}</div>` : ''}
          ${isMaintenance ? '<div class="maintenance-badge"><i class="fas fa-screwdriver-wrench"></i> Maintenance</div>' : ''}
          <button class="gallery-btn property-gallery-btn" data-property="${escapePropertyHtml(property.name)}" title="View Gallery">
            <i class="fas fa-images"></i>
          </button>
        </div>
        <div class="card-content">
          <h3>${escapePropertyHtml(property.name)}</h3>
          ${details ? `<p class="property-meta">${escapePropertyHtml(details)}</p>` : ''}
          <p>${escapePropertyHtml(property.description || 'A comfortable Gonah Homes stay prepared for your coastal getaway.')}</p>
          ${property.landmarks ? `<p class="property-nearby"><i class="fas fa-location-dot"></i> Near ${escapePropertyHtml(propertyList(property.landmarks).join(', '))}</p>` : ''}
          ${features.length ? `<div class="card-features">${features.map(feature => `<div class="feature"><i class="fas ${amenityIcon(feature)}"></i><span>${escapePropertyHtml(feature)}</span></div>`).join('')}</div>` : ''}
          <div class="card-price-actions">
            <div class="price-tag">
              <span class="price-amount">${escapePropertyHtml(property.currency || 'KSh')} ${Number(property.price || 0).toLocaleString()}</span>
              <span class="price-period">/night</span>
            </div>
             <button class="btn ${isMaintenance ? 'btn-disabled' : 'btn-primary'} property-book-btn" data-property="${escapePropertyHtml(property.name)}" ${isMaintenance ? 'disabled' : ''}>
               <i class="fas ${isMaintenance ? 'fa-wrench' : 'fa-calendar-check'}"></i> ${isMaintenance ? 'Unavailable' : 'Book Now'}
            </button>
          </div>
        </div>
      </article>`;
  }).join('');

  grid.querySelectorAll('.property-gallery-btn').forEach(button => {
    button.addEventListener('click', () => openGalleryModal(button.dataset.property));
  });
  grid.querySelectorAll('.property-book-btn:not([disabled])').forEach(button => {
    button.addEventListener('click', () => openBookingModal(button.dataset.property));
  });

  const featured = properties.find(property => property.name === 'Luxury Maisonette') || properties[0];
  const featuredImage = document.getElementById('featured-property-image');
  const featuredName = document.getElementById('featured-property-name');
  const featuredDescription = document.getElementById('featured-property-description');
  const featuredPrice = document.getElementById('featured-property-price');
  const featuredBook = document.getElementById('featured-book-btn');
  const featuredGallery = document.getElementById('featured-gallery-btn');
  if (featured) {
    if (featuredImage) {
      featuredImage.src = featured.images?.[0] || 'https://images.unsplash.com/photo-1571624436279-b272aff752b5?w=800&h=600&fit=crop';
      featuredImage.alt = featured.name;
    }
    if (featuredName) featuredName.textContent = featured.name;
    if (featuredDescription) featuredDescription.textContent = featured.description || '';
    if (featuredPrice) featuredPrice.textContent = `${featured.currency || 'KSh'} ${Number(featured.price || 0).toLocaleString()}`;
    const featuredFeatures = document.getElementById('featured-property-features');
    if (featuredFeatures) {
      featuredFeatures.innerHTML = propertyFeatures(featured).map(feature =>
        `<div class="feature"><i class="fas ${amenityIcon(feature)}"></i><span>${escapePropertyHtml(feature)}</span></div>`
      ).join('');
    }
    if (featuredBook) {
      const featuredMaintenance = String(featured.status || 'available').toLowerCase() === 'maintenance';
      featuredBook.disabled = featuredMaintenance;
      featuredBook.classList.toggle('btn-disabled', featuredMaintenance);
      featuredBook.classList.toggle('btn-primary', !featuredMaintenance);
      featuredBook.innerHTML = `<i class="fas ${featuredMaintenance ? 'fa-wrench' : 'fa-calendar-check'}"></i> ${featuredMaintenance ? 'Unavailable' : 'Book Now'}`;
      featuredBook.onclick = featuredMaintenance ? null : () => openBookingModal(featured.name);
    }
    if (featuredGallery) featuredGallery.onclick = () => openGalleryModal(featured.name);
  }
}

function propertySearchText(property) {
  return [
    property.name, property.type, property.location, property.description,
    property.landmarks, property.amenities, property.features
  ].flatMap(value => Array.isArray(value) ? value : [value]).filter(Boolean).join(' ').toLowerCase();
}

function propertyBedrooms(property) {
  const text = `${property.name || ''} ${property.description || ''} ${property.features || ''}`.toLowerCase();
  if (/studio/.test(text)) return 0;
  const numericMatch = text.match(/(\d+)\s*[-+]?\s*(?:bedroom|br)\b/);
  if (numericMatch) return Number(numericMatch[1]);
  const wordBedrooms = [
    ['four', 4], ['three', 3], ['two', 2], ['one', 1]
  ].find(([word]) => new RegExp(`\\b${word}\\s+bedroom`).test(text));
  return wordBedrooms ? wordBedrooms[1] : 0;
}

function propertyGuests(property) {
  const text = `${property.name || ''} ${property.description || ''} ${property.features || ''}`.toLowerCase();
  const matches = [...text.matchAll(/(\d+)\s*(?:\+|to|-)?\s*guests?/g)].map(match => Number(match[1]));
  if (matches.length) return Math.max(...matches);
  const bedrooms = propertyBedrooms(property);
  return bedrooms ? bedrooms * 2 : 2;
}

function propertyHasAmenity(property, key) {
  const text = propertySearchText(property);
  const aliases = {
    beach: ['beach', 'beach access', 'beachfront', 'ocean access', 'coastal'],
    pool: ['pool', 'swimming'],
    wifi: ['wifi', 'wi-fi', 'internet'],
    air: ['air conditioning', 'aircondition', 'a/c', 'ac']
  };
  return aliases[key].some(alias => text.includes(alias)) || property[key] === true || property[`${key}Access`] === true;
}

function getPropertyFilters() {
  return {
    search: document.getElementById('property-search')?.value.trim().toLowerCase() || '',
    location: document.getElementById('property-location-filter')?.value || '',
    maxPrice: Number(document.getElementById('property-price-filter')?.value || 0),
    bedrooms: Number(document.getElementById('property-bedroom-filter')?.value || -1),
    guests: Number(document.getElementById('property-guests-filter')?.value || 0),
    beach: document.getElementById('filter-beach')?.checked || false,
    pool: document.getElementById('filter-pool')?.checked || false,
    wifi: document.getElementById('filter-wifi')?.checked || false,
    air: document.getElementById('filter-air')?.checked || false
  };
}

function applyPropertyFilters(properties) {
  const filters = getPropertyFilters();
  return properties.filter(property => {
    const text = propertySearchText(property);
    const location = String(property.location || '').toLowerCase();
    return (!filters.search || text.includes(filters.search))
      && (!filters.location || location === filters.location.toLowerCase())
      && (!filters.maxPrice || Number(property.price || 0) <= filters.maxPrice)
      && (filters.bedrooms < 0 || propertyBedrooms(property) >= filters.bedrooms)
      && (!filters.guests || propertyGuests(property) >= filters.guests)
      && (!filters.beach || propertyHasAmenity(property, 'beach'))
      && (!filters.pool || propertyHasAmenity(property, 'pool'))
      && (!filters.wifi || propertyHasAmenity(property, 'wifi'))
      && (!filters.air || propertyHasAmenity(property, 'air'));
  });
}

function clearPropertyFilters() {
  document.getElementById('property-filters-form')?.reset();
  renderPublicProperties();
}

function initializePropertyFilters() {
  const form = document.getElementById('property-filters-form');
  if (!form) return;
  const locationSelect = document.getElementById('property-location-filter');
  const locations = [...new Set(Object.values(propertiesData || {}).map(property => property.location).filter(Boolean))].sort();
  locations.forEach(location => {
    const option = document.createElement('option');
    option.value = location;
    option.textContent = location;
    locationSelect?.appendChild(option);
  });
  form.addEventListener('input', renderPublicProperties);
  form.addEventListener('change', renderPublicProperties);
  form.addEventListener('reset', () => setTimeout(renderPublicProperties));
}

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
    const userAvatar = review.avatarUrl || (
      window.buildRealAvatar
        ? window.buildRealAvatar(userName, userEmail, 100)
        : ''
    );

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
    const saved = JSON.parse(sessionStorage.getItem('booking_code_user') || 'null');
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
      let imageUrl = null;
      if (imageFile) {
        imageUrl = await compressReviewPhoto(imageFile);
      }

      await db.collection('reviews').add({
        name: verifiedReviewer.name,
        email: verifiedReviewer.email,
        bookingCode: verifiedReviewer.code,
        rating: parseInt(rating),
        review: text,
        imageUrl: imageUrl,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        approved: true,
        avatarUrl: window.buildRealAvatar ? window.buildRealAvatar(verifiedReviewer.name, verifiedReviewer.email, 100) : null
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

function compressReviewPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => {
      const image = new Image();
      image.onload = () => {
        let width = image.width;
        let height = image.height;
        const maxDimension = 600;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round(height * maxDimension / width);
            width = maxDimension;
          } else {
            width = Math.round(width * maxDimension / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(image, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
        if (dataUrl.length > 700000) {
          reject(new Error('Photo is too large after compression. Please choose a smaller image.'));
        } else {
          resolve(dataUrl);
        }
      };
      image.onerror = () => reject(new Error('Could not read the review photo.'));
      image.src = event.target.result;
    };
    reader.onerror = () => reject(new Error('Could not read the review photo.'));
    reader.readAsDataURL(file);
  });
}

function initFormHandlers() {
  loadReviews();
  
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
    window.open('dashboard.html', '_blank');
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
      window.open('dashboard.html', '_blank');
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
  initializePropertyFilters();
  renderPublicProperties();
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


