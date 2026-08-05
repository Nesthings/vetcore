import { Ban, Clock } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import type { Appointment, ScheduleBlock } from '@/pages/Agenda'
import { cn } from '@/lib/utils'

const START_HOUR = 7
const END_HOUR = 20
const HOUR_PX = 64
const TRACK_HEIGHT = (END_HOUR - START_HOUR) * HOUR_PX

function topPx(d: Date): number {
  return ((d.getHours() - START_HOUR) * 60 + d.getMinutes()) * (HOUR_PX / 60)
}

function heightPx(start: Date, end: Date): number {
  const mins = Math.max(15, (end.getTime() - start.getTime()) / 60000)
  return mins * (HOUR_PX / 60)
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

const STATUS_STYLES: Record<string, string> = {
  scheduled: 'bg-warning/90 border-warning text-warning-foreground',
  confirmed: 'bg-info/90 border-info text-info-foreground',
  completed: 'bg-success/90 border-success text-success-foreground',
  cancelled: 'bg-muted border-border text-muted-foreground line-through',
  no_show: 'bg-destructive/80 border-destructive text-destructive-foreground',
}

export function TimeGrid({
  days,
  appointments,
  blocks,
  onSelectAppointment,
  onCreateAppointment,
}: {
  days: Date[]
  appointments: Appointment[]
  blocks: ScheduleBlock[]
  onSelectAppointment: (a: Appointment) => void
  onCreateAppointment: (day: Date) => void
}) {
  return (
    <div className="relative overflow-x-auto">
      <div
        className="grid"
        style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}
      >
        {/* Columna de horas */}
        <div className="relative" style={{ height: TRACK_HEIGHT }}>
          {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => {
            const h = START_HOUR + i
            return (
              <div
                key={h}
                className="absolute right-0 flex w-full items-start justify-end pr-2 text-[11px] text-muted-foreground"
                style={{ top: i * HOUR_PX, height: HOUR_PX }}
              >
                {`${h}:00`}
              </div>
            )
          })}
        </div>

        {days.map((day) => {
          const dayAppts = appointments
            .map((a) => ({ a, start: new Date(a.start_time), end: new Date(a.end_time) }))
            .filter(({ start }) => sameLocalDay(start, day))
          const dayBlocks = blocks
            .map((b) => ({ b, start: new Date(b.start_time), end: new Date(b.end_time) }))
            .filter(({ start }) => sameLocalDay(start, day))

          return (
            <div
              key={day.toISOString()}
              className="relative border-l border-border"
              style={{ height: TRACK_HEIGHT }}
            >
              {/* filas de horas */}
              {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                <div
                  key={i}
                  className={cn(
                    'absolute w-full border-b border-border/60',
                    i % 2 === 1 && 'bg-muted/30',
                  )}
                  style={{ top: i * HOUR_PX, height: HOUR_PX }}
                />
              ))}

              {/* bloques de horario */}
              {dayBlocks.map(({ b, start, end }) => (
                <div
                  key={b.id}
                  className="absolute inset-x-1 z-10 flex items-center gap-1 overflow-hidden rounded-md border border-dashed border-destructive/40 bg-destructive/10 px-2 text-xs font-medium text-destructive"
                  style={{ top: topPx(start), height: heightPx(start, end) }}
                  title={`Bloqueado: ${b.reason ?? 'sin motivo'}`}
                >
                  <Ban className="size-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{b.reason ?? 'Bloqueo'}</span>
                </div>
              ))}

              {/* citas */}
              {dayAppts.map(({ a, start, end }) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onSelectAppointment(a)}
                  className={cn(
                    'absolute inset-x-1 z-20 cursor-pointer overflow-hidden rounded-md border px-2 py-1 text-left shadow-card transition-transform hover:-translate-y-px hover:shadow-elevated',
                    STATUS_STYLES[a.status] ?? 'bg-primary text-primary-foreground',
                  )}
                  style={{ top: topPx(start), height: heightPx(start, end) }}
                >
                  <p className="truncate text-xs font-semibold leading-tight">
                    {a.pet_name ?? 'Paciente'}
                  </p>
                  <p className="truncate text-[11px] opacity-90 leading-tight">
                    {a.procedure_type}
                    {a.vet_name ? ` · ${a.vet_name}` : ''}
                  </p>
                  <p className="mt-0.5 text-[10px] opacity-80">
                    {start.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} –{' '}
                    {end.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </button>
              ))}

              {/* slot vacío para crear cita */}
              <button
                type="button"
                aria-label="Crear cita en este día"
                className="absolute inset-0 h-full w-full cursor-copy opacity-0 transition-opacity hover:opacity-100"
                style={{ background: 'var(--primary)' }}
                onClick={() => onCreateAppointment(day)}
              >
                <span className="flex items-center justify-center gap-2 text-xs font-medium text-primary-foreground">
                  <Clock className="size-4" aria-hidden="true" />
                  Nueva cita
                </span>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function statusBadge(status: string) {
  const map: Record<
    string,
    { label: string; variant: 'success' | 'warning' | 'info' | 'destructive' | 'secondary' }
  > = {
    scheduled: { label: 'Agendada', variant: 'warning' },
    confirmed: { label: 'Confirmada', variant: 'info' },
    completed: { label: 'Completada', variant: 'success' },
    cancelled: { label: 'Cancelada', variant: 'destructive' },
    no_show: { label: 'No asistió', variant: 'secondary' },
  }
  const s = map[status] ?? { label: status, variant: 'secondary' as const }
  return <Badge variant={s.variant}>{s.label}</Badge>
}
