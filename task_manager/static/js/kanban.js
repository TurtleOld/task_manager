document.addEventListener('alpine:init', () => {
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
        init() {
            const rawTasks = JSON.parse(this.$el.getAttribute('data-tasks'));
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
            this.dragOverStage = stageId;
            const column = event.target.closest('.kanban-column');
            const arr = this.tasks[stageId] || [];
            let insertIndex = Array.from(column.querySelectorAll('.kanban-task')).findIndex(el => {
                const rect = el.getBoundingClientRect();
                return event.clientY < rect.top + rect.height / 2;
            });
            if (insertIndex === -1) insertIndex = arr.length;
            this.insertPlaceholder(stageId, insertIndex);
            this.placeholderIndex = insertIndex;
        },
        onDragLeave(event, stageId) {
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
        drop(event, newStageId) {
            const taskId = this.dragging;
            if (!taskId) return;
            if (!this.tasks[newStageId]) this.tasks[newStageId] = [];
            const arr = this.tasks[newStageId];
            let newIndex = arr.findIndex(t => t.placeholder);
            if (newIndex === -1) newIndex = arr.length;
            this.removePlaceholder(newStageId);

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
                    this.init();
                }
            })
            .catch(() => {
                this.init();
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
            this.showDeleteModal = true;
            this.deleteTaskObj = task;
            this.dropdownTaskId = null;
        },
        closeDeleteModal() {
            this.showDeleteModal = false;
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
                console.error('Ошибка при удалении задачи:', error);
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