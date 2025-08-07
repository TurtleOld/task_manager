/**
 * Улучшенный интерфейс для управления чеклистом
 * Поддерживает динамическое добавление/удаление пунктов
 * Drag-and-drop функциональность (в будущем)
 */

class ChecklistManager {
    constructor(containerId, addButtonId, initialData = []) {
        this.container = document.getElementById(containerId);
        this.addButton = document.getElementById(addButtonId);
        this.itemCounter = 0;
        this.initialData = initialData;
        
        this.init();
    }
    
    init() {
        if (!this.container || !this.addButton) {
            console.error('ChecklistManager: Required elements not found');
            return;
        }
        
        this.addButton.addEventListener('click', () => this.addItem());
        
        // Загружаем существующие данные
        this.loadInitialData();
        
        if (this.initialData.length === 0) {
            this.createItem('', false, false);
        }
    }
    
    loadInitialData() {
        this.initialData.forEach(item => {
            this.createItem(item.description, item.is_completed);
        });
    }
    
    createItem(description = '', isCompleted = false, shouldFocus = true) {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'checklist-item field has-addons mb-2';
        itemDiv.setAttribute('data-item-index', this.itemCounter);
        
        itemDiv.innerHTML = `
            <div class="control is-expanded">
                <input type="text" 
                       name="checklist_items[${this.itemCounter}][description]" 
                       value="${this.escapeHtml(description)}"
                       class="input checklist-item-input" 
                       placeholder="Введите пункт чеклиста..."
                       aria-label="Пункт чеклиста ${this.itemCounter + 1}">
            </div>
            <div class="control">
                <label class="checkbox">
                    <input type="checkbox" 
                           name="checklist_items[${this.itemCounter}][is_completed]" 
                           ${isCompleted ? 'checked' : ''}
                           aria-label="Отметить как выполненный">
                    <span class="icon is-small ml-1" aria-hidden="true">
                        <i class="fas fa-check"></i>
                    </span>
                </label>
            </div>
            <div class="control">
                <button type="button" 
                        class="button is-small is-danger remove-checklist-item"
                        aria-label="Удалить пункт"
                        title="Удалить">
                    <span class="icon is-small" aria-hidden="true">
                        <i class="fas fa-trash"></i>
                    </span>
                </button>
            </div>
        `;
        
        this.setupItemEventListeners(itemDiv);
        this.container.appendChild(itemDiv);
        this.itemCounter++;
        
        // Устанавливаем фокус только если это требуется
        if (shouldFocus) {
            const input = itemDiv.querySelector('.checklist-item-input');
            input.focus();
        }
        
        return itemDiv;
    }
    
    setupItemEventListeners(itemDiv) {
        // Обработчик для удаления
        const removeButton = itemDiv.querySelector('.remove-checklist-item');
        removeButton.addEventListener('click', () => {
            this.removeItem(itemDiv);
        });
        
        // Обработчик для Enter в поле ввода
        const input = itemDiv.querySelector('.checklist-item-input');
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.addItem();
            }
        });
        
        // Обработчик для изменения состояния чекбокса
        const checkbox = itemDiv.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', () => {
            this.updateItemVisualState(itemDiv, checkbox.checked);
        });
    }
    
    addItem() {
        const newItem = this.createItem('', false, true); // Устанавливаем фокус при добавлении нового пункта
        
        // Добавляем анимацию появления
        newItem.style.opacity = '0';
        newItem.style.transform = 'translateY(10px)';
        
        setTimeout(() => {
            newItem.style.transition = 'all 0.3s ease';
            newItem.style.opacity = '1';
            newItem.style.transform = 'translateY(0)';
        }, 10);
    }
    
    removeItem(itemDiv) {
        // Добавляем анимацию удаления
        itemDiv.style.transition = 'all 0.3s ease';
        itemDiv.style.opacity = '0';
        itemDiv.style.transform = 'translateY(-10px)';
        
        setTimeout(() => {
            itemDiv.remove();
            this.updateItemIndices();
        }, 300);
    }
    
    updateItemIndices() {
        const items = this.container.querySelectorAll('.checklist-item');
        items.forEach((item, index) => {
            item.setAttribute('data-item-index', index);
            const input = item.querySelector('.checklist-item-input');
            const checkbox = item.querySelector('input[type="checkbox"]');
            
            input.name = `checklist_items[${index}][description]`;
            input.setAttribute('aria-label', `Пункт чеклиста ${index + 1}`);
            checkbox.name = `checklist_items[${index}][is_completed]`;
        });
        this.itemCounter = items.length;
    }
    
    updateItemVisualState(itemDiv, isCompleted) {
        const input = itemDiv.querySelector('.checklist-item-input');
        const icon = itemDiv.querySelector('.icon');
        
        if (isCompleted) {
            input.style.textDecoration = 'line-through';
            input.style.color = '#7a7a7a';
            icon.style.color = '#48c774';
        } else {
            input.style.textDecoration = 'none';
            input.style.color = '';
            icon.style.color = '';
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Метод для получения всех данных чеклиста
    getData() {
        const items = this.container.querySelectorAll('.checklist-item');
        const data = [];
        
        items.forEach(item => {
            const input = item.querySelector('.checklist-item-input');
            const checkbox = item.querySelector('input[type="checkbox"]');
            
            if (input.value.trim()) {
                data.push({
                    description: input.value.trim(),
                    is_completed: checkbox.checked
                });
            }
        });
        
        return data;
    }
    
    // Метод для валидации формы
    validate() {
        const items = this.container.querySelectorAll('.checklist-item');
        let isValid = true;
        let hasValidItems = false;
        
        items.forEach(item => {
            const input = item.querySelector('.checklist-item-input');
            const value = input.value.trim();
            
            if (value === '') {
                input.classList.add('is-danger');
                isValid = false;
            } else {
                input.classList.remove('is-danger');
                hasValidItems = true;
            }
        });
        
        // Если нет валидных пунктов, но есть пустые - это ошибка
        if (!hasValidItems && items.length > 0) {
            isValid = false;
        }
        
        return isValid;
    }
    
    // Метод для очистки пустых пунктов
    cleanupEmptyItems() {
        const items = this.container.querySelectorAll('.checklist-item');
        
        items.forEach(item => {
            const input = item.querySelector('.checklist-item-input');
            if (input.value.trim() === '') {
                item.remove();
            }
        });
        
        this.updateItemIndices();
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    // Получаем данные чеклиста из глобальной переменной (если есть)
    const checklistData = window.checklistData || [];
    
    // Инициализируем менеджер чеклиста
    if (document.getElementById('checklist-items') && document.getElementById('add-checklist-item')) {
        window.checklistManager = new ChecklistManager(
            'checklist-items', 
            'add-checklist-item', 
            checklistData
        );
    }
    
    // Устанавливаем фокус на первое поле формы (название задачи)
    const firstInput = document.querySelector('input[name="name"]');
    if (firstInput) {
        firstInput.focus();
    }
    
    // Добавляем валидацию формы только при отправке
    const form = document.querySelector('form');
    if (form && window.checklistManager) {
        form.addEventListener('submit', function(e) {
            if (!window.checklistManager.validate()) {
                e.preventDefault();
                alert('Пожалуйста, заполните все пункты чеклиста или удалите пустые.');
            } else {
                window.checklistManager.cleanupEmptyItems();
            }
        });
    }
}); 