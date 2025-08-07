/* === TASK DETAIL PAGE JAVASCRIPT === */
/* global modalManager */

document.addEventListener('DOMContentLoaded', function () {
    // Modal manager
    if (typeof modalManager !== 'undefined' && modalManager && typeof modalManager.attach === 'function') {
        modalManager.attach(
            'preview-image-button',
            'image-modal',
            function() {
                const imageElement = document.getElementById('preview-image');
                return imageElement ? imageElement.src : '';
            }
        );
    }
    
    // Initialize progress bars
    initializeProgressBars();

    // Description toggle functionality
    const descriptionToggle = document.getElementById('description-toggle');
    if (descriptionToggle) {
        const descriptionShort = document.querySelector('.description-short');
        const descriptionFull = document.querySelector('.description-full');
        const toggleText = descriptionToggle.querySelector('.toggle-text');
        const toggleIcon = descriptionToggle.querySelector('i');
        
        descriptionToggle.addEventListener('click', function() {
            const isExpanded = descriptionToggle.classList.contains('expanded');
            
            if (isExpanded) {
                // Collapse
                descriptionShort.style.display = 'inline';
                descriptionFull.style.display = 'none';
                descriptionToggle.classList.remove('expanded');
                toggleText.textContent = 'Показать больше';
                toggleIcon.className = 'fa fa-chevron-down';
            } else {
                // Expand
                descriptionShort.style.display = 'none';
                descriptionFull.style.display = 'inline';
                descriptionToggle.classList.add('expanded');
                toggleText.textContent = 'Показать меньше';
                toggleIcon.className = 'fa fa-chevron-up';
            }
        });
    }
});

// Function to initialize progress bars
function initializeProgressBars() {
    const progressBars = document.querySelectorAll('.checklist-progress-fill[data-progress]');
    progressBars.forEach(function (progressBar) {
        const progress = progressBar.getAttribute('data-progress');
        if (progress !== null && progress !== undefined) {
            progressBar.style.width = progress + '%';
        }
    });
}

// После успешного HTMX запроса чеклиста, инициируем обновление прогресса
document.body.addEventListener('htmx:afterSwap', function(event) {
    if (event.target && event.target.matches('.list-group-item')) {
        if (typeof htmx !== 'undefined' && htmx && typeof htmx.trigger === 'function') {
            htmx.trigger(document.body, 'checklist-updated');
        }
    }
});

// Update progress bars after HTMX updates
document.body.addEventListener('htmx:afterRequest', function (event) {
    if (event.target && event.target.matches('#checklist-progress-block')) {
        setTimeout(initializeProgressBars, 100);
    }
});
