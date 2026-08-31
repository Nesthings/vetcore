import { useCallback, useEffect, useState } from 'react'
import { Check, CheckCircle2, Loader2, Plus, SkipForward, XCircle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { apiFetch } from '@/lib/api'
import { TASK_PRIORITY_META, TASK_TYPE_LABELS } from '@/lib/hospitalization'
import type { HospTask } from '@/lib/hospitalization'
import { cn } from '@/lib/utils'

export function TasksSection({ hospitalizationId }: { hospitalizationId: string }) {
  const { toast } = useToast()
  const [tasks, setTasks] = useState<HospTask[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setTasks(await apiFetch<HospTask[]>(`/hospitalization/${hospitalizationId}/tasks`))
    } catch {
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [hospitalizationId])

  useEffect(() => {
    load()
  }, [load])

  const act = async (id: string, action: 'complete' | 'skip' | 'cancel') => {
    setBusyId(id)
    try {
      await apiFetch(`/hospitalization/tasks/${id}/${action}`, { method: 'POST' })
      toast({ title: 'Tarea actualizada', variant: 'success' })
      await load()
    } catch (err) {
      toast({
        title: 'No se pudo actualizar la tarea',
        description: err instanceof Error ? err.message : 'Intenta de nuevo.',
        variant: 'error',
      })
    } finally {
      setBusyId(null)
    }
  }

  const overdue = tasks.filter((t) => t.status === 'pending' && (t.overdue ?? t.scheduled_at < new Date().toISOString())).length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Tareas</h3>
          {overdue > 0 && (
            <Badge variant="destructive">{overdue} atrasadas</Badge>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus /> Agregar tarea
        </Button>
      </div>

      {loading ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Cargando tareas…</p>
      ) : tasks.length === 0 ? (
        <EmptyState title="Sin tareas" description="Aún no hay tareas para esta hospitalización." icon={CheckCircle2} />
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => {
            const isPending = t.status === 'pending'
            const isLate = isPending && (t.overdue ?? t.scheduled_at < new Date().toISOString())
            const prio = TASK_PRIORITY_META[t.priority] ?? TASK_PRIORITY_META.normal
            return (
              <div
                key={t.id}
                className={cn(
                  'flex flex-col gap-2 rounded-lg border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between',
                  isLate
                    ? 'border-destructive/40 bg-destructive/5'
                    : isPending
                      ? 'border-border bg-card'
                      : 'border-border/60 bg-muted/30 opacity-70',
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{t.description}</p>
                    <Badge variant="secondary">{TASK_TYPE_LABELS[t.type] ?? t.type}</Badge>
                    <Badge variant={prio.badge}>{prio.label}</Badge>
                    {isLate && <Badge variant="destructive">Atrasada</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Programada {new Date(t.scheduled_at).toLocaleString('es-MX')}
                    {t.status === 'completed' && t.completed_at && (
                      <> · Completada {new Date(t.completed_at).toLocaleString('es-MX')}</>
                    )}
                    {t.observation && <span className="block">{t.observation}</span>}
                  </p>
                </div>
                {isPending && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button size="xs" variant="success" disabled={busyId === t.id} onClick={() => act(t.id, 'complete')}>
                      <Check /> Completar
                    </Button>
                    <Button size="xs" variant="outline" disabled={busyId === t.id} onClick={() => act(t.id, 'skip')}>
                      <SkipForward /> Omitir
                    </Button>
                    <Button size="xs" variant="ghost" disabled={busyId === t.id} onClick={() => act(t.id, 'cancel')}>
                      <XCircle /> Cancelar
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <AddTaskDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        hospitalizationId={hospitalizationId}
        onSaved={() => {
          setAddOpen(false)
          load()
        }}
      />
    </div>
  )
}

function AddTaskDialog({
  open,
  onOpenChange,
  hospitalizationId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  hospitalizationId: string
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [type, setType] = useState('other')
  const [description, setDescription] = useState('')
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  })
  const [priority, setPriority] = useState('normal')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    if (!description.trim()) {
      setError('Describe la tarea.')
      return
    }
    setBusy(true)
    try {
      await apiFetch(`/hospitalization/${hospitalizationId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          type,
          description: description.trim(),
          scheduled_at: new Date(scheduledAt).toISOString(),
          priority,
        }),
      })
      toast({ title: 'Tarea creada', variant: 'success' })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la tarea')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar tarea</DialogTitle>
          <DialogDescription>Programa una tarea operativa para esta hospitalización.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <select value={type} onChange={(e) => setType(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                {Object.entries(TASK_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Prioridad</Label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="low">Baja</option>
                <option value="normal">Normal</option>
                <option value="high">Alta</option>
                <option value="critical">Crítica</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descripción *</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej. Administrar analgesia" />
          </div>
          <div className="space-y-2">
            <Label>Programada para</Label>
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Plus />} Crear
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
