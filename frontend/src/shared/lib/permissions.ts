import type { PermissionKey, UserRole } from '../../api/types'

// permissionCatalog stays as-is for the deprecated "advanced mode" exposed
// in admin tooling — the field is still readable on the API per plan §3.4.
export const permissionCatalog: { key: PermissionKey; label: string; desc: string }[] = [
  { key: 'boards:view', label: 'Просмотр досок', desc: 'Доступ к списку и содержимому досок' },
  { key: 'boards:add', label: 'Создание досок', desc: 'Создавать новые доски' },
  { key: 'boards:edit', label: 'Редактирование досок', desc: 'Менять название и настройки досок' },
  { key: 'boards:delete', label: 'Удаление досок', desc: 'Удалять доски' },
  { key: 'columns:view', label: 'Просмотр колонок', desc: 'Видеть колонки и их статус' },
  { key: 'columns:add', label: 'Создание колонок', desc: 'Добавлять колонки' },
  { key: 'columns:edit', label: 'Редактирование колонок', desc: 'Менять названия и иконки' },
  { key: 'columns:delete', label: 'Удаление колонок', desc: 'Удалять колонки' },
  { key: 'cards:view', label: 'Просмотр карточек', desc: 'Видеть задачи и их детали' },
  { key: 'cards:add', label: 'Создание карточек', desc: 'Добавлять новые задачи' },
  { key: 'cards:edit', label: 'Редактирование карточек', desc: 'Менять содержание задач' },
  { key: 'cards:delete', label: 'Удаление карточек', desc: 'Удалять задачи' },
]

// owner = full set; member = read-only across the board.
export const rolePresets: Record<UserRole, PermissionKey[]> = {
  owner: permissionCatalog.map((item) => item.key),
  member: ['boards:view', 'columns:view', 'cards:view'],
}

export const roleLabels: Record<UserRole, string> = {
  owner: 'Владелец',
  member: 'Участник',
}
