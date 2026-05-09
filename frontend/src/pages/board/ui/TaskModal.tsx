import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import {
  Badge,
  Button,
  Card as SurfaceCard,
  Checkbox,
  Chip,
  ChipButton,
  EmptyState,
  Field,
  Modal,
  RadioCard,
  Select,
  TextInput,
  Textarea,
} from '../../../shared/ui'
import type { Card, CardDeadlineReminder, CardDeadlineReminderResponse } from '../../../api/types'
import type { AssigneeOption, BoardAttachment, BoardCardDraft, BoardChecklistItem, BoardPriority } from '../types'

interface TaskModalProps {
  selectedCard: Card
  draft: BoardCardDraft
  saveBusy: boolean
  deleteBusy: boolean
  modalError: string
  onClose: () => void
  onSave: () => void
  onDelete: () => void
  setDraft: Dispatch<SetStateAction<BoardCardDraft | null>>
  reminderDrafts: CardDeadlineReminder[]
  reminderData: CardDeadlineReminderResponse | null
  reminderLoading: boolean
  reminderError: string
  reminderFieldError: string
  newReminderValue: number
  setNewReminderValue: (value: number) => void
  newReminderUnit: 'minutes' | 'hours'
  setNewReminderUnit: (value: 'minutes' | 'hours') => void
  applyReminderValue: (id: number, value: number) => void
  applyReminderUnit: (id: number, unit: 'minutes' | 'hours') => void
  applyReminderChannel: (channel: 'email' | 'telegram' | null) => void
  toggleReminder: (id: number, enabled: boolean) => void
  addReminderInterval: (value: number, unit: 'minutes' | 'hours') => void
  removeReminderInterval: (id: number) => void
  selectedChecklist: BoardChecklistItem[]
  newChecklistItem: string
  setNewChecklistItem: (value: string) => void
  addChecklistItem: () => void
  toggleChecklistItem: (id: string) => void
  removeChecklistItem: (id: string) => void
  selectedAttachments: BoardAttachment[]
  newAttachmentType: 'file' | 'link' | 'photo'
  setNewAttachmentType: (value: 'file' | 'link' | 'photo') => void
  attachmentFileInputKey: number
  attachmentFileInputRef: MutableRefObject<HTMLInputElement | null>
  setNewAttachmentFiles: (files: File[]) => void
  newAttachmentFiles: File[]
  newAttachmentName: string
  setNewAttachmentName: (value: string) => void
  newAttachmentUrl: string
  setNewAttachmentUrl: (value: string) => void
  addAttachment: () => void
  removeAttachment: (item: { id: string; type: 'file' | 'link' | 'photo' }) => Promise<void>
  assignees: AssigneeOption[]
  selectedCardId: number | null
  profileTimeZone: string
  getTimeZoneLabel: (value: string | null | undefined) => string
  scheduleDeadlineSave: () => void
  selectedPriority: BoardPriority | ''
  allKnownTags: string[]
  selectedTags: string[]
  newTag: string
  setNewTag: (value: string) => void
  addTagValue: (value: string) => void
  removeTag: (tag: string) => void
  addTag: () => void
  allKnownCategories: string[]
  selectedCategories: string[]
  newCategory: string
  setNewCategory: (value: string) => void
  addCategoryValue: (value: string) => void
  removeCategory: (category: string) => void
  addCategory: () => void
}

