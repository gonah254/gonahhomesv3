/**
 * script.js — full replacement implementing:
 *  - Flatpickr integration for the booking modal (per-house disabled dates)
 *  - Firestore bookings checks (no overlapping bookings; checkout exclusive)
 *  - Gallery modal opened from card image overlay, with thumbnails and navigation
 *  - "Book This Property" action inside gallery that opens booking modal (prefilled)
 *  - Price tags displayed in Ksh (from data-price or Firestore 'properties' collection)
 *
 * Notes:
 *  - This script uses Firebase compat (firebase.firestore()). Ensure your firebase.initializeApp(...) runs
 *    before this script. If you want the script to initialize Firebase, paste your firebaseConfig into
 *    the block below (it will only init if no app exists).
 *  - Flatpickr must be loaded before this script (index.html includes it).
 */

/* ===========================
   Optional Firebase init placeholder
   If you already initialize Firebase elsewhere, this will detect and skip.
   If you want to inline your config here, paste it into firebaseConfig.
*/
if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length === 0) {
  // If you want the script to initialize Firebase, uncomment and paste your config:
  // const firebaseConfig = { apiKey: '...', authDomain: '...', projectId: '...', ... };
  // firebase.initializeApp(firebaseConfig);
}

/* ===========================
   Utilities
   =========================== */
function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}
window.scrollToSection = scrollToSection;

function toDate(value) {
  if (!value) return null;
  if (value && typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const iso = value.length === 10 ? (value + 'T00:00:00') : value;
    const d = new Date(iso);
    if (!isNaN(d)) return d;
  }
  if (typeof value === 'number') return new Date(value);
  return null;
}
function normalizeToMidnight(date) {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  return d;
}
function toYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,'0');
  const d = String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}
function rangesOverlap(aStart,aEnd,bStart,bEnd) {
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
}

/* ===========================
   Firestore setup & cache
   =========================== */
const db = (typeof firebase !== 'undefined' && firebase.firestore) ? firebase.firestore() : null;
const houseBookings = {}; // houseName -> [{checkin:Date,checkout:Date,id}]

// Build cache from docs (array of plain or snapshot-doc-like objects)
function buildHouseBookingsFromDocs(docs) {
  Object.keys(houseBookings).forEach(k => delete houseBookings[k]);
  docs.forEach(doc => {
    const data = doc.data ? doc.data() : doc;
    const house = data.house;
    if (!house) return;
    const ci = toDate(data.checkin), co = toDate(data.checkout);
    if (!ci || !co) return;
    const checkin = normalizeToMidnight(ci), checkout = normalizeToMidnight(co);
    if (!houseBookings[house]) houseBookings[house] = [];
    houseBookings[house].push({ id: doc.id || data.id || null, checkin, checkout, raw: data });
  });
  Object.keys(houseBookings).forEach(h => houseBookings[h].sort((a,b) => a.checkin - b.checkin));
}

// Subscribe to bookings collection to keep cache up-to-date
function subscribeToBookings() {
  if (!db) return;
  db.collection('bookings').onSnapshot(snapshot => {
    const docs = [];
    snapshot.forEach(doc => docs.push({ id: doc.id, ...doc.data() }));
    buildHouseBookingsFromDocs(docs);
  }, err => console.error('bookings onSnapshot error', err));
}

/* ===========================
   Flatpickr setup
   =========================== */
let fpCheckin = null, fpCheckout = null, currentHouseForCalendar = null;
function initFlatpickr() {
  if (typeof flatpickr === 'undefined') {
    console.warn('Flatpickr missing — include it before script.js');
    return;
  }
  const ciEl = document.getElementById('booking-checkin');
  const coEl = document.getElementById('booking-checkout');
  if (!ciEl || !coEl) return;

  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate()+1);

  fpCheckin = flatpickr(ciEl, {
    dateFormat: 'Y-m-d',
    minDate: 'today',
    disable: [d => false],
    onChange(selectedDates) {
      const s = selectedDates[0];
      if (s && fpCheckout) {
        const minCo = new Date(s.getTime()); minCo.setDate(minCo.getDate()+1);
        fpCheckout.set('minDate', minCo);
        if (!fpCheckout.selectedDates[0] || fpCheckout.selectedDates[0].getTime() <= s.getTime()) fpCheckout.clear();
      }
    }
  });

  fpCheckout = flatpickr(coEl, {
    dateFormat: 'Y-m-d',
    minDate: tomorrow,
    disable: [d => false]
  });
}

