/* === FONT LOADER === */

// Font loading optimization
document.addEventListener('DOMContentLoaded', function() {
  // Load Google Fonts using link elements
  const fontLinks = [
    {
      href: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
      rel: 'stylesheet'
    },
    {
      href: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap',
      rel: 'stylesheet'
    }
  ];
  
  // Add font links to head
  fontLinks.forEach(fontLink => {
    const link = document.createElement('link');
    link.href = fontLink.href;
    link.rel = fontLink.rel;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  });
  
  // Check if fonts are available after a short delay
  setTimeout(function() {
    if ('fonts' in document) {
      // Check if fonts are loaded
      document.fonts.ready.then(function() {
        document.body.classList.add('fonts-loaded');
        document.dispatchEvent(new CustomEvent('fontsLoaded'));
      }).catch(function(error) {
        document.body.classList.add('fonts-fallback');
      });
    } else {
      // Fallback for browsers that don't support Font Loading API
      document.body.classList.add('fonts-fallback');
    }
  }, 1000);
});

// Font display optimization
function optimizeFontDisplay() {
  // Add font-display: swap to all font-face rules
  const style = document.createElement('style');
  style.textContent = `
    @font-face {
      font-family: 'Inter';
      font-display: swap;
    }
    @font-face {
      font-family: 'JetBrains Mono';
      font-display: swap;
    }
  `;
  document.head.appendChild(style);
}

// Preload critical fonts
function preloadCriticalFonts() {
  const links = [
    {
      rel: 'preload',
      href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap',
      as: 'style',
      crossorigin: 'anonymous'
    },
    {
      rel: 'preload',
      href: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap',
      as: 'style',
      crossorigin: 'anonymous'
    }
  ];
  
  links.forEach(link => {
    const linkElement = document.createElement('link');
    Object.assign(linkElement, link);
    document.head.appendChild(linkElement);
  });
}

// Initialize font optimization
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    optimizeFontDisplay();
    preloadCriticalFonts();
  });
} else {
  optimizeFontDisplay();
  preloadCriticalFonts();
}

// Font loading performance monitoring
if ('performance' in window) {
  window.addEventListener('load', function() {
    // Measure font loading time
    const fontLoadTime = performance.getEntriesByType('resource')
      .filter(entry => entry.name.includes('fonts.googleapis.com'))
      .reduce((total, entry) => total + entry.duration, 0);
    
    // Font loading performance monitoring (silent)
  });
}

// Fallback font detection
function detectSystemFonts() {
  const testString = 'mmmmmmmmmmlli';
  const testSize = '72px';
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  const fonts = [
    'Inter',
    'Roboto',
    'Segoe UI',
    'Helvetica Neue',
    'Arial',
    'sans-serif'
  ];
  
  const widths = fonts.map(font => {
    context.font = `${testSize} ${font}`;
    return context.measureText(testString).width;
  });
  
  // Find the first available font
  const baseWidth = widths[widths.length - 1]; // sans-serif fallback
  const availableFont = fonts.find((font, index) => widths[index] !== baseWidth);
  
  return availableFont || 'sans-serif';
}

// Apply system font fallback if needed
document.addEventListener('fontsLoaded', function() {
  const systemFont = detectSystemFonts();
  if (systemFont !== 'Inter') {
    document.documentElement.style.setProperty('--font-family-primary', `'${systemFont}', ${document.documentElement.style.getPropertyValue('--font-family-primary')}`);
  }
});
