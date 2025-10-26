// Property data with gallery images and prices
const propertyData = {
  'Studio Apartment': {
    price: 3500,
    images: [
      'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1536376072261-38c75010e6c9?w=800&h=600&fit=crop'
    ]
  },
  'One Bedroom Apartment': {
    price: 5000,
    images: [
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&h=600&fit=crop'
    ]
  },
  'Two Bedroom Apartment': {
    price: 7500,
    images: [
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&h=600&fit=crop'
    ]
  },
  'Three Bedroom Apartment': {
    price: 10000,
    images: [
      'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1571624436279-b272aff752b5?w=800&h=600&fit=crop'
    ]
  },
  'Four Bedroom Apartment': {
    price: 15000,
    images: [
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1571624436279-b272aff752b5?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&h=600&fit=crop'
    ]
  },
  'Luxury Maisonette': {
    price: 20000,
    images: [
      'https://images.unsplash.com/photo-1571624436279-b272aff752b5?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&h=600&fit=crop'
    ]
  }
};

// Gallery functionality
let currentSlideIndex = 0;
let currentGalleryProperty = '';

function openGallery(propertyName) {
  currentGalleryProperty = propertyName;
  const property = propertyData[propertyName];
  
  if (!property) return;
  
  const modal = document.getElementById('gallery-modal');
  const title = document.getElementById('gallery-title');
  const imagesContainer = document.getElementById('gallery-images');
  const thumbnailsContainer = document.getElementById('gallery-thumbnails');
  
  title.textContent = propertyName;
  
  // Load images
  imagesContainer.innerHTML = property.images.map((img, index) => 
    `<img src="${img}" alt="${propertyName}" class="gallery-image ${index === 0 ? 'active' : ''}" data-index="${index}">`
  ).join('');
  
  // Load thumbnails
  thumbnailsContainer.innerHTML = property.images.map((img, index) => 
    `<img src="${img}" alt="${propertyName}" class="gallery-thumbnail ${index === 0 ? 'active' : ''}" onclick="goToSlide(${index})">`
  ).join('');
  
  currentSlideIndex = 0;
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeGallery() {
  const modal = document.getElementById('gallery-modal');
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

function goToSlide(index) {
  const images = document.querySelectorAll('.gallery-image');
  const thumbnails = document.querySelectorAll('.gallery-thumbnail');
  
  images.forEach(img => img.classList.remove('active'));
  thumbnails.forEach(thumb => thumb.classList.remove('active'));
  
  images[index].classList.add('active');
  thumbnails[index].classList.add('active');
  currentSlideIndex = index;
}

function nextSlide() {
  const property = propertyData[currentGalleryProperty];
  if (!property) return;
  
  currentSlideIndex = (currentSlideIndex + 1) % property.images.length;
  goToSlide(currentSlideIndex);
}

function prevSlide() {
  const property = propertyData[currentGalleryProperty];
  if (!property) return;
  
  currentSlideIndex = (currentSlideIndex - 1 + property.images.length) % property.images.length;
  goToSlide(currentSlideIndex);
}

// Flatpickr integration with Firestore booking validation
let checkinPicker, checkoutPicker;
let currentHouse = '';

async function getBookedDates(house) {
  try {
    const bookingsRef = db.collection('bookings');
    const snapshot = await bookingsRef.where('house', '==', house).get();
    
    const bookedDates = [];
    
    snapshot.forEach(doc => {
      const booking = doc.data();
      const checkin = new Date(booking.checkin);
      const checkout = new Date(booking.checkout);
      
      // Add all dates in the range, excluding checkout day (it's available for new booking)
      for (let d = new Date(checkin); d < checkout; d.setDate(d.getDate() + 1)) {
        bookedDates.push(new Date(d).toDateString());
      }
    });
    
    return bookedDates;
  } catch (error) {
    console.error('Error fetching booked dates:', error);
    return [];
  }
}

async function initializeFlatpickr(house) {
  currentHouse = house;
  const bookedDates = await getBookedDates(house);
  
  // Destroy existing pickers
  if (checkinPicker) checkinPicker.destroy();
  if (checkoutPicker) checkoutPicker.destroy();
  
  // Initialize check-in picker
  checkinPicker = flatpickr('#booking-checkin', {
    minDate: 'today',
    dateFormat: 'Y-m-d',
    disable: bookedDates.map(d => new Date(d)),
    onChange: function(selectedDates) {
      if (selectedDates.length > 0) {
        // Update checkout picker minimum date
        const nextDay = new Date(selectedDates[0]);
        nextDay.setDate(nextDay.getDate() + 1);
        checkoutPicker.set('minDate', nextDay);
        
        // Clear checkout if it's now invalid
        const checkoutDate = checkoutPicker.selectedDates[0];
        if (checkoutDate && checkoutDate <= selectedDates[0]) {
          checkoutPicker.clear();
        }
      }
    }
  });
  
  // Initialize checkout picker
  checkoutPicker = flatpickr('#booking-checkout', {
    minDate: 'today',
    dateFormat: 'Y-m-d',
    disable: bookedDates.map(d => new Date(d)),
    onChange: function(selectedDates) {
      if (selectedDates.length > 0 && checkinPicker.selectedDates.length > 0) {
        validateBookingDates();
      }
    }
  });
}

async function validateBookingDates() {
  const checkinDate = checkinPicker.selectedDates[0];
  const checkoutDate = checkoutPicker.selectedDates[0];
  
  if (!checkinDate || !checkoutDate) return true;
  
  // Check for overlapping bookings
  try {
    const bookingsRef = db.collection('bookings');
    const snapshot = await bookingsRef.where('house', '==', currentHouse).get();
    
    for (const doc of snapshot.docs) {
      const booking = doc.data();
      const existingCheckin = new Date(booking.checkin);
      const existingCheckout = new Date(booking.checkout);
      
      // Check if dates overlap (checkout day is exclusive)
      const overlap = (checkinDate < existingCheckout && checkoutDate > existingCheckin);
      
      if (overlap) {
        showCustomAlert(
          'Selected dates overlap with an existing booking. Please choose different dates.',
          'error'
        );
        checkoutPicker.clear();
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error validating dates:', error);
    return true;
  }
}

// Make functions globally available
window.openGallery = openGallery;
window.closeGallery = closeGallery;
window.nextSlide = nextSlide;
window.prevSlide = prevSlide;
window.goToSlide = goToSlide;