// Determine whether a date should be disabled for a house (bookings occupy [checkin, checkout) — checkout exclusive)
function isDateBlockedForHouse(house, date) {
  if (!house || !houseBookings[house] || houseBookings[house].length === 0) return false;
  const d = normalizeToMidnight(date);
  return houseBookings[house].some(b => d.getTime() >= b.checkin.getTime() && d.getTime() < b.checkout.getTime());
}

// Apply disable function to flatpickr instances for the selected house
function updateFlatpickrDisableForHouse(house) {
  currentHouseForCalendar = house;
  if (!fpCheckin || !fpCheckout) return;
  const disableFn = date => isDateBlockedForHouse(house, date);
  fpCheckin.set('disable', [disableFn]);
  fpCheckout.set('disable', [disableFn]);
  const ci = fpCheckin.selectedDates[0];
  if (ci) { const minCo = new Date(ci.getTime()); minCo.setDate(minCo.getDate()+1); fpCheckout.set('minDate', minCo); } else { fpCheckout.set('minDate','today'); }
}

/* ===========================
   Booking modal open/close & submit
   =========================== */
function showBookingModal(house, price) {
  currentHouseForCalendar = house;
  const modal = document.getElementById('booking-modal-bg');
  const inputHouse = document.getElementById('booking-house');
  const label = document.getElementById('booking-house-label');
  const priceSpan = document.getElementById('booking-modal-price');

  if (inputHouse) inputHouse.value = house || '';
  if (label) label.textContent = house || '—';
  if (priceSpan) priceSpan.textContent = price || '0';

  const form = document.getElementById('booking-form'); if (form) form.reset();
  const err = document.getElementById('booking-error'); if (err) { err.style.display = 'none'; err.textContent = ''; }

  if (modal) { modal.style.display = 'flex'; modal.setAttribute('aria-hidden','false'); }

  if (fpCheckin) fpCheckin.clear();
  if (fpCheckout) { fpCheckout.clear(); fpCheckout.set('minDate', new Date(Date.now() + 24*60*60*1000)); }
  updateFlatpickrDisableForHouse(house);
}
function closeBookingModal() { const m = document.getElementById('booking-modal-bg'); if (m){ m.style.display='none'; m.setAttribute('aria-hidden','true'); } }
window.openBookingModal = showBookingModal; window.closeBookingModal = closeBookingModal;

function isOverlappingExisting(house, checkin, checkout) {
  if (!houseBookings[house]) return false;
  return houseBookings[house].some(b => rangesOverlap(checkin, checkout, b.checkin, b.checkout));
}

// Submit booking; final server-side re-check to avoid races
async function submitBooking(formData) {
  if (!db) throw new Error('Database not available.');
  const house = formData.get('house');
  const name = formData.get('name');
  const email = formData.get('email');
  const phone = formData.get('phone');
  const guests = formData.get('guests');
  const checkinRaw = formData.get('checkin');
  const checkoutRaw = formData.get('checkout');

  const ci = toDate(checkinRaw) || normalizeToMidnight(new Date(checkinRaw));
  const co = toDate(checkoutRaw) || normalizeToMidnight(new Date(checkoutRaw));
  if (!ci || !co || co.getTime() <= ci.getTime()) throw new Error('Please select valid check-in and check-out dates (check-out must be after check-in).');
  const checkin = normalizeToMidnight(ci), checkout = normalizeToMidnight(co);

  // client-side quick check
  if (isOverlappingExisting(house, checkin, checkout)) throw new Error('Selected dates overlap an existing booking. Please choose different dates.');

  // server-side re-check
  const snapshot = await db.collection('bookings').where('house','==',house).get();
  const remote = [];
  snapshot.forEach(doc => {
    const d = doc.data();
    const rci = toDate(d.checkin), rco = toDate(d.checkout);
    if (rci && rco) remote.push({ checkin: normalizeToMidnight(rci), checkout: normalizeToMidnight(rco) });
  });
  const conflict = remote.some(b => rangesOverlap(checkin, checkout, b.checkin, b.checkout));
  if (conflict) throw new Error('Another booking was made while you were selecting dates. Please choose other dates.');

  // save booking (store as YYYY-MM-DD strings)
  const bookingDoc = {
    house,
    name,
    email,
    phone,
    guests: Number(guests || 1),
    checkin: toYMD(checkin),
    checkout: toYMD(checkout),
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    status: 'pending'
  };
  await db.collection('bookings').add(bookingDoc);
  return bookingDoc;
}

