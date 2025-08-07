/* === FONT LOADER === */

// Font loading optimization
document.addEventListener('DOMContentLoaded', function() {
  // Check if fonts are loaded
  if ('fonts' in document) {
    // Load Inter font
    const interFont = new FontFace('Inter', 'url(https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap)');
    
    // Load JetBrains Mono font
    const jetbrainsFont = new FontFace('JetBrains Mono', 'url(https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap)');
    
    // Promise to load all fonts
    Promise.all([
      interFont.load(),
      jetbrainsFont.load()
    ]).then(function(fonts) {
      // Add fonts to document
      fonts.forEach(font => document.fonts.add(font));
      
      // Add class to body when fonts are loaded
      document.body.classList.add('fonts-loaded');
      
      // Trigger custom event
      document.dispatchEvent(new CustomEvent('fontsLoaded'));
      
      console.log('Fonts loaded successfully');
    }).catch(function(error) {
      console.warn('Font loading failed:', error);
      // Fallback to system fonts
      document.body.classList.add('fonts-fallback');
    });
  } else {
    // Fallback for browsers that don't support Font Loading API
    document.body.classList.add('fonts-fallback');
  }
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
    
    if (fontLoadTime > 1000) {
      console.warn('Font loading took longer than expected:', fontLoadTime + 'ms');
    }
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
