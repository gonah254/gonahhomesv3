/* =========================
   Booking + Gallery Script
   Clean, robust, and commented
   ========================= */

let checkinPicker = null;
let checkoutPicker = null;
let currentHouse = '';
let bookedDatesCache = {};
let currentGalleryIndex = 0;
let currentGalleryImages = [];

/* -------------------------
   Helper: normalize various date formats to Date
   Accepts: Date, Firestore Timestamp (has toDate), ISO string, yyyy-mm-dd, etc.
   ------------------------- */
function toDate(d) {
  if (!d) return null;
  if (d instanceof Date) return new Date(d.getTime());
  if (typeof d === 'string' || typeof d === 'number') return new Date(d);
  if (typeof d.toDate === 'function') return d.toDate(); // Firestore Timestamp
  return new Date(d);
}

/* -------------------------
   Helper: set a date to midnight local time
   Returns a new Date
   ------------------------- */
function startOfDayLocal(date) {
  const dt = new Date(date);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

/* -------------------------
   Clear cache for a house (use when bookings changed)
   ------------------------- */
function clearBookedDatesCache(houseName) {
  if (houseName) delete bookedDatesCache[houseName];
  else bookedDatesCache = {};
}

/* -------------------------
   Fetch booked date ranges for a house from Firestore
   NOTE: Firestore doesn't support `!=` reliably; we fetch by house and filter locally.
   Returns array of objects: { checkin: Date, checkout: Date }
   ------------------------- */
async function getBookedDates(houseName) {
  if (!houseName) return [];

  if (bookedDatesCache[houseName]) {
    return bookedDatesCache[houseName];
  }

  try {
    const bookingsRef = firebase.firestore().collection('bookings');
    const snapshot = await bookingsRef.where('house', '==', houseName).get();

    const bookedRanges = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      // skip cancelled bookings
      if (data && data.status && data.status.toLowerCase() === 'cancelled') return;

      const rawCheckin = toDate(data.checkin);
      const rawCheckout = toDate(data.checkout);

      if (rawCheckin && rawCheckout) {
        // normalize
        const checkin = startOfDayLocal(rawCheckin);
        const checkout = startOfDayLocal(rawCheckout);
        // only store valid ranges
        if (!isNaN(checkin) && !isNaN(checkout) && checkout > checkin) {
          bookedRanges.push({ checkin, checkout });
        }
      }
    });

    // sort by checkin ascending (helpful later)
    bookedRanges.sort((a, b) => a.checkin - b.checkin);

    bookedDatesCache[houseName] = bookedRanges;
    return bookedRanges;
  } catch (error) {
    console.error('Error fetching booked dates:', error);
    return [];
  }
}

/* -------------------------
   Return true when the date is inside any booked range.
   Booked range is [checkin, checkout) — checkout day is NOT considered booked.
   ------------------------- */
function isDateBooked(date, bookedRanges) {
  if (!date || !Array.isArray(bookedRanges)) return false;
  const currentDate = startOfDayLocal(date);

  for (const range of bookedRanges) {
    const checkin = startOfDayLocal(range.checkin);
    const checkout = startOfDayLocal(range.checkout);
    if (currentDate >= checkin && currentDate < checkout) {
      return true;
    }
  }
  return false;
}

/* -------------------------
   Determine if user can check in on `date`.
   Rules implemented:
    - Allowed if date is exactly the checkout date of an existing booking (back-to-back)
    - Otherwise allowed only if date is not inside any booked range and not in the past.
   ------------------------- */
function canCheckInOnDate(date, bookedRanges) {
  if (!date) return false;

  const currentDate = startOfDayLocal(date);
  const today = startOfDayLocal(new Date());

  // disallow past dates
  if (currentDate < today) return false;

  // allow check-in if it's exactly equal to any checkout (back-to-back)
  for (const range of bookedRanges) {
    const checkout = startOfDayLocal(range.checkout);
    if (currentDate.getTime() === checkout.getTime()) {
      return true;
    }
  }

  // otherwise only when date not inside any existing booking
  return !isDateBooked(currentDate, bookedRanges);
}