/* ===========================
   Gallery modal
   =========================== */
const galleryModal = document.getElementById('gallery-modal');
const galleryMainImg = document.getElementById('gallery-main-img');
const galleryThumbs = document.getElementById('gallery-thumbs');
const galleryPrev = document.getElementById('gallery-prev');
const galleryNext = document.getElementById('gallery-next');
const galleryClose = document.getElementById('gallery-close');
const galleryTitle = document.getElementById('gallery-title');
const galleryHouseLabel = document.getElementById('gallery-house-label');
const galleryPriceSpan = document.getElementById('gallery-price');
const galleryBookBtn = document.getElementById('gallery-book-btn');

let galleryImages = [], galleryIndex = 0, galleryCurrentHouse = '', galleryCurrentPrice = 0;

function openGallery(houseName, images, price) {
  galleryImages = Array.isArray(images) ? images.slice() : [];
  galleryIndex = 0;
  galleryCurrentHouse = houseName || '';
  galleryCurrentPrice = price || 0;
  if (galleryTitle) galleryTitle.textContent = (houseName ? (houseName + ' — Photos') : 'Photos');
  if (galleryHouseLabel) galleryHouseLabel.textContent = houseName || '—';
  if (galleryPriceSpan) galleryPriceSpan.textContent = galleryCurrentPrice || '0';
  renderGallery();
  if (galleryModal) { galleryModal.classList.add('active'); galleryModal.setAttribute('aria-hidden','false'); }
  if (galleryBookBtn) galleryBookBtn.onclick = () => showBookingModal(galleryCurrentHouse, galleryCurrentPrice);
}
function closeGallery() { if (galleryModal){ galleryModal.classList.remove('active'); galleryModal.setAttribute('aria-hidden','true'); } galleryImages = []; if (galleryThumbs) galleryThumbs.innerHTML = ''; }
function renderGallery() {
  if (!galleryImages || galleryImages.length === 0) return;
  const src = galleryImages[galleryIndex];
  if (galleryMainImg) { galleryMainImg.src = src; galleryMainImg.alt = `Photo ${galleryIndex+1} of ${galleryImages.length}`; }
  if (!galleryThumbs) return;
  galleryThumbs.innerHTML = '';
  galleryImages.forEach((s,i) => {
    const div = document.createElement('div');
    div.className = 'gallery-thumb' + (i===galleryIndex ? ' active' : '');
    div.innerHTML = `<img src="${s}" alt="thumb ${i+1}" />`;
    div.addEventListener('click', () => { galleryIndex = i; renderGallery(); });
    galleryThumbs.appendChild(div);
  });
}
function galleryNextImg() { if (!galleryImages.length) return; galleryIndex = (galleryIndex+1)%galleryImages.length; renderGallery(); }
function galleryPrevImg() { if (!galleryImages.length) return; galleryIndex = (galleryIndex-1+galleryImages.length)%galleryImages.length; renderGallery(); }

/* ===========================
   Wiring up cards, forms, controls
   =========================== */
const fallbackPrices = { "Studio Apartment":6000, "One Bedroom Apartment":8000, "Two Bedroom Apartment":11000, "Luxury Maisonette":12000 };

