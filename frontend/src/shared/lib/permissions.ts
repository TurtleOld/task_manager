import type { PermissionKey, UserRole } from '../../api/types'

// permissionCatalog stays as-is for the deprecated "advanced mode" exposed
// in admin tooling — the field is still readable on the API per plan §3.4.
export const permissionCatalog: { key: PermissionKey; label: string; desc: string }[] = [
  { key: 'boards:view', label: 'Просмотр списков', desc: 'Доступ к перечню и содержимому списков' },
  { key: 'boards:add', label: 'Создание списков', desc: 'Создавать новые списки' },
  { key: 'boards:edit', label: 'Редактирование списков', desc: 'Менять название и настройки списков' },
  { key: 'boards:delete', label: 'Удаление списков', desc: 'Удалять списки' },
  { key: 'cards:view', label: 'Просмотр задач', desc: 'Видеть задачи и их детали' },
  { key: 'cards:add', label: 'Создание задач', desc: 'Добавлять новые задачи' },
  { key: 'cards:edit', label: 'Редактирование задач', desc: 'Менять содержание задач' },
  { key: 'cards:delete', label: 'Удаление задач', desc: 'Удалять задачи' },
]

// owner = full set; member = read-only across the board.
export const rolePresets: Record<UserRole, PermissionKey[]> = {
  owner: permissionCatalog.map((item) => item.key),
  member: ['boards:view', 'cards:view'],
}

export const roleLabels: Record<UserRole, string> = {
  owner: 'Владелец',
  member: 'Участник',
}