/* -------------------------
   Initialize both flatpickr instances for a house
   - Applies color classes via onDayCreate only (no text)
   - Adds redraw on month/year change to preserve classes when navigating months
   - Guards against missing DOM nodes
   ------------------------- */
async function initializeFlatpickr(houseName) {
  currentHouse = houseName;
  const bookedRanges = await getBookedDates(houseName);

  // destroy previous pickers if any
  if (checkinPicker) {
    try { checkinPicker.destroy(); } catch (_) {}
    checkinPicker = null;
  }
  if (checkoutPicker) {
    try { checkoutPicker.destroy(); } catch (_) {}
    checkoutPicker = null;
  }

  const checkinEl = document.querySelector('#booking-checkin');
  const checkoutEl = document.querySelector('#booking-checkout');

  if (!checkinEl && !checkoutEl) {
    console.warn('No calendar input elements found (#booking-checkin or #booking-checkout).');
    return;
  }

  // helper to apply classes inside onDayCreate
  function applyCheckinDayClasses(dayElem) {
    const date = dayElem.dateObj;
    // disable past days visually will be handled by flatpickr minDate, but keep consistent classes
    if (canCheckInOnDate(date, bookedRanges)) {
      dayElem.classList.add('available-date');
      dayElem.classList.remove('booked-date');
    } else {
      dayElem.classList.add('booked-date');
      dayElem.classList.remove('available-date');
    }
  }

  function applyCheckoutDayClasses(dayElem) {
    const date = dayElem.dateObj;
    // available if not inside a booked range and greater than today
    if (!isDateBooked(date, bookedRanges)) {
      dayElem.classList.add('available-date');
      dayElem.classList.remove('booked-date');
    } else {
      dayElem.classList.add('booked-date');
      dayElem.classList.remove('available-date');
    }
  }

  // create checkin picker if element exists
  if (checkinEl) {
    checkinPicker = flatpickr(checkinEl, {
      minDate: 'today',
      dateFormat: 'Y-m-d',
      disableMobile: true,
      onDayCreate: function(dObj, dStr, fp, dayElem) {
        applyCheckinDayClasses(dayElem);
      },
      disable: [
        // disable if cannot check in
        function(date) {
          return !canCheckInOnDate(date, bookedRanges);
        }
      ],
      onChange: function(selectedDates) {
        if (selectedDates && selectedDates.length > 0) {
          updateCheckoutCalendar(selectedDates[0], bookedRanges);
          updateBookingSummary();
        } else {
          // no checkin selected -> reset checkout constraints
          if (checkoutPicker) {
            checkoutPicker.set('minDate', 'today');
            checkoutPicker.set('maxDate', null);
            checkoutPicker.redraw();
          }
          updateBookingSummary();
        }
      },
      onMonthChange: function() { this.redraw(); },
      onYearChange: function() { this.redraw(); },
      onOpen: function() { this.redraw(); }
    });
  }

  // create checkout picker if element exists
  if (checkoutEl) {
    checkoutPicker = flatpickr(checkoutEl, {
      minDate: 'today',
      dateFormat: 'Y-m-d',
      disableMobile: true,
      onDayCreate: function(dObj, dStr, fp, dayElem) {
        applyCheckoutDayClasses(dayElem);
      },
      disable: [
        function(date) {
          // must have checkin selected first
          if (!checkinPicker || !checkinPicker.selectedDates[0]) return true;

          const checkinDate = startOfDayLocal(checkinPicker.selectedDates[0]);
          const target = startOfDayLocal(date);

          // checkout must be after checkin
          if (target <= checkinDate) return true;

          // disable any date that falls inside existing bookings
          if (isDateBooked(target, bookedRanges)) return true;

          // Additionally, if there is an upcoming booking whose checkin is after the selected checkin,
          // we want to prevent selecting a checkout date that is after that upcoming checkin (so you don't jump over another booking).
          // Find the nearest future booking checkin after the user's checkin
          for (const range of bookedRanges) {
            const rangeCheckin = startOfDayLocal(range.checkin);
            if (rangeCheckin > checkinDate) {
              // if user's target date is AFTER that range's checkin, disallow (cannot overlap)
              if (target > rangeCheckin) return true;
              // if target is <= rangeCheckin, it's okay (guest leaves before next checkin)
              break; // we've found the next booking; no need to check further
            }
          }

          return false; // allowed
        }
      ],
      onChange: function() {
        updateBookingSummary();
      },
      onMonthChange: function() { this.redraw(); },
      onYearChange: function() { this.redraw(); },
      onOpen: function() { this.redraw(); }
    });
  }

  // ensure checkout constraints reflect any existing checkin
  if (checkinPicker && checkinPicker.selectedDates[0]) {
    updateCheckoutCalendar(checkinPicker.selectedDates[0], bookedRanges);
  }
}

