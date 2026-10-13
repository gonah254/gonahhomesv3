(() => {
  'use strict';

  const firebaseConfig = {
    apiKey: "AIzaSyABTVp797tNu353FBVLzsOp90aIX2mNF74",
    authDomain: "my-website-project2797.firebaseapp.com",
    projectId: "my-website-project2797",
    storageBucket: "my-website-project2797.firebasestorage.app",
    messagingSenderId: "406226552922",
    appId: "1:406226552922:web:ffdf2cc6f77a57964b063"
  };

  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();
  const propertyId = new URLSearchParams(window.location.search).get('id');
  let propertyRecord = null;
  let galleryImages = [];
  let galleryIndex = 0;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[character]));
  }

  function list(value) {
    if (Array.isArray(value)) return value.filter(Boolean).map(String);
    return String(value || '').split(/[\n,]+/).map(item => item.trim()).filter(Boolean);
  }

  function typeLabel(value) {
    const labels = {
      studio: 'Studio Apartment',
      '1bedroom': 'One Bedroom',
      '2bedroom': 'Two Bedroom',
      '3bedroom': 'Three Bedroom',
      '4bedroom': 'Four Bedroom',
      maisonette: 'Maisonette',
      villa: 'Villa',
      townhouse: 'Townhouse'
    };
    const key = String(value || '').toLowerCase().replace(/\s+/g, '');
    return labels[key] || String(value || 'Coastal stay');
  }

  function amenityIcon(label) {
    const value = label.toLowerCase();
    if (/wi.?fi|internet/.test(value)) return 'fa-wifi';
    if (/pool|swimming/.test(value)) return 'fa-person-swimming';
    if (/kitchen/.test(value)) return 'fa-utensils';
    if (/parking/.test(value)) return 'fa-square-parking';
    if (/air condition|a\/c/.test(value)) return 'fa-snowflake';
    if (/tv|television/.test(value)) return 'fa-tv';
    if (/wash/.test(value)) return 'fa-shirt';
    if (/balcony/.test(value)) return 'fa-building';
    if (/bath/.test(value)) return 'fa-bath';
    if (/bed/.test(value)) return 'fa-bed';
    if (/beach/.test(value)) return 'fa-umbrella-beach';
    return 'fa-check';
  }

  function inferOccupancy(property) {
    const setValue = Number(property.occupancy);
    if (Number.isInteger(setValue) && setValue > 0) return setValue;
    const type = String(property.type || '').toLowerCase().replace(/\s+/g, '');
    const fromType = {
      studio: 2,
      '1bedroom': 2,
      '2bedroom': 4,
      '3bedroom': 6,
      '4bedroom': 8,
      maisonette: 6,
      villa: 6,
      townhouse: 6
    }[type];
    if (fromType) return fromType;
    const found = `${property.name || ''} ${property.description || ''}`.match(/(\d+)\s*guests?/i);
    return found ? Number(found[1]) : 2;
  }

  function inferBedrooms(property) {
    const text = `${property.type || ''} ${property.name || ''}`.toLowerCase();
    if (text.includes('studio')) return 0;
    const numeric = text.match(/(\d+)\s*(?:bedroom|br)/);
    if (numeric) return Number(numeric[1]);
    const words = [['four', 4], ['three', 3], ['two', 2], ['one', 1]];
    const found = words.find(([word]) => text.includes(`${word} bedroom`));
    return found ? found[1] : null;
  }

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function showError(message) {
    const state = document.getElementById('property-page-state');
    state.classList.add('property-error');
    state.innerHTML = `<i class="fas fa-circle-exclamation" aria-hidden="true"></i><p>${escapeHtml(message)}</p><a href="index.html#accommodations">Back to accommodations</a>`;
  }

  function selectGalleryImage(index) {
    if (!galleryImages.length) return;
    galleryIndex = (index + galleryImages.length) % galleryImages.length;
    const image = document.getElementById('property-main-image');
    const empty = document.getElementById('property-image-empty');
    image.hidden = false;
    empty.hidden = true;
    image.onerror = () => {
      image.hidden = true;
      empty.hidden = false;
    };
    image.src = galleryImages[galleryIndex];
    image.alt = `${propertyRecord.name || 'Property'} photo ${galleryIndex + 1}`;
    document.getElementById('property-gallery-count').textContent = `${galleryIndex + 1} / ${galleryImages.length}`;
    document.querySelectorAll('.property-thumbnail').forEach((button, buttonIndex) => {
      button.classList.toggle('active', buttonIndex === galleryIndex);
      button.setAttribute('aria-current', buttonIndex === galleryIndex ? 'true' : 'false');
    });
  }

  function renderGallery(property) {
    galleryImages = Array.isArray(property.images)
      ? property.images.filter(image => typeof image === 'string' && /^https?:\/\//i.test(image)).slice(0, 10)
      : [];

    const mainImage = document.getElementById('property-main-image');
    const empty = document.getElementById('property-image-empty');
    const thumbnails = document.getElementById('property-thumbnails');
    const arrows = [
      document.getElementById('property-gallery-prev'),
      document.getElementById('property-gallery-next')
    ];

    if (!galleryImages.length) {
      mainImage.hidden = true;
      empty.hidden = false;
      arrows.forEach(arrow => { arrow.hidden = true; });
      document.getElementById('property-gallery-count').hidden = true;
      thumbnails.hidden = true;
      return;
    }

    mainImage.hidden = false;
    empty.hidden = true;
    arrows.forEach(arrow => { arrow.hidden = galleryImages.length < 2; });
    document.getElementById('property-gallery-count').hidden = galleryImages.length < 2;
    thumbnails.innerHTML = galleryImages.map((src, index) => `
      <button type="button" class="property-thumbnail${index === 0 ? ' active' : ''}" data-index="${index}" aria-label="Show photo ${index + 1}" aria-current="${index === 0 ? 'true' : 'false'}">
        <img src="${escapeHtml(src)}" alt="" loading="lazy">
      </button>
    `).join('');
    thumbnails.hidden = galleryImages.length < 2;
    thumbnails.querySelectorAll('.property-thumbnail').forEach(button => {
      button.addEventListener('click', () => selectGalleryImage(Number(button.dataset.index)));
    });
    selectGalleryImage(0);
  }

  function renderProperty(property) {
    propertyRecord = property;
    const name = property.name || 'Gonah Homes Stay';
    const location = [property.location, property.locationDetails].filter(Boolean).join(' · ') || 'Mombasa, Kenya';
    const type = typeLabel(property.type);
    const status = String(property.status || 'available').toLowerCase();
    const maxGuests = inferOccupancy(property);
    const bedrooms = inferBedrooms(property);

    document.title = `${name} | Gonah Homes`;
    document.querySelector('meta[name="description"]')?.setAttribute(
      'content',
      `${name} in ${location}. Explore photos, amenities, guest capacity, pricing and booking information from Gonah Homes.`
    );
    setText('property-breadcrumb-name', name);
    setText('property-eyebrow', type);
    setText('property-title', name);
    setText('property-location', location);
    setText('property-description', property.description || `Enjoy a comfortable ${type.toLowerCase()} in ${property.location || 'the Kenyan Coast'}, with thoughtful amenities and a local Gonah Homes team available to help.`);
    setText('property-occupancy', String(maxGuests));
    setText('property-type', type);
    setText('property-currency', property.currency || 'KSh');
    setText('property-price', Number(property.price || 0).toLocaleString('en-KE'));
    document.getElementById('property-bedroom-fact').hidden = bedrooms === null || bedrooms === 0;
    if (bedrooms > 0) setText('property-bedroom-count', `${bedrooms} bedroom${bedrooms === 1 ? '' : 's'}`);

    const availability = document.getElementById('property-availability');
    const isMaintenance = status === 'maintenance';
    availability.textContent = isMaintenance ? 'Temporarily unavailable' : 'Available to enquire';
    availability.classList.toggle('maintenance', isMaintenance);

    const mapLink = document.getElementById('property-map-link');
    if (property.mapUrl && /^https?:\/\//i.test(property.mapUrl)) {
      mapLink.href = property.mapUrl;
      mapLink.hidden = false;
    }

    const amenities = list(property.amenities || property.features);
    document.getElementById('property-amenities').innerHTML = amenities.length
      ? amenities.map(item => `<div class="property-amenity"><i class="fas ${amenityIcon(item)}" aria-hidden="true"></i><span>${escapeHtml(item)}</span></div>`).join('')
      : '<p>Contact Gonah Homes for the latest amenity details.</p>';

    const nearby = list(property.landmarks);
    if (nearby.length || property.locationDetails) {
      const places = [
        ...(property.locationDetails ? [property.locationDetails] : []),
        ...nearby
      ];
      document.getElementById('property-nearby').innerHTML = places.map(place =>
        `<div class="property-nearby-item"><i class="fas fa-location-dot" aria-hidden="true"></i><span>${escapeHtml(place)}</span></div>`
      ).join('');
      document.getElementById('property-nearby-section').hidden = false;
    }

    const rules = list(property.houseRules);
    document.getElementById('property-rules').innerHTML = rules.length
      ? rules.map(rule => `<li>${escapeHtml(rule)}</li>`).join('')
      : '<li>Please contact Gonah Homes to confirm any property-specific house rules before your stay.</li>';
    document.getElementById('property-rules-section').hidden = false;

    setText('property-booking-instructions', property.bookingInstructions ||
      'Choose your dates and send a booking request. The team will confirm availability and share payment instructions. Your stay is confirmed only after payment is verified.');
    const pricingNotes = document.getElementById('property-pricing-notes');
    if (property.pricingNotes) {
      pricingNotes.textContent = property.pricingNotes;
      pricingNotes.hidden = false;
    }

    const bookButton = document.getElementById('property-book-button');
    if (isMaintenance) {
      bookButton.disabled = true;
      bookButton.innerHTML = '<i class="fas fa-screwdriver-wrench" aria-hidden="true"></i> Not taking bookings';
    }

    const guestSelect = document.getElementById('property-guests');
    guestSelect.innerHTML = Array.from({ length: maxGuests }, (_, index) =>
      `<option value="${index + 1}">${index + 1} ${index === 0 ? 'guest' : 'guests'}</option>`
    ).join('');

    const today = new Date();
    const minDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const checkin = document.getElementById('property-checkin');
    const checkout = document.getElementById('property-checkout');
    checkin.min = minDate;
    checkout.min = minDate;
    checkin.addEventListener('change', () => {
      checkout.min = checkin.value || minDate;
      if (checkout.value && checkout.value <= checkin.value) checkout.value = '';
    });

    renderGallery(property);
    document.getElementById('property-page-state').hidden = true;
    document.getElementById('property-detail-content').hidden = false;
  }

  function createBookingEnquiry(event) {
    event.preventDefault();
    if (!propertyRecord) return;
    const checkin = document.getElementById('property-checkin').value;
    const checkout = document.getElementById('property-checkout').value;
    const guests = document.getElementById('property-guests').value;
    if (!checkin || !checkout || checkout <= checkin) {
      window.alert('Please choose a check-out date that is after check-in.');
      return;
    }

    const reference = `GNH-WA-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const message = [
      'Hi Gonah Homes, I would like to enquire about a stay.',
      `Property: ${propertyRecord.name || 'Gonah Homes property'}`,
      `Check-in: ${checkin}`,
      `Check-out: ${checkout}`,
      `Guests: ${guests}`,
      `Booking enquiry reference: ${reference}`,
      'This is an enquiry only; the booking is not confirmed yet.',
      `Property details: ${window.location.href}`
    ].join('\n');
    const whatsappUrl = `https://wa.me/254799466723?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  }

  function openBookingOnMainSite() {
    if (!propertyRecord) return;
    const url = new URL('index.html', window.location.href);
    url.searchParams.set('book', propertyId);
    url.hash = 'accommodations';
    window.location.href = url.href;
  }

  function setupNavigation() {
    const menu = document.getElementById('nav-menu');
    const hamburger = document.getElementById('hamburger');
    const closeMenu = () => {
      menu.classList.remove('active');
      hamburger.classList.remove('active');
      hamburger.setAttribute('aria-expanded', 'false');
      hamburger.setAttribute('aria-label', 'Open navigation menu');
    };

    hamburger.addEventListener('click', event => {
      event.stopPropagation();
      const open = !menu.classList.contains('active');
      menu.classList.toggle('active', open);
      hamburger.classList.toggle('active', open);
      hamburger.setAttribute('aria-expanded', String(open));
      hamburger.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    });
    menu.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
    document.addEventListener('click', event => {
      if (!menu.contains(event.target) && !hamburger.contains(event.target)) closeMenu();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeMenu();
    });
  }

  document.getElementById('property-gallery-prev').addEventListener('click', () => selectGalleryImage(galleryIndex - 1));
  document.getElementById('property-gallery-next').addEventListener('click', () => selectGalleryImage(galleryIndex + 1));
  document.getElementById('property-whatsapp-form').addEventListener('submit', createBookingEnquiry);
  document.getElementById('property-book-button').addEventListener('click', openBookingOnMainSite);
  setupNavigation();

  if (!propertyId) {
    showError('Choose a property from our accommodation listings to view its details.');
  } else {
    db.collection('property_settings').doc(propertyId).get()
      .then(snapshot => {
        if (!snapshot.exists) {
          showError('We could not find this property. It may have been removed or the link may be incomplete.');
          return;
        }
        renderProperty(snapshot.data() || {});
      })
      .catch(error => {
        console.error('Could not load property details:', error);
        showError('Property details are temporarily unavailable. Please try again in a moment.');
      });
  }
})();
