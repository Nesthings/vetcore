import { Ban, Plus } from 'lucide-react'

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

const STATUS_META: Record<string, { accent: string; soft: string }> = {
  scheduled: { accent: 'bg-warning', soft: 'bg-warning/10 hover:bg-warning/15' },
  confirmed: { accent: 'bg-info', soft: 'bg-info/10 hover:bg-info/15' },
  completed: { accent: 'bg-success', soft: 'bg-success/10 hover:bg-success/15' },
  cancelled: { accent: 'bg-muted-foreground/50', soft: 'bg-muted/40 opacity-60' },
  no_show: { accent: 'bg-destructive', soft: 'bg-destructive/10 hover:bg-destructive/15' },
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
  const now = new Date()

  return (
    <div className="relative overflow-x-auto">
      <div
        className="grid"
        style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` }}
      >
        {/* Columna de horas */}
        <div className="relative" style={{ height: TRACK_HEIGHT }}>
          {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => {
            const h = START_HOUR + i
            return (
              <div
                key={h}
                className="absolute right-0 flex w-full items-start justify-end pr-2 text-[11px] font-medium text-muted-foreground"
                style={{ top: i * HOUR_PX, height: HOUR_PX }}
              >
                {`${h}:00`}
              </div>
            )
          })}
        </div>

        {days.map((day) => {
          const isToday = sameLocalDay(now, day)
          const dayAppts = appointments
            .map((a) => ({ a, start: new Date(a.start_time), end: new Date(a.end_time) }))
            .filter(({ start }) => sameLocalDay(start, day))
          const dayBlocks = blocks
            .map((b) => ({ b, start: new Date(b.start_time), end: new Date(b.end_time) }))
            .filter(({ start }) => sameLocalDay(start, day))

          return (
            <div
              key={day.toISOString()}
              className={cn('relative border-l border-border', isToday && 'bg-primary/[0.03]')}
              style={{ height: TRACK_HEIGHT }}
            >
              {/* filas de horas */}
              {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                <div
                  key={i}
                  className={cn(
                    'absolute w-full border-b border-border/50',
                    i % 2 === 1 && 'bg-muted/20',
                  )}
                  style={{ top: i * HOUR_PX, height: HOUR_PX }}
                />
              ))}

              {/* línea "ahora" */}
              {isToday && now.getHours() >= START_HOUR && now.getHours() < END_HOUR && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-30"
                  style={{ top: topPx(now) }}
                >
                  <div className="relative border-t-2 border-destructive/70">
                    <span className="absolute -left-1 -top-[5px] size-2.5 rounded-full bg-destructive/70" />
                  </div>
                </div>
              )}

              {/* bloques de horario */}
              {dayBlocks.map(({ b, start, end }) => (
                <div
                  key={b.id}
                  className="absolute inset-x-1 z-10 flex items-center gap-1.5 overflow-hidden rounded-lg border border-dashed border-muted-foreground/30 bg-muted/50 px-2 text-xs font-medium text-muted-foreground"
                  style={{ top: topPx(start), height: heightPx(start, end) }}
                  title={`Bloqueado: ${b.reason ?? 'sin motivo'}`}
                >
                  <Ban className="size-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{b.reason ?? 'Bloqueo'}</span>
                </div>
              ))}

              {/* citas */}
              {dayAppts.map(({ a, start, end }) => {
                const meta = STATUS_META[a.status] ?? {
                  accent: 'bg-primary',
                  soft: 'bg-primary/10 hover:bg-primary/15',
                }
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onSelectAppointment(a)}
                    className={cn(
                      'group absolute inset-x-1 z-20 flex cursor-pointer flex-col gap-0.5 overflow-hidden rounded-lg border border-border/60 px-2.5 py-1 text-left shadow-sm backdrop-blur-sm transition-all duration-150 hover:-translate-y-px hover:shadow-elevated',
                      meta.soft,
                    )}
                    style={{ top: topPx(start), height: heightPx(start, end) }}
                  >
                    <span
                      className={cn(
                        'pointer-events-none absolute inset-y-0 left-0 w-1',
                        meta.accent,
                      )}
                      aria-hidden="true"
                    />
                    <p
                      className={cn(
                        'truncate pl-1 text-xs font-semibold leading-tight',
                        a.status === 'cancelled' && 'line-through',
                      )}
                    >
                      {a.pet_name ?? 'Paciente'}
                    </p>
                    <p className="truncate pl-1 text-[11px] leading-tight text-muted-foreground">
                      {a.procedure_type}
                      {a.vet_name ? ` · ${a.vet_name}` : ''}
                    </p>
                    <p className="mt-0.5 pl-1 text-[10px] font-medium leading-tight text-muted-foreground">
                      {start.toLocaleTimeString('es-MX', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      –{' '}
                      {end.toLocaleTimeString('es-MX', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </button>
                )
              })}

              {/* slot vacío para crear cita */}
              <button
                type="button"
                aria-label="Crear cita en este día"
                className="group absolute inset-0 z-10 h-full w-full cursor-copy"
                onClick={() => onCreateAppointment(day)}
              >
                <span className="pointer-events-none absolute inset-x-2 top-1 hidden items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-2 py-1.5 text-xs font-medium text-primary group-hover:flex">
                  <Plus className="size-3.5" aria-hidden="true" />
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