/* -------------------------
   Recalculate checkout picker's min/max and trigger redraw
   ------------------------- */
function updateCheckoutCalendar(checkinDate, bookedRanges) {
  if (!checkoutPicker) return;
  if (!checkinDate) {
    checkoutPicker.set('minDate', 'today');
    checkoutPicker.set('maxDate', null);
    checkoutPicker.redraw();
    return;
  }

  // set minDate to next day local-safe
  const min = startOfDayLocal(checkinDate);
  min.setDate(min.getDate() + 1);
  checkoutPicker.set('minDate', min);

  // find the nearest booking's checkin after the selected checkin
  let nearestFutureCheckin = null;
  for (const range of bookedRanges) {
    const rc = startOfDayLocal(range.checkin);
    if (rc > startOfDayLocal(checkinDate)) {
      if (!nearestFutureCheckin || rc < nearestFutureCheckin) {
        nearestFutureCheckin = rc;
      }
    }
  }

  if (nearestFutureCheckin) {
    // allow checkout up to the nearest future booking's checkin (guest must leave on or before that day)
    // we set maxDate to nearestFutureCheckin (guest could check out on that morning, but our convention is checkout exclusive).
    // To prevent confusion, set max to nearestFutureCheckin (user will pick a checkout <= that day; UI disable function prevents <= checkin)
    checkoutPicker.set('maxDate', nearestFutureCheckin);
  } else {
    checkoutPicker.set('maxDate', null);
  }

  // trigger a redraw so day classes update
  try { checkoutPicker.redraw(); } catch (e) { /* ignore */ }
}

/* -------------------------
   Update booking summary UI
   Requires DOM nodes with ids:
     #booking-summary, #summary-house, #summary-checkin, #summary-checkout, #summary-nights, #summary-total
   propertiesData must be defined globally with property objects keyed by house name:
     propertiesData[houseName] = { price: Number, currency: 'KSh' or 'USD', ... }
   ------------------------- */
function updateBookingSummary() {
  const checkinDate = checkinPicker?.selectedDates[0] ? startOfDayLocal(checkinPicker.selectedDates[0]) : null;
  const checkoutDateRaw = checkoutPicker?.selectedDates[0] ? startOfDayLocal(checkoutPicker.selectedDates[0]) : null;
  const summaryDiv = document.getElementById('booking-summary');

  if (!summaryDiv) return;

  if (checkinDate && checkoutDateRaw && currentHouse && typeof propertiesData !== 'undefined' && propertiesData[currentHouse]) {
    const checkoutDate = checkoutDateRaw;
    // compute nights: difference in days
    const msPerDay = 1000 * 60 * 60 * 24;
    const nights = Math.round((checkoutDate - checkinDate) / msPerDay);
    const property = propertiesData[currentHouse];
    const pricePerNight = Number(property.price || 0);
    const total = nights * pricePerNight;

    // Format strings safely
    const fmt = d => flatpickr.formatDate(d, 'D, M d, Y');

    document.getElementById('summary-house').textContent = currentHouse;
    document.getElementById('summary-checkin').textContent = fmt(checkinDate);
    document.getElementById('summary-checkout').textContent = fmt(checkoutDate) + ' at 10:00 AM';
    document.getElementById('summary-nights').textContent = `${nights} night${nights !== 1 ? 's' : ''}`;
    const currency = property.currency || '';
    // localized number formatting (fallback)
    const formattedTotal = typeof Intl !== 'undefined'
      ? new Intl.NumberFormat(undefined).format(total)
      : total.toLocaleString();
    document.getElementById('summary-total').textContent = `${currency} ${formattedTotal}`;

    summaryDiv.style.display = 'block';
  } else {
    summaryDiv.style.display = 'none';
  }
}

