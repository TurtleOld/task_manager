import { Badge, Button, Modal } from '@/components/ui'
import type { TaskModalProps } from './TaskModal.types'
import { MainSection } from './sections/MainSection'
import { RemindersSection } from './sections/RemindersSection'
import { ChecklistSection } from './sections/ChecklistSection'
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
      className="max-h-[calc(100vh-2rem)] max-w-7xl overflow-y-auto"
    >
      <div className="space-y-6">
        <section className="rounded-panel border border-primary/15 bg-[image:var(--gradient-surface)] p-6 shadow-elevated">
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-4">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="neutral">#{selectedCard.id}</Badge>
                {boardName ? <Badge variant="info">{boardName}</Badge> : null}
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
              <Button type="button" onClick={onSave} loading={saveBusy} disabled={deleteBusy}>Сохранить</Button>
              <Button type="button" variant="danger" onClick={onDelete} loading={deleteBusy} disabled={saveBusy}>Удалить задачу</Button>
              <Button type="button" variant="secondary" onClick={onClose} disabled={saveBusy || deleteBusy}>Закрыть</Button>
            </div>
          </div>
          {modalError ? (
            <div className="mt-4 rounded-panel border border-danger/25 bg-danger/10 px-4 py-3 text-body-sm text-danger" role="alert">
              {modalError}
            </div>
          ) : null}
        </section>

        <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="space-y-5">
            <MainSection draft={props.draft} setDraft={props.setDraft} />
            <RemindersSection {...props} />
            <ChecklistSection {...props} />
            <AttachmentsSection {...props} />
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
