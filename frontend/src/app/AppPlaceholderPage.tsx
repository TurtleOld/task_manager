import { Badge, Card as SurfaceCard, PageShell } from '../shared/ui'

interface AppPlaceholderPageProps {
  title: string
  description: string
  taskId: string
}

export function AppPlaceholderPage({ title, description, taskId }: AppPlaceholderPageProps) {
  return (
    <PageShell width="2xl" padding="comfortable" spacing="md">
      <SurfaceCard as="section" className="space-y-4 border-primary/10 shadow-elevated">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="primary">{taskId}</Badge>
          <Badge variant="neutral">Запланировано</Badge>
        </div>
        <div>
          <h2 className="text-h2 text-text">{title}</h2>
          <p className="mt-2 max-w-2xl text-body-sm text-text-muted">{description}</p>
        </div>
      </SurfaceCard>
    </PageShell>
  )
}
