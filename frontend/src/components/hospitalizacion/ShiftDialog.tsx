import { useCallback, useEffect, useState } from 'react'
import { ClipboardList, Loader2, Play, Square } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { StatChip } from '@/components/ui/stat-chip'
import { useToast } from '@/components/ui/toast'
import { apiFetch } from '@/lib/api'
import { OPERATIONAL_META, STATUS_META } from '@/lib/hospitalization'
import type { CurrentShift, ShiftHistoryItem } from '@/lib/hospitalization'

export function ShiftDialog({
  open,
  onOpenChange,
  branchId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  branchId: string
}) {
  const { toast } = useToast()
  const [data, setData] = useState<CurrentShift | null>(null)
  const [history, setHistory] = useState<ShiftHistoryItem[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (branchId) params.set('branch_id', branchId)
      setData(await apiFetch<CurrentShift>(`/hospitalization/shifts/current?${params}`))
      setHistory(await apiFetch<ShiftHistoryItem[]>('/hospitalization/shifts'))
    } catch {
      setData(null)
    }
  }, [branchId])

  useEffect(() => {
    if (open) {
      setNote('')
      load()
    }
  }, [open, load])

  const start = async () => {
    setBusy(true)
    try {
      await apiFetch('/hospitalization/shifts/start', { method: 'POST' })
      toast({ title: 'Turno iniciado', variant: 'success' })
      await load()
    } catch (err) {
      toast({ title: 'No se pudo iniciar', description: err instanceof Error ? err.message : 'Error.', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const complete = async () => {
    if (!data?.shift) return
    setBusy(true)
    try {
      await apiFetch(`/hospitalization/shifts/${data.shift.id}/complete?handover_note=${encodeURIComponent(note.trim())}`, {
        method: 'POST',
      })
      toast({ title: 'Turno cerrado', description: 'Nota de entrega guardada.', variant: 'success' })
      await load()
    } catch (err) {
      toast({ title: 'No se pudo cerrar', description: err instanceof Error ? err.message : 'Error.', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="size-5 text-primary" /> Cambio de turno
          </DialogTitle>
          <DialogDescription>Resumen operativo de las estancias activas y nota de entrega.</DialogDescription>
        </DialogHeader>

        {!data ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : data.shift === null ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              No hay un turno abierto. Inicia tu turno para dejar registro del resumen y la nota de entrega.
            </p>
            <Button onClick={start} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Play />} Iniciar turno
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <StatChip label="Pacientes" value={data.summary.counts.patients} icon={ClipboardList} tint="bg-primary/10 text-primary" />
              <StatChip label="Tareas atrasadas" value={data.summary.counts.overdue} icon={ClipboardList} tint="bg-destructive/10 text-destructive" />
              <StatChip label="Medicamentos pendientes" value={data.summary.counts.pending_meds} icon={ClipboardList} tint="bg-warning/10 text-warning" />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Resumen por paciente · turno desde{' '}
                {new Date(data.shift.started_at).toLocaleString('es-MX')}
              </p>
              {data.summary.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin pacientes activos.</p>
              ) : (
                data.summary.rows.map((r) => {
                  const st = STATUS_META[r.status as keyof typeof STATUS_META]
                  const op = OPERATIONAL_META[r.operational_status as keyof typeof OPERATIONAL_META]
                  return (
                  <div key={r.hospitalization_id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
                    <span className="font-medium">{r.pet_name}</span>
                    {st && <Badge variant={st.badge}>{st.label}</Badge>}
                    {op && <Badge variant={op.badge}>{op.label}</Badge>}
                    {r.accommodation && <Badge variant="outline">{r.accommodation}</Badge>}
                    {r.overdue_count > 0 && <Badge variant="destructive">{r.overdue_count} atrasadas</Badge>}
                    {r.pending_meds > 0 && <Badge variant="warning">{r.pending_meds} meds pend.</Badge>}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {r.last_vitals_at
                        ? `SV ${new Date(r.last_vitals_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`
                        : 'sin SV'}
                      {r.next_task_at
                        ? ` · próx ${new Date(r.next_task_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`
                        : ''}
                    </span>
                  </div>
                  )
                })
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Nota de entrega
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ej. Paciente estable. Vigilar alimentación. Próxima medicación a las 16:00."
                className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <Button variant="success" onClick={complete} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Square />} Cerrar turno
            </Button>

            {history.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Turnos anteriores</p>
                {history.map((h) => (
                  <div key={h.id} className="rounded border border-border/60 bg-muted/20 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{h.user_name ?? 'Staff'}</span>
                      <span className="text-muted-foreground">
                        {new Date(h.started_at).toLocaleString('es-MX')}
                        {h.ended_at ? ` → ${new Date(h.ended_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}` : ''}
                      </span>
                    </div>
                    {h.handover_note && <p className="mt-1 text-muted-foreground">{h.handover_note}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
