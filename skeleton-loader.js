/**
 * Skeleton Loader Utility
 * Handles image loading states with skeleton placeholders
 */

class SkeletonLoader {
  constructor(options = {}) {
    this.timeout = options.timeout || 5000; // Fallback timeout
    this.retries = options.retries || 3;
    this.loadedImages = new Set();
  }

  /**
   * Create a skeleton placeholder
   */
  createSkeleton(width = '100%', height = '250px', shape = 'rectangle') {
    const skeleton = document.createElement('div');
    skeleton.className = 'skeleton skeleton-image';
    skeleton.style.width = width;
    skeleton.style.height = height;

    if (shape === 'circular') {
      skeleton.style.borderRadius = '50%';
      skeleton.style.width = height;
    }

    return skeleton;
  }

  /**
   * Replace image with skeleton and handle loading
   */
  replaceWithSkeleton(img, options = {}) {
    const {
      width = '100%',
      height = '250px',
      shape = 'rectangle',
      timeout = this.timeout,
      onLoad = null,
      onError = null,
    } = options;

    // Create skeleton
    const skeleton = this.createSkeleton(width, height, shape);
    skeleton.setAttribute('data-image-url', img.src);

    // Insert skeleton before image
    img.parentNode.insertBefore(skeleton, img);

    // Add loading class to image
    img.classList.add('loading');
    img.style.display = 'none';

    // Handle successful image load
    const handleLoad = () => {
      if (!this.loadedImages.has(img.src)) {
        this.loadedImages.add(img.src);

        // Remove skeleton with fade transition
        skeleton.style.opacity = '1';
        skeleton.style.transition = 'opacity 0.3s ease-in-out';

        setTimeout(() => {
          skeleton.remove();
          img.classList.remove('loading');
          img.classList.add('loaded', 'fade-in');
          img.style.display = 'block';

          if (onLoad) onLoad(img);
        }, 300);
      }

      cleanup();
    };

    // Handle image load error
    const handleError = () => {
      console.warn(`Failed to load image: ${img.src}`);
      skeleton.innerHTML = `
        <div style="
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          background: #f5f5f5;
          color: #999;
        ">
          <i class="fas fa-image" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
          <span style="font-size: 0.85rem;">Image unavailable</span>
        </div>
      `;
      skeleton.style.background = '#f5f5f5';
      skeleton.style.animation = 'none';

      if (onError) onError(img);
      cleanup();
    };

    // Cleanup event listeners and timeout
    const cleanup = () => {
      img.removeEventListener('load', handleLoad);
      img.removeEventListener('error', handleError);
      clearTimeout(timeoutId);
    };

    // Set timeout fallback
    const timeoutId = setTimeout(() => {
      if (!this.loadedImages.has(img.src)) {
        handleError();
      }
    }, timeout);

    // Attach event listeners
    img.addEventListener('load', handleLoad);
    img.addEventListener('error', handleError);
  }

  /**
   * Initialize all images with skeletons
   */
  initializeImages(selector = 'img', options = {}) {
    const images = document.querySelectorAll(selector);

    images.forEach((img) => {
      // Skip already processed images
      if (img.dataset.skeletonInitialized === 'true') return;

      // Skip images without src or already loaded
      if (!img.src || img.complete) {
        img.classList.add('loaded');
        return;
      }

      img.dataset.skeletonInitialized = 'true';
      this.replaceWithSkeleton(img, options);
    });
  }

  /**
   * Watch for new images added to DOM
   */
  observeNewImages(selector = 'img', options = {}) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const images = node.querySelectorAll ? node.querySelectorAll(selector) : [];
            if (node.matches && node.matches(selector)) {
              this.replaceWithSkeleton(node, options);
            }
            images.forEach((img) => {
              if (img.dataset.skeletonInitialized !== 'true') {
                this.replaceWithSkeleton(img, options);
              }
            });
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return observer;
  }

  /**
   * Preload an image
   */
  preloadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.loadedImages.add(src);
        resolve(img);
      };
      img.onerror = reject;
      img.src = src;
    });
  }

  /**
   * Preload multiple images
   */
  preloadImages(srcs) {
    return Promise.all(srcs.map((src) => this.preloadImage(src)));
  }
}

// Global instance
const skeletonLoader = new SkeletonLoader({
  timeout: 5000,
  retries: 3,
});

/**
 * Initialize skeleton loaders when DOM is ready
 */
function initSkeletonLoaders() {
  // Initialize for card images
  skeletonLoader.initializeImages('.accommodation-card img, .card-image img', {
    height: '250px',
    timeout: 5000,
  });

  // Initialize for featured image
  skeletonLoader.initializeImages('.featured-image img', {
    height: '400px',
    timeout: 5000,
  });

  // Initialize for hero slideshow
  skeletonLoader.initializeImages('.slide img', {
    height: '100vh',
    timeout: 7000,
  });

  // Initialize for testimonial avatars
  skeletonLoader.initializeImages('.author-avatar', {
    width: '50px',
    height: '50px',
    shape: 'circular',
    timeout: 3000,
  });

  // Initialize for all other images
  skeletonLoader.initializeImages('img:not([data-skeleton-initialized])', {
    timeout: 5000,
  });

  // Watch for dynamically added images
  skeletonLoader.observeNewImages('img');
}

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSkeletonLoaders);
} else {
  initSkeletonLoaders();
}

/**
 * Expose for manual use
 */
window.SkeletonLoader = SkeletonLoader;
window.skeletonLoader = skeletonLoader;
