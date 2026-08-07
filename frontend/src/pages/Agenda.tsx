import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarCheck2,
  CalendarClock,
  CalendarPlus,
  CalendarX2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  XCircle,
} from 'lucide-react'

import { AppLayout } from '@/components/layout/AppLayout'
import { AppointmentDetailDialog } from '@/components/agenda/AppointmentDetailDialog'
import { AppointmentFormDialog } from '@/components/agenda/AppointmentFormDialog'
import { BlockFormDialog } from '@/components/agenda/BlockFormDialog'
import { TimeGrid } from '@/components/agenda/TimeGrid'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { LoadingState } from '@/components/ui/loading-state'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import { StatChip } from '@/components/ui/stat-chip'

export interface Appointment {
  id: string
  clinic_id: string
  branch_id: string
  pet_id: string | null
  walk_in_name?: string
  vet_user_id: string | null
  procedure_type: string
  start_time: string
  end_time: string
  status: string
  pet_name?: string
  vet_name?: string
  branch_name?: string
}

export interface ScheduleBlock {
  id: string
  branch_id: string
  vet_user_id: string | null
  start_time: string
  end_time: string
  reason: string | null
  vet_name?: string
}

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function startOfWeek(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  const day = (copy.getDay() + 6) % 7 // lunes = 0
  copy.setDate(copy.getDate() - day)
  return copy
}

export function Agenda() {
  const [view, setView] = useState<'day' | 'week'>('day')
  const [cursor, setCursor] = useState(() => new Date())
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [branchId, setBranchId] = useState<string>('')
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [createOpen, setCreateOpen] = useState(false)
  const [blockOpen, setBlockOpen] = useState(false)
  const [selected, setSelected] = useState<Appointment | null>(null)

  const range = useMemo(() => {
    const from = view === 'day' ? new Date(cursor) : startOfWeek(cursor)
    from.setHours(0, 0, 0, 0)
    const to = new Date(from)
    to.setDate(to.getDate() + (view === 'day' ? 1 : 7))
    return { from, to }
  }, [view, cursor])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      })
      if (branchId) params.set('branch_id', branchId)
      const [appts, blks, branchList] = await Promise.all([
        apiFetch<Appointment[]>(`/appointments?${params}`),
        apiFetch<ScheduleBlock[]>(`/schedule-blocks?${params}`),
        apiFetch<{ id: string; name: string }[]>('/branches'),
      ])
      setAppointments(appts)
      setBlocks(blks)
      if (!branchId && branchList.length > 0) {
        setBranchId(branchList[0].id)
      }
      setBranches(branchList)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la agenda')
    } finally {
      setLoading(false)
    }
  }, [range, branchId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const days = useMemo(() => {
    if (view === 'day') return [cursor]
    const monday = startOfWeek(cursor)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      return d
    })
  }, [view, cursor])

  const move = (dir: number) => {
    setCursor((c) => {
      const d = new Date(c)
      d.setDate(d.getDate() + (view === 'day' ? dir : dir * 7))
      return d
    })
  }

  const stats = useMemo(() => {
    const scheduled = appointments.filter((a) => a.status === 'scheduled').length
    const confirmed = appointments.filter((a) => a.status === 'confirmed').length
    const completed = appointments.filter((a) => a.status === 'completed').length
    const cancelled = appointments.filter((a) => a.status === 'cancelled').length
    const noShow = appointments.filter((a) => a.status === 'no_show').length
    return { scheduled, confirmed, completed, cancelled, noShow }
  }, [appointments])

  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agenda</h1>
          <p className="text-sm text-muted-foreground">
            {view === 'day'
              ? cursor.toLocaleDateString('es-MX', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })
              : `Semana del ${range.from.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Sucursal" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center rounded-md border border-border bg-card">
            <Button variant="ghost" size="icon-sm" onClick={() => move(-1)} aria-label="Anterior">
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCursor(new Date())}
              className="font-medium"
            >
              Hoy
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => move(1)} aria-label="Siguiente">
              <ChevronRight />
            </Button>
          </div>

          <div className="flex overflow-hidden rounded-full border border-border bg-card">
            {(['day', 'week'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  view === v
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {v === 'day' ? 'Día' : 'Semana'}
              </button>
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={() => setBlockOpen(true)}>
            <CalendarX2 />
            Bloquear
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <CalendarPlus />
            Nueva cita
          </Button>
        </div>
      </div>

      {!loading && !error && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatChip
            label="Por atender"
            value={stats.scheduled + stats.confirmed}
            icon={CalendarCheck2}
            tint="bg-info/10 text-info"
          />
          <StatChip
            label="Pendientes de confirmar"
            value={stats.scheduled}
            icon={CalendarClock}
            tint="bg-warning/10 text-warning"
          />
          <StatChip
            label="Completadas"
            value={stats.completed}
            icon={CheckCircle2}
            tint="bg-success/10 text-success"
          />
          <StatChip
            label="Canceladas / No asistió"
            value={stats.cancelled + stats.noShow}
            icon={XCircle}
            tint="bg-destructive/10 text-destructive"
          />
        </div>
      )}

      {error && <ErrorState description={error} onRetry={loadData} className="mb-6" />}
      {loading && <LoadingState label="Cargando agenda…" />}

      {!loading && !error && appointments.length === 0 && blocks.length === 0 && (
        <EmptyState
          title="Sin citas en este rango"
          description="Crea tu primera cita o bloquea horario para este día."
          className="mb-4"
          icon={Clock}
        />
      )}

      {!loading && !error && (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
          <div
            className="grid border-b border-border"
            style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` }}
          >
            <div />
            {days.map((d) => {
              const isToday = d.toDateString() === new Date().toDateString()
              return (
                <div
                  key={d.toISOString()}
                  className={cn(
                    'flex flex-col items-center gap-1 border-l border-border py-2.5',
                    isToday && 'bg-primary/[0.04]',
                  )}
                >
                  <span className="text-xs font-medium text-muted-foreground">
                    {view === 'week'
                      ? DAYS[(d.getDay() + 6) % 7]
                      : d.toLocaleDateString('es-MX', { weekday: 'long' })}
                  </span>
                  <span
                    className={cn(
                      'flex size-8 items-center justify-center rounded-full text-base font-semibold',
                      isToday
                        ? 'bg-primary text-primary-foreground shadow-glow'
                        : 'text-foreground',
                    )}
                  >
                    {d.getDate()}
                  </span>
                </div>
              )
            })}
          </div>

          <TimeGrid
            days={days}
            appointments={appointments}
            blocks={blocks}
            onSelectAppointment={(a) => setSelected(a)}
            onCreateAppointment={(d) => {
              setCreateOpen(true)
              setCursor(d)
            }}
          />
        </div>
      )}

      <AppointmentFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultDay={cursor}
        defaultBranchId={branchId}
        onSaved={() => {
          setCreateOpen(false)
          loadData()
        }}
      />

      <BlockFormDialog
        open={blockOpen}
        onOpenChange={setBlockOpen}
        defaultBranchId={branchId}
        onSaved={() => {
          setBlockOpen(false)
          loadData()
        }}
      />

      {selected && (
        <AppointmentDetailDialog
          appointment={selected}
          open={Boolean(selected)}
          onOpenChange={(o) => {
            if (!o) setSelected(null)
          }}
          onChanged={() => {
            setSelected(null)
            loadData()
          }}
        />
      )}
    </AppLayout>
  )
}
