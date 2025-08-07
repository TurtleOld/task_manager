// Color Theme Selector
document.addEventListener('DOMContentLoaded', function() {
    const colorCircles = document.querySelectorAll('.color-circle');
    
    // Apply current theme color on page load
    const currentThemeColor = document.body.getAttribute('data-theme-color');
    if (currentThemeColor) {
        applyColorTheme(currentThemeColor);
    }
    
    colorCircles.forEach(circle => {
        circle.addEventListener('click', function() {
            const selectedColor = this.dataset.color;
            
            // Remove active class from all circles
            colorCircles.forEach(c => c.classList.remove('active'));
            
            // Add active class to clicked circle
            this.classList.add('active');
            
            // Send AJAX request to update user's theme color
            updateThemeColor(selectedColor);
        });
    });
});

function updateThemeColor(color) {
    const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value || 
                     document.cookie.split('; ').find(row => row.startsWith('csrftoken='))?.split('=')[1];
    
    fetch('/users/update-theme-color/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken,
        },
        body: JSON.stringify({
            theme_color: color
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Apply the new color theme immediately
            applyColorTheme(color);
            
            // Show success message
            showNotification('Цвет темы успешно обновлен!', 'success');
        } else {
            showNotification('Ошибка при обновлении цвета темы', 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification('Ошибка при обновлении цвета темы', 'error');
    });
}

function applyColorTheme(color) {
    const root = document.documentElement;
    const body = document.body;
    
    // Update body data attribute
    body.setAttribute('data-theme-color', color);
    
    // Define color mappings for each theme
    const colorThemes = {
        red: {
            '--color-primary': '#ff3860',
            '--color-primary-dark': '#cc2a4a',
            '--color-primary-light': '#ff5a7a',
            '--color-primary-rgb': '255, 56, 96'
        },
        orange: {
            '--color-primary': '#ff7f50',
            '--color-primary-dark': '#e65a2b',
            '--color-primary-light': '#ff9a6b',
            '--color-primary-rgb': '255, 127, 80'
        },
        yellow: {
            '--color-primary': '#ffdd57',
            '--color-primary-dark': '#e6c74e',
            '--color-primary-light': '#ffe066',
            '--color-primary-rgb': '255, 221, 87'
        },
        green: {
            '--color-primary': '#48c774',
            '--color-primary-dark': '#3aa85e',
            '--color-primary-light': '#5dd485',
            '--color-primary-rgb': '72, 199, 116'
        },
        blue: {
            '--color-primary': '#3273dc',
            '--color-primary-dark': '#205081',
            '--color-primary-light': '#4fc08d',
            '--color-primary-rgb': '50, 115, 220'
        },
        indigo: {
            '--color-primary': '#4b0082',
            '--color-primary-dark': '#3a0066',
            '--color-primary-light': '#5a1a99',
            '--color-primary-rgb': '75, 0, 130'
        },
        purple: {
            '--color-primary': '#8b5cf6',
            '--color-primary-dark': '#7c3aed',
            '--color-primary-light': '#a78bfa',
            '--color-primary-rgb': '139, 92, 246'
        }
    };
    
    const theme = colorThemes[color];
    if (theme) {
        Object.entries(theme).forEach(([property, value]) => {
            root.style.setProperty(property, value);
        });
    }
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        transform: translateX(100%);
        transition: transform 0.3s ease;
        max-width: 300px;
        word-wrap: break-word;
    `;
    
    // Set background color based on type
    if (type === 'success') {
        notification.style.backgroundColor = '#48c774';
    } else if (type === 'error') {
        notification.style.backgroundColor = '#ff3860';
    } else {
        notification.style.backgroundColor = '#3273dc';
    }
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}
