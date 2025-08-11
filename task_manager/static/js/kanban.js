document.addEventListener('alpine:init', () => {
    // Немедленно скрываем модальное окно при загрузке скрипта
    const deleteModal = document.querySelector('.delete-modal');
    if (deleteModal) {
        deleteModal.classList.remove('is-active');
        deleteModal.style.display = 'none';
    }

    // Добавляем CSS анимации для уведомлений
    if (!document.getElementById('kanban-notifications-style')) {
        const style = document.createElement('style');
        style.id = 'kanban-notifications-style';
        style.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            
            .notification.is-danger.is-light {
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                border-left: 4px solid #f14668;
            }
        `;
        document.head.appendChild(style);
    }

    // Дополнительная защита - убеждаемся, что модальное окно не показывается при загрузке
    document.addEventListener('DOMContentLoaded', () => {
        // Если модальное окно случайно открыто при загрузке, закрываем его
        const deleteModal = document.querySelector('.delete-modal');
        if (deleteModal && deleteModal.classList.contains('is-active')) {
            deleteModal.classList.remove('is-active');
        }

        // Также проверяем все модальные окна на странице
        const allModals = document.querySelectorAll('.modal.is-active');
        allModals.forEach(modal => {
            if (modal.classList.contains('delete-modal')) {
                modal.classList.remove('is-active');
            }
        });
    });

    // Дополнительная защита - проверяем при загрузке Alpine.js
    document.addEventListener('alpine:init', () => {
        setTimeout(() => {
            const deleteModal = document.querySelector('.delete-modal');
            if (deleteModal && deleteModal.classList.contains('is-active')) {
                deleteModal.classList.remove('is-active');
            }
        }, 100);
    });

    Alpine.data('kanbanBoard', () => ({
        tasks: {},
        dragging: null,
        draggingStage: null,
        dragOverStage: null,
        placeholderIndex: null,
        draggingTaskObj: null,
        dropdownTaskId: null,
        showDeleteModal: false,
        deleteTaskObj: null,
        isMobile: false,
        selectedTask: null,
        touchStartY: 0,
        touchStartX: 0,
        isInitialized: false,
        init() {
            // Явно устанавливаем showDeleteModal в false при инициализации
            this.showDeleteModal = false;
            this.deleteTaskObj = null;
            this.isInitialized = false;

            const tasksDataScript = document.getElementById('tasks-data');
            const rawTasksData = tasksDataScript ? tasksDataScript.textContent : null;
            
            if (!rawTasksData || rawTasksData.trim() === '') {
                this.tasks = {};
                this.isInitialized = true;
                return;
            }
            
            try {
                const rawTasks = JSON.parse(rawTasksData);
                
                if (!rawTasks || !Array.isArray(rawTasks)) {
                    this.tasks = {};
                    this.isInitialized = true;
                    return;
                }
                
                const groupedTasks = {};
                rawTasks.forEach(task => {
                    const key = String(task.stage);
                    if (!groupedTasks[key]) {
                        groupedTasks[key] = [];
                    }
                    groupedTasks[key].push(task);
                });
                // Инициализируем пустые массивы для всех стадий из DOM
                document.querySelectorAll('[data-stage-id]').forEach(el => {
                    const key = el.getAttribute('data-stage-id');
                    if (!groupedTasks[key]) groupedTasks[key] = [];
                });
                Object.assign(this.tasks, groupedTasks);
            } catch (error) {
                this.tasks = {};
            }
            
            // Определяем мобильное устройство
            this.isMobile = window.innerWidth <= 768;
            
            // Добавляем обработчик клика вне dropdown для его закрытия
            document.addEventListener('click', (event) => {
                // Проверяем, что клик не по dropdown-меню и не по кнопке открытия
                const isDropdownMenuClick = event.target.closest('.dropdown-menu');
                const isDropdownTriggerClick = event.target.closest('.dropdown-trigger');
                const isDropdownItemClick = event.target.closest('.dropdown-item');
                
                // Если клик не по меню, не по кнопке и не по пункту меню, закрываем меню
                if (!isDropdownMenuClick && !isDropdownTriggerClick && !isDropdownItemClick) {
                    this.dropdownTaskId = null;
                }
            });
            
            // Добавляем обработчик изменения размера окна
            window.addEventListener('resize', () => {
                this.isMobile = window.innerWidth <= 768;
                if (this.dropdownTaskId) {
                    this.dropdownTaskId = null;
                }
            });
            
            // Добавляем обработчик клавиши Escape для закрытия dropdown
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && this.dropdownTaskId) {
                    this.dropdownTaskId = null;
                }
            });
            
            // Инициализируем мобильные обработчики
            if (this.isMobile) {
                this.initMobileHandlers();
            }

            // Дополнительная проверка - убеждаемся, что модальное окно закрыто
            this.$nextTick(() => {
                // Принудительно скрываем модальное окно при инициализации
                this.showDeleteModal = false;
                this.deleteTaskObj = null;

                // Удаляем класс is-active если он есть и скрываем модальное окно
                const modal = document.querySelector('.delete-modal');
                if (modal) {
                    modal.classList.remove('is-active');
                    modal.style.display = 'none';
                }

                this.isInitialized = true;
            });
        },
        initMobileHandlers() {
            // Добавляем обработчики touch событий для мобильных устройств
            document.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
            document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
            document.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
            
            // Предотвращаем конфликты с click событиями
            document.addEventListener('click', this.handleMobileClick.bind(this), true);
        },
        handleMobileClick(event) {
            if (!this.isMobile) return;
            
            // Если была выбрана задача, предотвращаем click события
            if (this.selectedTask) {
                event.preventDefault();
                event.stopPropagation();
                return false;
            }
        },
        handleTouchStart(event) {
            if (!this.isMobile) return;
            
            const taskCard = event.target.closest('.kanban-task-card');
            if (taskCard) {
                event.preventDefault();
                const taskId = taskCard.getAttribute('data-task-id');
                if (taskId) {
                    this.selectedTask = taskId;
                    this.draggingTaskObj = this.getTaskObjById(taskId);
                    const stageElement = taskCard.closest('[data-stage-id]');
                    this.draggingStage = stageElement.getAttribute('data-stage-id');
                    
                    // Добавляем визуальную обратную связь
                    taskCard.classList.add('is-selected');
                    
                    // Показываем индикатор выбора с более понятными инструкциями
                    this.showMobileSelectionIndicator(taskCard);
                    
                    // Запоминаем начальные координаты для определения типа жеста
                    this.touchStartX = event.touches[0].clientX;
                    this.touchStartY = event.touches[0].clientY;
                    
                    // Добавляем haptic feedback (если поддерживается)
                    if (navigator.vibrate) {
                        navigator.vibrate(50);
                    }
                }
            }
        },
        handleTouchMove(event) {
            if (!this.isMobile || !this.selectedTask) return;
            
            event.preventDefault();
            
            const touch = event.touches[0];
            const deltaX = Math.abs(touch.clientX - this.touchStartX);
            const deltaY = Math.abs(touch.clientY - this.touchStartY);
            
            // Если движение достаточно большое, считаем это drag жестом
            if (deltaX > 10 || deltaY > 10) {
                const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
                const column = elementBelow?.closest('[data-stage-id]');
                
                if (column) {
                    const stageId = column.getAttribute('data-stage-id');
                    this.onMobileDragOver(touch, stageId);
                    
                    // Обновляем индикатор с инструкциями
                    this.updateMobileIndicator(touch);
                }
            }
        },
        handleTouchEnd(event) {
            if (!this.isMobile || !this.selectedTask) return;
            
            event.preventDefault();
            
            const touch = event.changedTouches[0];
            const deltaX = Math.abs(touch.clientX - this.touchStartX);
            const deltaY = Math.abs(touch.clientY - this.touchStartY);
            
            // Если движение было достаточно большим, выполняем drop
            if (deltaX > 10 || deltaY > 10) {
                const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
                const column = elementBelow?.closest('[data-stage-id]');
                
                if (column) {
                    const stageId = column.getAttribute('data-stage-id');
                    this.onMobileDrop(touch, stageId);
                    
                    // Haptic feedback для успешного drop
                    if (navigator.vibrate) {
                        navigator.vibrate([50, 50, 50]);
                    }
                }
            }
            
            // Очищаем состояние
            this.clearMobileSelection();
        },
        onMobileDragOver(touch, stageId) {
            this.dragOverStage = stageId;
            
            const column = document.querySelector(`[data-stage-id="${stageId}"]`);
            if (!column) return;
            
            const taskElements = Array.from(column.querySelectorAll('.kanban-task-card'));
            const mouseY = touch.clientY;
            
            // Находим позицию для вставки
            let insertIndex = this.findInsertPosition(taskElements, mouseY);
            
            // Если перетаскиваем в ту же колонку, исключаем текущую задачу
            if (this.draggingStage === stageId) {
                const currentTaskIndex = this.tasks[stageId].findIndex(t => t.id === this.selectedTask);
                if (currentTaskIndex !== -1) {
                    if (insertIndex > currentTaskIndex) {
                        insertIndex--;
                    }
                    if (insertIndex === currentTaskIndex) {
                        return;
                    }
                }
            }
            
            this.insertPlaceholder(stageId, insertIndex);
            this.placeholderIndex = insertIndex;
        },
        onMobileDrop(touch, newStageId) {
            const taskId = this.selectedTask;
            if (!taskId) return;
            if (!this.tasks[newStageId]) this.tasks[newStageId] = [];
            const arr = this.tasks[newStageId];
            let newIndex = arr.findIndex(t => t.placeholder);
            if (newIndex === -1) newIndex = arr.length;
            this.removePlaceholder(newStageId);

            // Сохраняем оригинальное состояние для восстановления в случае ошибки
            const originalState = {};
            for (const sid in this.tasks) {
                originalState[sid] = [...this.tasks[sid]];
            }

            // Удалить задачу из всех колонок
            for (const sid in this.tasks) {
                const idx = this.tasks[sid].findIndex(t => t.id === taskId);
                if (idx !== -1) this.tasks[sid].splice(idx, 1);
            }
            // Вставить полный объект задачи
            if (this.draggingTaskObj) arr.splice(newIndex, 0, this.draggingTaskObj);

            fetch('/tasks/update-task-stage/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken'),
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify({
                    task_id: taskId,
                    new_stage_id: newStageId,
                    new_order: newIndex,
                }),
            })
            .then(response => response.json())
            .then(data => {
                if (!data.success) {
                    // Восстанавливаем оригинальное состояние при ошибке
                    if (originalState && Object.keys(originalState).length > 0) {
                        Object.assign(this.tasks, originalState);
                    }
                    
                    if (data.messages_html) {
                        this.showDjangoMessages(data.messages_html);
                    } else {
                        this.showErrorNotification(data.error || 'Не удалось переместить задачу.');
                    }
                }
            })
            .catch((error) => {
                if (originalState && Object.keys(originalState).length > 0) {
                    Object.assign(this.tasks, originalState);
                }
                this.showErrorNotification('Произошла ошибка сети при перемещении задачи.');
            });
        },
        showMobileSelectionIndicator(taskCard) {
            const indicator = document.createElement('div');
            indicator.className = 'mobile-selection-indicator';
            indicator.innerHTML = `
                <div class="mobile-selection-content">
                    <span class="icon">
                        <i class="fas fa-hand-pointer"></i>
                    </span>
                    <span>Переместите карточку</span>
                </div>
            `;
            document.body.appendChild(indicator);
            
            const rect = taskCard.getBoundingClientRect();
            indicator.style.position = 'fixed';
            indicator.style.top = `${rect.top - 60}px`;
            indicator.style.left = `${rect.left}px`;
            indicator.style.zIndex = '1000';
        },
        updateMobileIndicator(touch) {
            const indicator = document.querySelector('.mobile-selection-indicator');
            if (indicator) {
                const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
                const column = elementBelow?.closest('[data-stage-id]');
                
                if (column) {
                    const stageId = column.getAttribute('data-stage-id');
                    const stageName = column.querySelector('.column-header h3')?.textContent || 'колонку';
                    
                    indicator.innerHTML = `
                        <div class="mobile-selection-content">
                            <span class="icon">
                                <i class="fas fa-arrow-right"></i>
                            </span>
                            <span>Переместить в ${stageName}</span>
                        </div>
                    `;
                    
                    // Обновляем позицию индикатора
                    indicator.style.top = `${touch.clientY - 80}px`;
                    indicator.style.left = `${touch.clientX - 100}px`;
                }
            }
        },
        clearMobileSelection() {
            this.selectedTask = null;
            this.draggingTaskObj = null;
            this.draggingStage = null;
            this.dragOverStage = null;
            this.placeholderIndex = null;
            this.removePlaceholder();
            
            // Убираем визуальные эффекты
            document.querySelectorAll('.kanban-task-card.is-selected').forEach(card => {
                card.classList.remove('is-selected');
            });
            
            // Убираем индикатор
            const indicator = document.querySelector('.mobile-selection-indicator');
            if (indicator) {
                indicator.remove();
            }
        },
        dragStart(taskId) {
            this.dragging = taskId;
            this.draggingTaskObj = this.getTaskObjById(taskId);
            const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
            const stageElement = taskElement.closest('[data-stage-id]');
            this.draggingStage = stageElement.getAttribute('data-stage-id');
            taskElement.classList.add('is-dragging');
        },
        dragEnd() {
            if (this.dragging) {
                const taskElement = document.querySelector(`[data-task-id="${this.dragging}"]`);
                if (taskElement) taskElement.classList.remove('is-dragging');
            }
            this.dragging = null;
            this.draggingStage = null;
            this.dragOverStage = null;
            this.placeholderIndex = null;
            this.draggingTaskObj = null;
            this.removePlaceholder();
        },
        onDragOver(event, stageId) {
            event.preventDefault();
            this.dragOverStage = stageId;
            
            // Ищем колонку по data-stage-id, начиная с текущего элемента и поднимаясь вверх по DOM
            const column = event.target.closest('[data-stage-id]');
            if (!column) return;
            
            const taskElements = Array.from(column.querySelectorAll('.kanban-task-card'));
            const mouseY = event.clientY;
            
            // Находим позицию для вставки
            let insertIndex = this.findInsertPosition(taskElements, mouseY);
            
            // Если перетаскиваем в ту же колонку, исключаем текущую задачу
            if (this.draggingStage === stageId) {
                const currentTaskIndex = this.tasks[stageId].findIndex(t => t.id === this.dragging);
                if (currentTaskIndex !== -1) {
                    // Если вставляем после текущей позиции, уменьшаем индекс на 1
                    if (insertIndex > currentTaskIndex) {
                        insertIndex--;
                    }
                    // Если вставляем на ту же позицию, не делаем ничего
                    if (insertIndex === currentTaskIndex) {
                        return;
                    }
                }
            }
            
            this.insertPlaceholder(stageId, insertIndex);
            this.placeholderIndex = insertIndex;
        },
        findInsertPosition(taskElements, mouseY) {
            if (taskElements.length === 0) {
                return 0;
            }
            
            // Проверяем, находится ли курсор выше первой карточки
            const firstTask = taskElements[0];
            const firstTaskRect = firstTask.getBoundingClientRect();
            if (mouseY < firstTaskRect.top + firstTaskRect.height / 2) {
                return 0;
            }
            
            // Проверяем, находится ли курсор ниже последней карточки
            const lastTask = taskElements[taskElements.length - 1];
            const lastTaskRect = lastTask.getBoundingClientRect();
            if (mouseY > lastTaskRect.bottom - lastTaskRect.height / 2) {
                return taskElements.length;
            }
            
            // Находим позицию между карточками
            for (let i = 0; i < taskElements.length - 1; i++) {
                const currentTask = taskElements[i];
                const nextTask = taskElements[i + 1];
                const currentRect = currentTask.getBoundingClientRect();
                const nextRect = nextTask.getBoundingClientRect();
                
                // Проверяем, находится ли курсор между текущей и следующей карточкой
                const middleY = (currentRect.bottom + nextRect.top) / 2;
                if (mouseY < middleY) {
                    return i + 1;
                }
            }
            
            // Если не нашли позицию, вставляем в конец
            return taskElements.length;
        },
        onDragLeave(event, stageId) {
            // Проверяем, что мы действительно покидаем колонку, а не переходим к дочернему элементу
            const relatedTarget = event.relatedTarget;
            const currentColumn = event.target.closest('[data-stage-id]');
            
            if (relatedTarget && currentColumn && currentColumn.contains(relatedTarget)) {
                return;
            }
            
            if (this.dragOverStage == stageId) {
                this.dragOverStage = null;
                this.placeholderIndex = null;
                this.removePlaceholder(stageId);
            }
        },
        insertPlaceholder(stageId, index) {
            const arr = this.tasks[stageId] || [];
            const oldIdx = arr.findIndex(t => t.placeholder);
            if (oldIdx !== -1) arr.splice(oldIdx, 1);
            if (arr[index] && arr[index].id === this.dragging) return;
            arr.splice(index, 0, { placeholder: true });
        },
        removePlaceholder(stageId) {
            if (stageId) {
                const arr = this.tasks[stageId] || [];
                const idx = arr.findIndex(t => t.placeholder);
                if (idx !== -1) arr.splice(idx, 1);
            } else {
                for (const sid in this.tasks) {
                    const arr = this.tasks[sid];
                    const idx = arr.findIndex(t => t.placeholder);
                    if (idx !== -1) arr.splice(idx, 1);
                }
            }
        },
        showDjangoMessages(messagesHtml) {
            // Удаляем существующие сообщения
            const existingAlerts = document.querySelectorAll('.alert');
            existingAlerts.forEach(alert => alert.remove());
            
            // Добавляем новые сообщения в начало body
            if (messagesHtml) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = messagesHtml;
                const messages = tempDiv.querySelectorAll('.alert');
                
                messages.forEach(message => {
                    // Добавляем анимацию появления
                    message.style.opacity = '0';
                    message.style.transform = 'translateY(-20px)';
                    message.style.transition = 'all 0.3s ease-out';
                    
                    document.body.insertBefore(message, document.body.firstChild);
                    
                    // Анимация появления
                    setTimeout(() => {
                        message.style.opacity = '1';
                        message.style.transform = 'translateY(0)';
                    }, 10);
                    
                    // Автоматически удаляем через 5 секунд
                    setTimeout(() => {
                        if (message.parentElement) {
                            message.style.opacity = '0';
                            message.style.transform = 'translateY(-20px)';
                            setTimeout(() => {
                                if (message.parentElement) {
                                    message.remove();
                                }
                            }, 300);
                        }
                    }, 5000);
                });
            }
        },
        showErrorNotification(message) {
            // Создаем уведомление об ошибке
            const notification = document.createElement('div');
            notification.className = 'notification is-danger is-light';
            notification.style.position = 'fixed';
            notification.style.top = '20px';
            notification.style.right = '20px';
            notification.style.zIndex = '9999';
            notification.style.maxWidth = '400px';
            notification.style.animation = 'slideInRight 0.3s ease-out';
            
            notification.innerHTML = `
                <button class="delete" onclick="this.parentElement.remove()"></button>
                <div class="content">
                    <p><strong>Ошибка:</strong> ${message}</p>
                </div>
            `;
            
            document.body.appendChild(notification);
            
            // Автоматически удаляем уведомление через 5 секунд
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.remove();
                }
            }, 5000);
        },
        drop(event, newStageId) {
            const taskId = this.dragging;
            if (!taskId) return;
            if (!this.tasks[newStageId]) this.tasks[newStageId] = [];
            const arr = this.tasks[newStageId];
            let newIndex = arr.findIndex(t => t.placeholder);
            if (newIndex === -1) newIndex = arr.length;
            this.removePlaceholder(newStageId);

            // Сохраняем оригинальное состояние для восстановления в случае ошибки
            const originalState = {};
            for (const sid in this.tasks) {
                originalState[sid] = [...this.tasks[sid]];
            }

            // Удалить задачу из всех колонок
            for (const sid in this.tasks) {
                const idx = this.tasks[sid].findIndex(t => t.id === taskId);
                if (idx !== -1) this.tasks[sid].splice(idx, 1);
            }
            // Вставить полный объект задачи
            if (this.draggingTaskObj) arr.splice(newIndex, 0, this.draggingTaskObj);

            fetch('/tasks/update-task-stage/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken'),
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify({
                    task_id: taskId,
                    new_stage_id: newStageId,
                    new_order: newIndex,
                }),
            })
            .then(response => response.json())
            .then(data => {
                if (!data.success) {
                    // Восстанавливаем оригинальное состояние при ошибке
                    if (originalState && Object.keys(originalState).length > 0) {
                        Object.assign(this.tasks, originalState);
                    }
                    
                    // Показываем Django messages если они есть, иначе показываем обычное уведомление
                    if (data.messages_html) {
                        this.showDjangoMessages(data.messages_html);
                    } else {
                        this.showErrorNotification(data.error || 'Не удалось переместить задачу.');
                    }
                }
            })
            .catch((error) => {
                // Восстанавливаем оригинальное состояние при ошибке сети
                if (originalState && Object.keys(originalState).length > 0) {
                    Object.assign(this.tasks, originalState);
                }
                this.showErrorNotification('Произошла ошибка сети при перемещении задачи.');
            });
            this.dragEnd();
        },
        findTaskById(taskId) {
            return { id: taskId };
        },
        getTaskObjById(taskId) {
            for (const sid in this.tasks) {
                const task = this.tasks[sid].find(t => t.id === taskId);
                if (task) return { ...task };
            }
            return null;
        },
        toggleDropdown(taskId, event) {
            // Если кликаем по той же кнопке, закрываем меню
            if (this.dropdownTaskId === taskId) {
                this.dropdownTaskId = null;
                return;
            }
            
            // Открываем новое меню
            this.dropdownTaskId = taskId;
            
            this.$nextTick(() => {
                const dropdownMenu = document.querySelector(`[data-task-id="${taskId}"] .dropdown-menu`);
                if (dropdownMenu) {
                    const button = event.target.closest('.dropdown-trigger');
                    const buttonRect = button.getBoundingClientRect();
                    
                    // Проверяем, мобильное ли устройство
                    const isMobile = window.innerWidth <= 600;
                    
                    if (isMobile) {
                        // На мобильных устройствах позиционируем по центру экрана
                        dropdownMenu.style.position = 'fixed';
                        dropdownMenu.style.top = '50%';
                        dropdownMenu.style.left = '50%';
                        dropdownMenu.style.transform = 'translate(-50%, -50%)';
                        dropdownMenu.style.zIndex = '1000';
                        dropdownMenu.style.maxWidth = 'calc(100vw - 20px)';
                    } else {
                        // На десктопе позиционируем относительно кнопки
                        dropdownMenu.style.position = 'fixed';
                        dropdownMenu.style.top = (buttonRect.bottom + 5) + 'px';
                        dropdownMenu.style.left = (buttonRect.right - dropdownMenu.offsetWidth) + 'px';
                        dropdownMenu.style.zIndex = '1000';
                        dropdownMenu.style.transform = 'none';
                    }
                }
            });
        },
        openDeleteModal(task) {
            // Проверяем, что инициализация завершена
            if (!this.isInitialized) {
                return;
            }

            // Проверяем, что task существует и является объектом
            if (!task || typeof task !== 'object') {
                return;
            }

            // Проверяем, что у task есть необходимые свойства
            if (!task.id || !task.name) {
                return;
            }

            // Сначала устанавливаем данные задачи
            this.deleteTaskObj = task;
            this.dropdownTaskId = null;

            // Затем показываем модальное окно
            this.showDeleteModal = true;

            // Устанавливаем видимость модального окна
            this.$nextTick(() => {
                const modal = document.querySelector('.delete-modal');
                if (modal) {
                    modal.classList.add('is-active');
                    modal.style.display = 'flex';
                }
            });
        },
        closeDeleteModal() {
            // Скрываем модальное окно
            this.showDeleteModal = false;

            // Устанавливаем невидимость модального окна
            const modal = document.querySelector('.delete-modal');
            if (modal) {
                modal.classList.remove('is-active');
                modal.style.display = 'none';
            }

            // Очищаем данные задачи
            this.deleteTaskObj = null;
        },
        confirmDelete(task) {
            if (!task) return;
            fetch(`/tasks/delete/${task.slug}/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken'),
                },
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    for (const stageId in this.tasks) {
                        const tasks = this.tasks[stageId];
                        const taskIndex = tasks.findIndex(t => t.id === task.id);
                        if (taskIndex !== -1) {
                            tasks.splice(taskIndex, 1);
                            break;
                        }
                    }
                } else {
                    alert(data.error);
                }
                this.closeDeleteModal();
            })
                .catch(error => {
                this.closeDeleteModal();
            });
        },
    }));
});

function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (const element of cookies) {
            const cookie = element.trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
} 