/* =========================
   Gallery functions (kept compatible)
   ========================= */

function openGalleryModal(houseName) {
  if (typeof propertiesData === 'undefined' || !propertiesData[houseName]) return;

  const property = propertiesData[houseName];
  currentGalleryImages = Array.isArray(property.images) ? property.images.slice() : [];
  currentGalleryIndex = 0;

  const titleEl = document.getElementById('gallery-title');
  const modalBg = document.getElementById('gallery-modal-bg');

  if (titleEl) titleEl.textContent = `${houseName} - Gallery`;
  if (modalBg) modalBg.style.display = 'flex';

  updateGalleryDisplay();
}

function closeGalleryModal() {
  const modalBg = document.getElementById('gallery-modal-bg');
  if (modalBg) modalBg.style.display = 'none';
}

function updateGalleryDisplay() {
  if (!currentGalleryImages || currentGalleryImages.length === 0) {
    // optionally clear UI
    const mainImage = document.getElementById('gallery-current-image');
    if (mainImage) mainImage.removeAttribute('src');
    const thumbnailsDiv = document.getElementById('gallery-thumbnails');
    if (thumbnailsDiv) thumbnailsDiv.innerHTML = '';
    const counter = document.getElementById('gallery-counter-text');
    if (counter) counter.textContent = '0 / 0';
    return;
  }

  // clamp index
  if (currentGalleryIndex < 0) currentGalleryIndex = 0;
  if (currentGalleryIndex >= currentGalleryImages.length) currentGalleryIndex = currentGalleryImages.length - 1;

  const mainImage = document.getElementById('gallery-current-image');
  if (mainImage) mainImage.src = currentGalleryImages[currentGalleryIndex];

  const thumbnailsDiv = document.getElementById('gallery-thumbnails');
  if (thumbnailsDiv) {
    thumbnailsDiv.innerHTML = '';
    currentGalleryImages.forEach((img, index) => {
      const thumb = document.createElement('div');
      thumb.className = 'gallery-thumbnail' + (index === currentGalleryIndex ? ' active' : '');
      thumb.innerHTML = `<img src="${img}" alt="Thumbnail ${index + 1}">`;
      thumb.onclick = () => {
        currentGalleryIndex = index;
        updateGalleryDisplay();
      };
      thumbnailsDiv.appendChild(thumb);
    });
  }

  const counter = document.getElementById('gallery-counter-text');
  if (counter) counter.textContent = `${currentGalleryIndex + 1} / ${currentGalleryImages.length}`;
}

function galleryNext() {
  if (!currentGalleryImages || currentGalleryImages.length === 0) return;
  currentGalleryIndex = (currentGalleryIndex + 1) % currentGalleryImages.length;
  updateGalleryDisplay();
}

function galleryPrev() {
  if (!currentGalleryImages || currentGalleryImages.length === 0) return;
  currentGalleryIndex = (currentGalleryIndex - 1 + currentGalleryImages.length) % currentGalleryImages.length;
  updateGalleryDisplay();
}

/* Expose to window for inline HTML handlers if used */
window.openGalleryModal = openGalleryModal;
window.closeGalleryModal = closeGalleryModal;
window.galleryNext = galleryNext;
window.galleryPrev = galleryPrev;

/* Optional: when modal background clicked close gallery */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('gallery-modal-bg')?.addEventListener('click', (e) => {
    if (e.target.id === 'gallery-modal-bg') {
      closeGalleryModal();
    }
  });
});

/* =========================
   Utility: trigger a full refresh for current house data (re-fetch bookings)
   Call when you know bookings changed on the server.
   ========================= */
async function refreshBookingsForCurrentHouse() {
  if (!currentHouse) return;
  clearBookedDatesCache(currentHouse);
  await initializeFlatpickr(currentHouse);
}

/* Export small utilities if you want to call from console */
window.bookingUtils = {
  initializeFlatpickr,
  refreshBookingsForCurrentHouse,
  clearBookedDatesCache,
  getBookedDates
};
