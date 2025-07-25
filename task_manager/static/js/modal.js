// Универсальный модуль для управления модальными окнами Bulma
// Использование: modalManager.attach('preview-image-button', 'image-modal');

const modalManager = (function() {
    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('is-active');
        }
    }

    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('is-active');
            // Очищаем src и href у картинки, если нужно
            const img = modal.querySelector('img');
            const link = modal.querySelector('a');
            if (img) img.src = '';
            if (link) link.href = '';
        }
    }

    function attach(openBtnId, modalId, getImageUrl) {
        const openBtn = document.getElementById(openBtnId);
        const modal = document.getElementById(modalId);
        if (!openBtn || !modal) return;

        openBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (typeof getImageUrl === 'function') {
                const url = getImageUrl();
                const img = modal.querySelector('img');
                const link = modal.querySelector('a');
                if (img) img.src = url;
                if (link) link.href = url;
            }
            openModal(modalId);
        });

        // Закрытие по кнопке и по фону
        const closeModalBtn = modal.querySelector('.modal-close');
        const modalBg = modal.querySelector('.modal-background');
        if (closeModalBtn) closeModalBtn.addEventListener('click', () => closeModal(modalId));
        if (modalBg) modalBg.addEventListener('click', () => closeModal(modalId));
    }

    return { openModal, closeModal, attach };
})(); 