import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Check, CircleCheck, ClipboardPlus, Loader2, X } from 'lucide-react'

import { statusBadge } from '@/components/agenda/TimeGrid'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Appointment } from '@/pages/Agenda'
import { apiFetch } from '@/lib/api'

interface ReminderStage {
  stage: '48h' | '24h' | '2h'
  window_time: string
  status: 'pending' | 'pending_due' | 'sent' | 'not_consented'
  owner_consented: boolean | null
}

interface ReminderSchedule {
  consent: boolean
  stages: ReminderStage[]
}

const STAGE_LABELS: Record<string, string> = {
  '48h': '48h antes',
  '24h': '24h antes',
  '2h': '2h antes',
}

const STAGE_STATUS: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'secondary' }
> = {
  sent: { label: 'Enviado', variant: 'success' },
  pending_due: { label: 'Pendiente (toca ya)', variant: 'warning' },
  pending: { label: 'Pendiente', variant: 'secondary' },
  not_consented: { label: 'Sin consentimiento', variant: 'secondary' },
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function AppointmentDetailDialog({
  appointment,
  open,
  onOpenChange,
  onChanged,
}: {
  appointment: Appointment
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}) {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [schedule, setSchedule] = useState<ReminderSchedule | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (open) {
      setStart(toLocalInputValue(new Date(appointment.start_time)))
      setEnd(toLocalInputValue(new Date(appointment.end_time)))
      setError(null)
      apiFetch<ReminderSchedule>(`/automation/appointments/${appointment.id}/reminder-schedule`)
        .then(setSchedule)
        .catch(() => setSchedule(null))
    }
  }, [open, appointment])

  const save = async () => {
    setError(null)
    setSubmitting(true)
    try {
      await apiFetch(`/appointments/${appointment.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          start_time: new Date(start).toISOString(),
          end_time: new Date(end).toISOString(),
        }),
      })
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reagendar')
    } finally {
      setSubmitting(false)
    }
  }

  const setStatus = async (status: string) => {
    setError(null)
    try {
      await apiFetch(`/appointments/${appointment.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la cita')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Detalle de la cita</DialogTitle>
          <DialogDescription>
            {appointment.pet_name ?? 'Paciente sin registro'} · {appointment.procedure_type}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
            <span className="text-muted-foreground">Estado</span>
            {statusBadge(appointment.status)}
          </div>

          <div className="grid gap-2 text-sm">
            <p>
              <span className="text-muted-foreground">Paciente: </span>
              <span className="font-medium">{appointment.pet_name}</span>
              {!appointment.pet_id && <Badge variant="secondary">sin registro</Badge>}
            </p>
            <p>
              <span className="text-muted-foreground">Veterinario: </span>
              <span className="font-medium">{appointment.vet_name ?? 'Sin asignar'}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Sucursal: </span>
              <span className="font-medium">{appointment.branch_name}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Inicio</Label>
              <Input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Fin</Label>
              <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {appointment.pet_id && (
              <Button
                variant="success"
                size="sm"
                onClick={() => navigate(`/consultas/nueva?pet=${appointment.pet_id}`)}
              >
                <ClipboardPlus /> Atender (Nueva consulta)
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setStatus('confirmed')}>
              <Check /> Confirmar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setStatus('completed')}>
              <CircleCheck /> Completar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setStatus('no_show')}>
              <X /> No asistió
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive"
              onClick={() => setStatus('cancelled')}
            >
              Cancelar
            </Button>
          </div>

          {schedule && (
            <div className="rounded-md border border-border p-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Bell className="size-4 text-primary" aria-hidden="true" />
                Recordatorios escalonados
                {!schedule.consent && <Badge variant="secondary">dueño sin opt-in</Badge>}
              </p>
              <div className="space-y-1.5">
                {schedule.stages.map((s) => {
                  const st = STAGE_STATUS[s.status] ?? { label: s.status, variant: 'secondary' }
                  return (
                    <div key={s.stage} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{STAGE_LABELS[s.stage]}</span>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button onClick={save} disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : 'Guardar cambio de horario'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