function initPropertyCards() {
  document.querySelectorAll('.accommodation-card').forEach(card => {
    const house = card.dataset.house || (card.querySelector('h3') ? card.querySelector('h3').textContent.trim() : '');
    const price = card.dataset.price || fallbackPrices[house] || 0;
    const imagesAttr = card.dataset.images;
    let images = [];
    if (imagesAttr) {
      try { images = JSON.parse(imagesAttr); } catch(e) { images = []; }
    }
    if (!images.length) {
      const img = card.querySelector('img'); if (img && img.src) images = [img.src];
    }

    // Image overlay / click opens gallery
    const cardImage = card.querySelector('.card-image');
    if (cardImage) {
      cardImage.addEventListener('click', (e) => { openGallery(house, images, price); });
      // overlay button inside image
      const overlayBtn = cardImage.querySelector('[data-action="view-photos"]');
      if (overlayBtn) overlayBtn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); openGallery(house, images, price); });
    }

    // Book button on card
    const bookBtn = card.querySelector('[data-action="book-btn"]') || card.querySelector('.btn.btn-primary');
    if (bookBtn) bookBtn.addEventListener('click', (e) => { e.preventDefault(); showBookingModal(house, price); });

    // set visible price if element exists
    const pv = card.querySelector('.price-value'); if (pv) pv.textContent = price;
  });
}

function initBookingForm() {
  const form = document.getElementById('booking-form');
  const modalBg = document.getElementById('booking-modal-bg');
  if (!form || !modalBg) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('booking-error'); if (err) { err.style.display='none'; err.textContent=''; }
    const fd = new FormData(form);
    try {
      await submitBooking(fd);
      const confirmEl = document.getElementById('booking-confirm');
      form.style.display = 'none'; if (confirmEl) confirmEl.style.display = 'block';
      setTimeout(()=>{ if (confirmEl) confirmEl.style.display='none'; form.style.display='block'; closeBookingModal(); }, 2500);
    } catch (err) {
      if (err && document.getElementById('booking-error')) { const eEl = document.getElementById('booking-error'); eEl.style.display='block'; eEl.textContent = err.message || 'Error submitting booking.'; }
    }
  });
  modalBg.addEventListener('click', (e) => { if (e.target === modalBg) closeBookingModal(); });
}

function initGalleryControls() {
  if (!galleryModal) return;
  if (galleryNext) galleryNext.addEventListener('click', galleryNextImg);
  if (galleryPrev) galleryPrev.addEventListener('click', galleryPrevImg);
  if (galleryClose) galleryClose.addEventListener('click', closeGallery);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (galleryModal.classList.contains('active')) closeGallery();
      const bm = document.getElementById('booking-modal-bg'); if (bm && bm.style.display === 'flex') closeBookingModal();
    }
    if (e.key === 'ArrowRight' && galleryModal.classList.contains('active')) galleryNextImg();
    if (e.key === 'ArrowLeft' && galleryModal.classList.contains('active')) galleryPrevImg();
  });
  galleryModal.addEventListener('click', (e) => { if (e.target === galleryModal) closeGallery(); });
}

/* Load optional properties collection to override card dataset values */
function loadPropertiesFromFirestore() {
  if (!db) return;
  db.collection('properties').get().then(snapshot => {
    snapshot.forEach(doc => {
      const data = doc.data(); const name = data.name; if (!name) return;
      const card = Array.from(document.querySelectorAll('.accommodation-card')).find(c => (c.dataset.house || '').trim() === name.trim());
      if (!card) return;
      if (data.price !== undefined && data.price !== null) { card.dataset.price = String(data.price); const pv = card.querySelector('.price-value'); if (pv) pv.textContent = String(data.price); }
      if (Array.isArray(data.images) && data.images.length) card.dataset.images = JSON.stringify(data.images);
    });
  }).catch(err => console.info('properties not loaded:', err));
}

/* ===========================
   Initialize when DOM ready
   =========================== */
document.addEventListener('DOMContentLoaded', () => {
  initFlatpickr();
  initPropertyCards();
  initBookingForm();
  initGalleryControls();
  subscribeToBookings();
  loadPropertiesFromFirestore();
});