export function TaskModal({
  selectedCard,
  draft,
  saveBusy,
  deleteBusy,
  modalError,
  onClose,
  onSave,
  onDelete,
  setDraft,
  reminderDrafts,
  reminderData,
  reminderLoading,
  reminderError,
  reminderFieldError,
  newReminderValue,
  setNewReminderValue,
  newReminderUnit,
  setNewReminderUnit,
  applyReminderValue,
  applyReminderUnit,
  applyReminderChannel,
  toggleReminder,
  addReminderInterval,
  removeReminderInterval,
  selectedChecklist,
  newChecklistItem,
  setNewChecklistItem,
  addChecklistItem,
  toggleChecklistItem,
  removeChecklistItem,
  selectedAttachments,
  newAttachmentType,
  setNewAttachmentType,
  attachmentFileInputKey,
  attachmentFileInputRef,
  setNewAttachmentFiles,
  newAttachmentFiles,
  newAttachmentName,
  setNewAttachmentName,
  newAttachmentUrl,
  setNewAttachmentUrl,
  addAttachment,
  removeAttachment,
  assignees,
  selectedCardId,
  profileTimeZone,
  getTimeZoneLabel,
  scheduleDeadlineSave,
  selectedPriority,
  allKnownTags,
  selectedTags,
  newTag,
  setNewTag,
  addTagValue,
  removeTag,
  addTag,
  allKnownCategories,
  selectedCategories,
  newCategory,
  setNewCategory,
  addCategoryValue,
  removeCategory,
  addCategory,
}: TaskModalProps) {
  const enabledReminderCount = reminderDrafts.filter((item) => item.enabled).length
  const hasDeadline = Boolean(reminderData?.deadline || draft?.deadline)

  return (
    <Modal
      open={Boolean(selectedCard && draft)}
      onClose={() => {
        if (!saveBusy && !deleteBusy) onClose()
      }}
      title={selectedCard.title || 'Редактирование задачи'}
      className="max-h-[calc(100vh-2rem)] max-w-6xl overflow-y-auto"
    >
      <div className="space-y-6">
        <section className="rounded-[1.4rem] border border-primary/15 bg-[image:var(--gradient-surface)] p-5 shadow-elevated">
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-4">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="primary">Task workspace</Badge>
                <Badge variant="neutral">#{selectedCard.id}</Badge>
                {selectedCard.board ? <Badge variant="info">Board {selectedCard.board}</Badge> : null}
              </div>
              <div className="min-w-0">
                <p className="text-label uppercase text-text-muted">Редактирование задачи</p>
                <h3 className="mt-2 break-words text-h3 text-text sm:text-h2">{selectedCard.title || 'Без названия'}</h3>
                <p className="mt-2 max-w-2xl text-caption text-text-muted sm:text-body-sm">
                  Управляйте содержанием, сроками, приоритетом, вложениями и уведомлениями в одном месте.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1 lg:max-w-[14rem] lg:justify-end">
              <Button type="button" onClick={onSave} loading={saveBusy} disabled={deleteBusy}>
                Сохранить
              </Button>
              <Button type="button" variant="danger" onClick={onDelete} loading={deleteBusy} disabled={saveBusy}>
                Удалить задачу
              </Button>
              <Button type="button" variant="secondary" onClick={onClose} disabled={saveBusy || deleteBusy}>
                Закрыть
              </Button>
            </div>
          </div>
          {modalError ? (
            <div className="mt-4 rounded-panel border border-danger/25 bg-danger/10 px-4 py-3 text-body-sm text-danger" role="alert">
              {modalError}
            </div>
          ) : null}
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5">
            <SurfaceCard as="section" className="space-y-4">
              <Field label="Заголовок" htmlFor="task-title">
                <TextInput
                  id="task-title"
                  value={draft.title}
                  onChange={(event) => setDraft((prev) => (prev ? { ...prev, title: event.target.value } : prev))}
                />
              </Field>
              <Field label="Подробное описание" htmlFor="task-description">
                <Textarea
                  id="task-description"
                  rows={6}
                  value={draft.description}
                  onChange={(event) => setDraft((prev) => (prev ? { ...prev, description: event.target.value } : prev))}
                  placeholder="Опишите задачу, ожидания, контекст и критерии готовности"
                />
              </Field>
            </SurfaceCard>

            <SurfaceCard as="section" className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="warning">Reminder</Badge>
                    <Badge variant={enabledReminderCount > 0 ? 'primary' : 'neutral'}>
                      Активно: {enabledReminderCount}
                    </Badge>
                  </div>
                  <h3 className="mt-3 text-h3 text-text">Напоминания о дедлайне</h3>
                  <p className="mt-1 text-body-sm text-text-muted">
                    Настройте интервалы и канал отправки перед сроком выполнения.
                  </p>
                </div>
                <Checkbox
                  label="Включено"
                  checked={reminderDrafts.some((item) => item.enabled)}
                  onChange={(event) => {
                    const nextEnabled = event.target.checked
                    reminderDrafts.forEach((item) => toggleReminder(item.id, nextEnabled))
                  }}
                  disabled={!hasDeadline || reminderDrafts.length === 0}
                  className="bg-background-subtle/50"
                />
              </div>

              {reminderLoading ? <p className="text-caption text-text-muted">Загрузка настроек...</p> : null}
              {reminderError ? <p className="text-caption text-danger" role="alert">{reminderError}</p> : null}
              {!hasDeadline ? (
                <div className="rounded-panel border border-dashed border-warning/35 bg-warning/10 px-4 py-3 text-caption text-warning">
                  Установите срок выполнения, чтобы настроить напоминание.
                </div>
              ) : null}
              {reminderDrafts.length === 0 && hasDeadline ? (
                <div className="rounded-panel border border-dashed border-border bg-background-subtle/55 px-4 py-3 text-caption text-text-muted">
                  Добавьте один или несколько интервалов напоминания.
                </div>
              ) : null}

              {reminderDrafts.length > 0 && hasDeadline ? (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <p className="text-label uppercase text-text-muted">Интервалы до дедлайна</p>
                    {reminderDrafts.map((item) => (
                      <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-panel border border-border/70 bg-background-subtle/55 p-3">
                        <TextInput
                          type="number"
                          min={1}
                          max={item.offset_unit === 'hours' ? 168 : 1440}
                          step={1}
                          value={item.offset_value}
                          onChange={(event) => {
                            const raw = event.target.value
                            const next = Number(raw)
                            if (!Number.isFinite(next) || !Number.isInteger(next)) return
                            if (next <= 0) return
                            if (next > (item.offset_unit === 'hours' ? 168 : 1440)) return
                            applyReminderValue(item.id, next)
                          }}
                          fullWidth={false}
                          className="w-24"
                          disabled={!item.enabled}
                        />
                        <Select
                          value={item.offset_unit}
                          onChange={(event) => applyReminderUnit(item.id, event.target.value as 'minutes' | 'hours')}
                          fullWidth={false}
                          className="w-28"
                          disabled={!item.enabled}
                        >
                          <option value="minutes">минут</option>
                          <option value="hours">часов</option>
                        </Select>
                        <Checkbox
                          label="Активно"
                          checked={item.enabled}
                          onChange={(event) => toggleReminder(item.id, event.target.checked)}
                          className="border-transparent bg-transparent px-2 shadow-none"
                        />
                        <Button type="button" variant="danger" size="sm" onClick={() => removeReminderInterval(item.id)}>
                          Удалить
                        </Button>
                      </div>
                    ))}
                    <div className="flex flex-wrap items-center gap-2 rounded-panel border border-dashed border-border bg-background-subtle/55 p-3">
                      <TextInput
                        type="number"
                        min={1}
                        max={newReminderUnit === 'hours' ? 168 : 1440}
                        step={1}
                        value={newReminderValue}
                        onChange={(event) => setNewReminderValue(Number(event.target.value) || 1)}
                        fullWidth={false}
                        className="w-24"
                      />
                      <Select value={newReminderUnit} onChange={(event) => setNewReminderUnit(event.target.value as 'minutes' | 'hours')} fullWidth={false} className="w-28">
                        <option value="minutes">минут</option>
                        <option value="hours">часов</option>
                      </Select>
                      <Button
                        type="button"
                        onClick={() => addReminderInterval(newReminderValue, newReminderUnit)}
                        disabled={!hasDeadline}
                        variant="secondary"
                        size="sm"
                      >
                        Добавить интервал
                      </Button>
                    </div>
                    <p className="text-caption text-text-muted">Изменения сохраняются вместе с общей кнопкой «Сохранить».</p>
                  </div>

                  <div className="rounded-panel border border-border/70 bg-background-subtle/55 p-4 text-caption text-text-muted">
                    <p className="font-semibold text-text">Канал доставки</p>
                    <div className="mt-3 grid gap-2">
                      {(['email', 'telegram'] as const).map((channel) => {
                        const info = reminderData?.channels?.[channel]
                        const available = info?.available ?? false
                        const availableCount = reminderData?.channels ? Object.values(reminderData.channels).filter((c) => c.available).length : 0
                        const isOnlyAvailable = availableCount === 1
                        const isAuto = reminderDrafts.every((item) => item.channel === null) && isOnlyAvailable && available
                        return (
                          <RadioCard
                            key={channel}
                            name="reminder-channel"
                            value={channel}
                            checked={reminderDrafts.every((item) => item.channel === channel) || isAuto}
                            onChange={() => applyReminderChannel(channel)}
                            disabled={!available}
                            label={channel === 'email' ? 'Email' : 'Telegram'}
                            description={!available ? info?.reason || 'Недоступен' : isAuto ? 'Единственный доступный канал' : undefined}
                            className={!available ? 'border-danger/25 bg-danger/10' : undefined}
                          />
                        )
                      })}
                    </div>
                    {reminderFieldError ? <p className="mt-3 text-caption text-danger" role="alert">{reminderFieldError}</p> : null}
                  </div>

                  {reminderDrafts.some((item) => item.status === 'invalid.past') ? (
                    <div className="rounded-panel border border-warning/30 bg-warning/10 px-4 py-3 text-caption text-warning">
                      Время напоминания уже прошло. Скорректируйте интервал или срок выполнения.
                    </div>
                  ) : null}
                  {reminderDrafts.some((item) => item.status === 'invalid.channel') ? (
                    <div className="rounded-panel border border-danger/30 bg-danger/10 px-4 py-3 text-caption text-danger">
                      Канал доставки недоступен. Проверьте настройки уведомлений.
                    </div>
                  ) : null}
                </div>
              ) : null}
            </SurfaceCard>

            <SurfaceCard as="section" className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="success">Checklist</Badge>
                    <Badge variant="neutral">{selectedChecklist.length} пунктов</Badge>
                  </div>
                  <h3 className="mt-3 text-h3 text-text">Чек-лист</h3>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                  <TextInput value={newChecklistItem} onChange={(event) => setNewChecklistItem(event.target.value)} placeholder="Добавить пункт" className="sm:w-56" />
                  <Button type="button" onClick={addChecklistItem} size="sm">Добавить</Button>
                </div>
              </div>
              <div className="space-y-2 text-body-sm text-text-muted">
                {selectedChecklist.length === 0 ? (
                  <EmptyState title="Пока нет пунктов" className="p-4">Добавьте первый пункт, чтобы отслеживать прогресс задачи.</EmptyState>
                ) : (
                  selectedChecklist.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-panel border border-border/70 bg-background-subtle/45 px-3 py-3">
                      <Checkbox
                        label={<span className={item.done ? 'line-through opacity-70' : ''}>{item.text}</span>}
                        checked={item.done}
                        onChange={() => toggleChecklistItem(item.id)}
                        className="flex-1 border-transparent bg-transparent px-0 py-0 shadow-none"
                      />
                      <Button type="button" variant="danger" size="sm" onClick={() => removeChecklistItem(item.id)}>
                        Удалить
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </SurfaceCard>

            <SurfaceCard as="section" className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="info">Attachments</Badge>
                    <Badge variant="neutral">{selectedAttachments.length}</Badge>
                  </div>
                  <h3 className="mt-3 text-h3 text-text">Вложения, ссылки и фото</h3>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                  <Select value={newAttachmentType} onChange={(event) => setNewAttachmentType(event.target.value as 'file' | 'link' | 'photo')} className="sm:w-28">
                    <option value="file">Файл</option>
                    <option value="link">Ссылка</option>
                    <option value="photo">Фото</option>
                  </Select>

                  {newAttachmentType === 'file' ? (
                    <>
                      <input
                        key={attachmentFileInputKey}
                        ref={attachmentFileInputRef}
                        type="file"
                        multiple
                        onChange={(event) => {
                          const list = event.target.files ? Array.from(event.target.files) : []
                          setNewAttachmentFiles(list)
                        }}
                        className="hidden"
                      />
                      <Button type="button" onClick={() => attachmentFileInputRef.current?.click()} variant="secondary" size="sm" className="justify-start sm:w-56">
                        {newAttachmentFiles.length === 0 ? 'Файл не выбран' : newAttachmentFiles.length === 1 ? newAttachmentFiles[0]?.name : `Выбрано: ${newAttachmentFiles.length} файла(ов)`}
                      </Button>
                    </>
                  ) : (
                    <>
                      <TextInput value={newAttachmentName} onChange={(event) => setNewAttachmentName(event.target.value)} placeholder="Название" className="sm:w-44" />
                      <TextInput value={newAttachmentUrl} onChange={(event) => setNewAttachmentUrl(event.target.value)} placeholder="URL (необязательно)" className="sm:w-52" />
                    </>
                  )}
                  <Button type="button" onClick={addAttachment} size="sm">Добавить</Button>
                </div>
              </div>
              <div className="grid gap-2 text-body-sm text-text-muted">
                {selectedAttachments.length === 0 ? (
                  <EmptyState title="Вложения отсутствуют" className="p-4">Прикрепите файл или добавьте ссылку к задаче.</EmptyState>
                ) : (
                  selectedAttachments.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-panel border border-border/70 bg-background-subtle/45 px-3 py-3">
                      <span className="inline-flex items-center gap-2 break-all">{item.type === 'file' ? '📎' : item.type === 'photo' ? '🖼️' : '🔗'} {item.name}</span>
                      <div className="flex items-center gap-2 text-caption">
                        {item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:text-primary-hover">Открыть</a> : null}
                        <Button type="button" variant="danger" size="sm" onClick={() => void removeAttachment(item)}>Удалить</Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </SurfaceCard>
          </div>

          <div className="space-y-5">
            <SurfaceCard as="section" className="space-y-4">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="primary">Meta</Badge>
                  <Badge variant="neutral">Task controls</Badge>
                </div>
                <h3 className="mt-3 text-h3 text-text">Параметры задачи</h3>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <Field label="Ответственный" htmlFor="task-assignee">
                  <Select
                    id="task-assignee"
                    value={draft.assignee ?? ''}
                    onChange={(event) => {
                      if (!selectedCardId) return
                      const next = event.target.value ? Number(event.target.value) : null
                      setDraft((prev) => (prev ? { ...prev, assignee: next } : prev))
                    }}
                  >
                    <option value="">Не назначен</option>
                    {assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}
                  </Select>
                </Field>
                <Field
                  label="Срок выполнения"
                  htmlFor="task-deadline"
                  hint={`Выберите дату и время завершения задачи в часовом поясе ${getTimeZoneLabel(profileTimeZone)}.`}
                  hintId="task-deadline-hint"
                >
                  <TextInput
                    id="task-deadline"
                    type="datetime-local"
                    value={draft.deadline}
                    onChange={(event) => {
                      if (!selectedCardId) return
                      const value = event.target.value
                      setDraft((prev) => (prev ? { ...prev, deadline: value } : prev))
                      scheduleDeadlineSave()
                    }}
                    aria-describedby="task-deadline-hint"
                  />
                </Field>
              </div>
            </SurfaceCard>

            <SurfaceCard as="section" className="space-y-4">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="warning">Priority</Badge>
                  <Badge variant="neutral">{selectedPriority || 'Не выбран'}</Badge>
                </div>
                <h3 className="mt-3 text-h3 text-text">Приоритет</h3>
              </div>
              <div className="grid gap-2">
                {[
                  { marker: '🔥', label: 'Срочно', description: 'Нужно обработать в первую очередь' },
                  { marker: '🟡', label: 'Важно', description: 'Желательно закрыть до конца недели' },
                  { marker: '🟢', label: 'Можно позже', description: 'Не блокирует текущую работу' },
                ].map((item) => (
                  <RadioCard
                    key={item.label}
                    name="priority"
                    checked={selectedPriority === item.marker}
                    onChange={() => {
                      if (!selectedCardId) return
                      setDraft((prev) => (prev ? { ...prev, priority: item.marker as BoardPriority } : prev))
                    }}
                    label={`${item.marker} ${item.label}`}
                    description={item.description}
                  />
                ))}
              </div>
            </SurfaceCard>

            <SurfaceCard as="section" className="space-y-4">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="success">Labels</Badge>
                  <Badge variant="neutral">Tags & categories</Badge>
                </div>
                <h3 className="mt-3 text-h3 text-text">Теги и категории</h3>
              </div>
              <div className="grid gap-4">
                <div className="rounded-panel border border-border/70 bg-background-subtle/55 p-4 text-caption text-text-muted">
                  <p className="font-semibold text-text">Доступные теги</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {allKnownTags.length === 0 ? <span>Пока нет тегов в этой доске.</span> : allKnownTags.filter((tag) => !selectedTags.includes(tag)).filter((tag) => (newTag.trim() ? tag.toLowerCase().includes(newTag.trim().toLowerCase()) : true)).map((tag) => <ChipButton key={tag} onClick={() => addTagValue(tag)} tone="primary">+ {tag}</ChipButton>)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedTags.length === 0 ? <span className="text-caption text-text-muted">Теги не добавлены.</span> : selectedTags.map((tag) => <Chip key={tag} tone="primary">{tag}<button type="button" onClick={() => removeTag(tag)} className="text-danger hover:text-danger/80" aria-label={`Удалить тег ${tag}`}>×</button></Chip>)}
                </div>
                <div className="flex items-center gap-2">
                  <TextInput value={newTag} onChange={(event) => setNewTag(event.target.value)} placeholder="Новый тег" />
                  <Button type="button" onClick={addTag} size="sm">Добавить</Button>
                </div>

                <div className="rounded-panel border border-border/70 bg-background-subtle/55 p-4 text-caption text-text-muted">
                  <p className="font-semibold text-text">Доступные категории</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {allKnownCategories.length === 0 ? <span>Пока нет категорий в этой доске.</span> : allKnownCategories.filter((category) => !selectedCategories.includes(category)).filter((category) => (newCategory.trim() ? category.toLowerCase().includes(newCategory.trim().toLowerCase()) : true)).map((category) => <ChipButton key={category} onClick={() => addCategoryValue(category)} tone="success">+ {category}</ChipButton>)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedCategories.length === 0 ? <span className="text-caption text-text-muted">Категории не добавлены.</span> : selectedCategories.map((category) => <Chip key={category} tone="success">{category}<button type="button" onClick={() => removeCategory(category)} className="text-danger hover:text-danger/80" aria-label={`Удалить категорию ${category}`}>×</button></Chip>)}
                </div>
                <div className="flex items-center gap-2">
                  <TextInput value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="Новая категория" />
                  <Button type="button" onClick={addCategory} size="sm" variant="secondary">Добавить</Button>
                </div>
              </div>
            </SurfaceCard>
          </div>
        </div>
      </div>
    </Modal>
  )
}
