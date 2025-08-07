// === LABELS MANAGEMENT JAVASCRIPT ===

// Modal management
const modalManager = {
    // Create modal
    createModal: document.getElementById('createLabelModal'),
    
    // Edit modal
    editModal: document.getElementById('editLabelModal'),
    editForm: document.getElementById('editLabelForm'),
    editInput: document.getElementById('edit_name'),
    
    // Delete modal
    deleteModal: document.getElementById('deleteLabelModal'),
    deleteForm: document.getElementById('deleteLabelForm'),
    deleteLabelName: document.getElementById('deleteLabelName'),
    
    // Show modal with animation
    showModal(modal) {
        modal.style.display = 'flex';
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
        
        // Focus first input if exists
        const firstInput = modal.querySelector('input');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 100);
        }
    },
    
    // Hide modal with animation
    hideModal(modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    },
    
    // Close modal when clicking outside
    setupOutsideClick(modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.hideModal(modal);
            }
        });
    },
    
    // Close modal with Escape key
    setupEscapeKey(modal) {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('show')) {
                this.hideModal(modal);
            }
        });
    }
};

// Initialize modals
document.addEventListener('DOMContentLoaded', function() {
    // Setup outside click for all modals
    modalManager.setupOutsideClick(modalManager.createModal);
    modalManager.setupOutsideClick(modalManager.editModal);
    modalManager.setupOutsideClick(modalManager.deleteModal);
    
    // Setup escape key for all modals
    modalManager.setupEscapeKey(modalManager.createModal);
    modalManager.setupEscapeKey(modalManager.editModal);
    modalManager.setupEscapeKey(modalManager.deleteModal);
    
    // Setup form submissions
    setupFormSubmissions();
    
    // Add loading states to buttons
    setupLoadingStates();
});

// Create modal functions
function openCreateModal() {
    modalManager.showModal(modalManager.createModal);
}

function closeCreateModal() {
    modalManager.hideModal(modalManager.createModal);
}

// Edit modal functions
function openEditModal(labelId, labelName) {
    // Set form action
    modalManager.editForm.action = `/labels/${labelId}/update/`;
    
    // Set input value
    modalManager.editInput.value = labelName;
    
    // Show modal
    modalManager.showModal(modalManager.editModal);
}

function closeEditModal() {
    modalManager.hideModal(modalManager.editModal);
}

// Delete modal functions
function openDeleteModal(labelId, labelName) {
    // Set form action
    modalManager.deleteForm.action = `/labels/${labelId}/delete/`;
    
    // Set label name in confirmation
    modalManager.deleteLabelName.textContent = labelName;
    
    // Show modal
    modalManager.showModal(modalManager.deleteModal);
}

function closeDeleteModal() {
    modalManager.hideModal(modalManager.deleteModal);
}

// Form submission handling
function setupFormSubmissions() {
    // Create form
    const createForm = modalManager.createModal.querySelector('form');
    createForm.addEventListener('submit', function(e) {
        const submitBtn = this.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Создание...';
    });
    
    // Edit form
    modalManager.editForm.addEventListener('submit', function(e) {
        const submitBtn = this.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Сохранение...';
    });
    
    // Delete form
    modalManager.deleteForm.addEventListener('submit', function(e) {
        const submitBtn = this.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Удаление...';
    });
}

// Loading states for buttons
function setupLoadingStates() {
    const buttons = document.querySelectorAll('.label-btn, .label-action-btn');
    
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            if (this.type === 'submit') {
                this.disabled = true;
                const originalText = this.innerHTML;
                this.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Загрузка...';
                
                // Reset after 5 seconds if form doesn't submit
                setTimeout(() => {
                    if (this.disabled) {
                        this.disabled = false;
                        this.innerHTML = originalText;
                    }
                }, 5000);
            }
        });
    });
}

// Keyboard navigation for label cards
document.addEventListener('DOMContentLoaded', function() {
    const labelCards = document.querySelectorAll('.label-card');
    
    labelCards.forEach(card => {
        card.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                // Focus first action button
                const firstActionBtn = this.querySelector('.label-action-btn');
                if (firstActionBtn) {
                    firstActionBtn.focus();
                }
            }
        });
        
        // Make cards focusable
        card.setAttribute('tabindex', '0');
    });
});

// Search functionality removed - not currently used in the UI

// Animation for label cards
function animateLabelCards() {
    const labelCards = document.querySelectorAll('.label-card');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, {
        threshold: 0.1
    });
    
    labelCards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = `opacity 0.3s ease ${index * 0.1}s, transform 0.3s ease ${index * 0.1}s`;
        observer.observe(card);
    });
}

// Initialize animations when page loads
document.addEventListener('DOMContentLoaded', function() {
    animateLabelCards();
});

// Error handling for form submissions
function handleFormError(form, errorMessage) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'label-form-error';
    errorDiv.innerHTML = `<i class="fa fa-exclamation-circle"></i> ${errorMessage}`;
    
    // Remove existing error
    const existingError = form.querySelector('.label-form-error');
    if (existingError) {
        existingError.remove();
    }
    
    // Add new error
    form.insertBefore(errorDiv, form.firstChild);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.remove();
        }
    }, 5000);
}

// Success feedback
function showSuccessMessage(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'label-success-message';
    successDiv.innerHTML = `<i class="fa fa-check-circle"></i> ${message}`;
    
    // Add to page
    document.body.appendChild(successDiv);
    
    // Show with animation
    setTimeout(() => {
        successDiv.classList.add('show');
    }, 100);
    
    // Remove after 3 seconds
    setTimeout(() => {
        successDiv.classList.remove('show');
        setTimeout(() => {
            if (successDiv.parentNode) {
                successDiv.remove();
            }
        }, 300);
    }, 3000);
}

// Export functions for global access
window.labelsManager = {
    openCreateModal,
    closeCreateModal,
    openEditModal,
    closeEditModal,
    openDeleteModal,
    closeDeleteModal,
    showSuccessMessage,
    handleFormError
};
