import { Badge, Button, Modal } from '@/components/ui'
import type { TaskModalProps } from './TaskModal.types'
import { MainSection } from './sections/MainSection'
import { RemindersSection } from './sections/RemindersSection'
import { ChecklistSection } from './sections/ChecklistSection'
import { SubtasksSection } from './sections/SubtasksSection'
import { RecurrenceSection } from './sections/RecurrenceSection'
import { CommentsSection } from './sections/CommentsSection'
import { ActivitySection } from './sections/ActivitySection'
import { AttachmentsSection } from './sections/AttachmentsSection'
import { MetaSection } from './sections/MetaSection'
import { PrioritySection } from './sections/PrioritySection'
import { LabelsSection } from './sections/LabelsSection'

export function TaskModal(props: TaskModalProps) {
  const {
    selectedCard,
    boardName,
    draft,
    saveBusy,
    deleteBusy,
    modalError,
    onClose,
    onSave,
    onDelete,
  } = props

  return (
    <Modal
      open={Boolean(selectedCard && draft)}
      onClose={() => {
        if (!saveBusy && !deleteBusy) onClose()
      }}
      title={selectedCard.title || 'Редактирование задачи'}
      className="p-0 max-w-7xl w-[calc(100%-2rem)] flex flex-col max-h-[calc(100vh-2rem)]"
    >
      {/* Sticky header */}
      <div className="shrink-0 rounded-t-overlay border-b border-border bg-surface-elevated px-6 py-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-6">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="neutral">#{selectedCard.id}</Badge>
              {boardName ? <Badge variant="info">{boardName}</Badge> : null}
              <span className="text-label uppercase text-text-muted">Редактирование задачи</span>
            </div>
            <h3 className="break-words text-h3 text-text">{selectedCard.title || 'Без названия'}</h3>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 lg:flex-nowrap">
            <Button type="button" onClick={onSave} loading={saveBusy} disabled={deleteBusy} className="flex-1 lg:flex-none">Сохранить</Button>
            <Button type="button" variant="danger" onClick={onDelete} loading={deleteBusy} disabled={saveBusy} className="flex-1 lg:flex-none">Архивировать</Button>
            <Button type="button" variant="secondary" onClick={onClose} disabled={saveBusy || deleteBusy} className="flex-1 lg:flex-none">Закрыть</Button>
          </div>
        </div>
        {modalError ? (
          <div className="mt-3 rounded-panel border border-danger/25 bg-danger/10 px-4 py-3 text-body-sm text-danger" role="alert">
            {modalError}
          </div>
        ) : null}
      </div>

      {/* Scrollable body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="grid w-full gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="space-y-5">
            <MainSection draft={props.draft} setDraft={props.setDraft} />
            <RemindersSection {...props} />
            <RecurrenceSection {...props} />
            <SubtasksSection {...props} />
            <ChecklistSection {...props} />
            <AttachmentsSection {...props} />
            <CommentsSection {...props} />
            <ActivitySection {...props} />
          </div>

          <div className="space-y-5">
            <MetaSection {...props} />
            <PrioritySection {...props} />
            <LabelsSection {...props} />
          </div>
        </div>
      </div>
    </Modal>
  )
}
