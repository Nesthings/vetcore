import { memo, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Cake,
  ChevronDown,
  ChevronUp,
  ClipboardPlus,
  GripVertical,
  Loader2,
  PanelTop,
  PartyPopper,
  PawPrint,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Syringe,
  Timer,
  X,
} from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { AppLayout } from '@/components/layout/AppLayout'
import { DashboardChart } from '@/components/dashboards/DashboardChart'
import { DashboardTray } from '@/components/dashboards/DashboardTray'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { LoadingState } from '@/components/ui/loading-state'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/components/ui/toast'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { usePermissions } from '@/lib/permissions'
import { useNavConfig } from '@/lib/nav-config'
import { useDashboardConfig } from '@/lib/dashboard-config'
import { DASHBOARD_CATALOG, getDashboard } from '@/lib/dashboards'
import { MODULE_META, NAV_ROUTES } from '@/lib/nav'
import { cn } from '@/lib/utils'

const SECTION_IDS = ['resumen', 'hoy', 'citas', 'modulos', 'dashboards'] as const
type SectionId = (typeof SECTION_IDS)[number]

const DEFAULT_SECTION_ORDER: SectionId[] = ['resumen', 'modulos', 'hoy', 'dashboards', 'citas']

const SECTION_LABELS: Record<SectionId, string> = {
  resumen: 'Resumen del día',
  hoy: 'Hoy · Flujo de pacientes',
  citas: 'Próximas citas',
  modulos: 'Módulos',
  dashboards: 'Dashboards',
}

const SECTIONS_KEY_PREFIX = 'vetcore_dashboard_sections_'

// Orden de las tarjetas del Módulo "Módulos" en el Inicio (el resto va después).
const MODULE_CARD_ORDER = ['pets', 'agenda', 'inventory', 'products']

interface DayDashboard {
  date: string
  period: 'day' | 'week' | 'month'
  period_label: string
  citas_total: number
  citas_por_estado: Record<string, number>
  consultas_series: { label: string; count: number }[]
  citas: {
    id: string
    pet_name?: string
    vet_name?: string
    procedure_type: string
    start_time: string
    end_time: string
    status: string
  }[]
  bloques: number
  stock_alerts: { product_id: string; name: string; stock: number }[]
  pacientes_activos: number
  mascotas_atendidas: number
  waitlist_count: number
  pending_purchase_orders: number
  nuevas_mascotas: number
  vacunas_hoy: number
}

interface BirthdayPet {
  pet_id: string
  pet_name: string
  pet_photo?: string | null
  age?: number | null
  owner_name?: string | null
  owner_phone?: string | null
  owner_email?: string | null
  already_sent: boolean
}

interface BirthdayData {
  pets: BirthdayPet[]
  settings: {
    message: string
    send_email: boolean
    send_whatsapp: boolean
    clinic_name: string
  }
}

type Period = 'day' | 'week' | 'month'

const PERIODS: { value: Period; label: string }[] = [
  { value: 'day', label: 'Diario' },
  { value: 'week', label: 'Semanal' },
  { value: 'month', label: 'Mensual' },
]

const STATUS_LABELS: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'info' | 'destructive' | 'secondary' }
> = {
  scheduled: { label: 'Agendada', variant: 'warning' },
  confirmed: { label: 'Confirmada', variant: 'info' },
  completed: { label: 'Completada', variant: 'success' },
  cancelled: { label: 'Cancelada', variant: 'destructive' },
  no_show: { label: 'No asistió', variant: 'secondary' },
}

function KpiCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string
  value: number | string
  icon: React.ElementType
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-1.5 text-2xl font-bold tracking-tight text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

const FlujoBarChart = memo(function FlujoBarChart({
  data,
}: {
  data: { label: string; count: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height="100%" debounce={100}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip cursor={{ fill: 'var(--muted)' }} formatter={(v) => [`${v} citas`, 'Citas']} />
        <Bar
          dataKey="count"
          fill="var(--chart-1)"
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  )
})

function SectionFrame({
  label,
  isFirst,
  isLast,
  onMove,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  highlighted,
  children,
}: {
  label: string
  isFirst: boolean
  isLast: boolean
  onMove: (dir: -1 | 1) => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  highlighted: boolean
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        'group rounded-xl transition-shadow',
        highlighted && 'outline-2 outline-dashed outline-primary/50 outline-offset-4',
      )}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="mb-1.5 flex h-6 items-center justify-between">
        <span
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          title={`Mover sección: ${label} (arrastra o usa las flechas)`}
          className="inline-flex cursor-grab items-center gap-1 rounded px-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground opacity-60 transition hover:bg-accent hover:text-foreground hover:opacity-100 active:cursor-grabbing max-md:opacity-100"
        >
          <GripVertical className="size-3.5" aria-hidden="true" />
          {label}
        </span>
        <span className="flex items-center gap-0.5 opacity-60 transition group-hover:opacity-100 max-md:opacity-100">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={isFirst}
            aria-label={`Subir ${label}`}
            className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronUp className="size-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={isLast}
            aria-label={`Bajar ${label}`}
            className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </button>
        </span>
      </div>
      {children}
    </section>
  )
}

export function Dashboard() {
  const { user } = useAuth()
  const [data, setData] = useState<DayDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { hasComponent } = usePermissions()
  const { pinned, unpin } = useNavConfig()
  const { active, add, remove } = useDashboardConfig()
  const [modulesDragOver, setModulesDragOver] = useState(false)
  const [trayOpen, setTrayOpen] = useState(false)
  const [gridDragOver, setGridDragOver] = useState(false)
  const [trayBtnDragOver, setTrayBtnDragOver] = useState(false)
  const [dashData, setDashData] = useState<Record<string, unknown>>({})
  const [period, setPeriod] = useState<Period>('day')
  const [birthdays, setBirthdays] = useState<BirthdayData | null>(null)
  const [birthdayBusy, setBirthdayBusy] = useState<string | null>(null)
  const { toast } = useToast()

  const periodHint =
    period === 'day' ? 'hoy' : period === 'week' ? 'últimos 7 días' : 'últimos 30 días'

  const userKey = user?.sub ?? 'anon'
  const [order, setOrder] = useState<SectionId[]>(() => {
    try {
      const raw = localStorage.getItem(SECTIONS_KEY_PREFIX + userKey)
      if (raw) {
        const parsed = JSON.parse(raw) as SectionId[]
        if (
          Array.isArray(parsed) &&
          parsed.length === SECTION_IDS.length &&
          SECTION_IDS.every((s) => parsed.includes(s))
        ) {
          return parsed
        }
      }
    } catch {
      // sin almacenamiento
    }
    return DEFAULT_SECTION_ORDER
  })
  const [dragSection, setDragSection] = useState<SectionId | null>(null)
  const [dragOverSection, setDragOverSection] = useState<SectionId | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(SECTIONS_KEY_PREFIX + userKey, JSON.stringify(order))
    } catch {
      // sin almacenamiento
    }
  }, [order, userKey])

  const moveSection = (id: SectionId, dir: -1 | 1) => {
    setOrder((prev) => {
      const i = prev.indexOf(id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  const dropOnSection = (target: SectionId) => {
    const from = dragSection
    setDragSection(null)
    setDragOverSection(null)
    if (!from || from === target) return
    setOrder((prev) => {
      const next = [...prev]
      const fi = next.indexOf(from)
      const ti = next.indexOf(target)
      if (fi < 0 || ti < 0) return prev
      next.splice(fi, 1)
      next.splice(ti, 0, from)
      return next
    })
  }

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await apiFetch<DayDashboard>(`/dashboard/day?period=${period}`)
      setData(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el dashboard')
    }
  }, [period])

  const loadBirthdays = useCallback(async () => {
    try {
      setBirthdays(await apiFetch<BirthdayData>('/birthdays/today'))
    } catch {
      // sin datos
    }
  }, [])

  useEffect(() => {
    loadBirthdays()
  }, [loadBirthdays])

  const celebrateBirthday = async (pet: BirthdayPet) => {
    const channels: string[] = []
    if (birthdays?.settings.send_email) channels.push('email')
    if (birthdays?.settings.send_whatsapp) channels.push('whatsapp')
    if (channels.length === 0) {
      toast({
        title: 'Sin canales configurados',
        description: 'Configura el correo o WhatsApp en Configuración de la clínica.',
        variant: 'warning',
      })
      return
    }
    setBirthdayBusy(pet.pet_id)
    try {
      const res = await apiFetch<{ sent: string[]; already_sent: boolean; message?: string | null }>(
        `/birthdays/${pet.pet_id}/celebrate`,
        {
          method: 'POST',
          body: JSON.stringify({ channels }),
        },
      )
      if (res.already_sent) {
        toast({
          title: 'Ya se felicitó',
          description: `${pet.pet_name} ya recibió su felicitación hoy.`,
          variant: 'info',
        })
      } else {
        toast({
          title: 'Felicitación enviada',
          description: `Se envió a ${pet.pet_name} por ${res.sent.join(' y ')}.`,
          variant: 'success',
        })
      }
      loadBirthdays()
    } catch (err) {
      toast({
        title: 'No se pudo enviar',
        description: err instanceof Error ? err.message : 'Ocurrió un error',
        variant: 'error',
      })
    } finally {
      setBirthdayBusy(null)
    }
  }

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (active.length === 0) {
      setDashData({})
      return
    }
    let cancelled = false
    setDashData({})
    apiFetch<Record<string, unknown>>(`/dashboards/data?slugs=${active.join(',')}&period=${period}`)
      .then((res) => {
        if (!cancelled) setDashData(res)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [active, period])

  const moduleItems = NAV_ROUTES.filter(
    (r) =>
      r.component !== 'dashboard' && !pinned.includes(r.component) && hasComponent(r.component),
  ).sort((a, b) => {
    const ai = MODULE_CARD_ORDER.indexOf(a.component)
    const bi = MODULE_CARD_ORDER.indexOf(b.component)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })

  const handleModulesDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setModulesDragOver(false)
    const component = e.dataTransfer.getData('text/plain')
    if (component) unpin(component)
  }

  const availableDashboards = DASHBOARD_CATALOG.filter((d) => !active.includes(d.slug))

  const handleGridDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setGridDragOver(false)
    const slug = e.dataTransfer.getData('text/plain')
    if (slug && getDashboard(slug)) add(slug)
  }

  const handleTrayButtonDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setTrayBtnDragOver(false)
    const slug = e.dataTransfer.getData('text/plain')
    if (slug && getDashboard(slug)) remove(slug)
  }

  return (
    <AppLayout>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Inicio</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `Resumen del día · ${data.period_label}` : 'Resumen operativo de la clínica'}
            {' — arrastra las secciones o usa las flechas para ordenarlas a tu gusto'}
          </p>
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-2 sm:flex-row">
        <Button asChild variant="success" size="xl" className="w-full sm:w-auto">
          <Link to="/consultas/nueva">
            <ClipboardPlus className="size-5" aria-hidden="true" />
            Nueva consulta
          </Link>
        </Button>
        <Button asChild variant="soft" size="xl" className="w-full sm:w-auto">
          <Link to="/ventas/nueva">
            <ShoppingBag className="size-5" aria-hidden="true" />
            Nueva venta
          </Link>
        </Button>
      </div>

      {error && <ErrorState description={error} onRetry={load} className="mb-6" />}
      {!data && !error && <LoadingState label="Cargando dashboard…" />}

      <div className="space-y-8">
        {order.map((id, idx) => {
          const isFirst = idx === 0
          const isLast = idx === order.length - 1
          const frame = (label: string, children: React.ReactNode) => (
            <SectionFrame
              key={id}
              label={label}
              isFirst={isFirst}
              isLast={isLast}
              onMove={(dir) => moveSection(id, dir)}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', id)
                e.dataTransfer.effectAllowed = 'move'
                setDragSection(id)
              }}
              onDragEnd={() => {
                setDragSection(null)
                setDragOverSection(null)
              }}
              onDragOver={(e) => {
                if (dragSection && dragSection !== id) {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setDragOverSection(id)
                }
              }}
              onDrop={(e) => {
                e.preventDefault()
                dropOnSection(id)
              }}
              highlighted={Boolean(dragSection && dragSection !== id && dragOverSection === id)}
            >
              {children}
            </SectionFrame>
          )

          switch (id) {
            case 'resumen':
              return (
                data &&
                frame(
                  SECTION_LABELS.resumen,
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    <KpiCard
                      label="Mascotas atendidas"
                      value={data.mascotas_atendidas}
                      icon={PawPrint}
                      hint={periodHint}
                    />
                    <KpiCard
                      label="En lista de espera"
                      value={data.waitlist_count}
                      icon={Timer}
                      hint="esperando hueco"
                    />
                    <KpiCard
                      label="Vacunas por aplicar"
                      value={data.vacunas_hoy}
                      icon={Syringe}
                      hint={period === 'day' ? 'para hoy' : 'del período'}
                    />
                    <KpiCard
                      label="Órdenes pendientes"
                      value={data.pending_purchase_orders}
                      icon={ShoppingCart}
                      hint="por recibir"
                    />
                    <KpiCard
                      label="Mascotas nuevas"
                      value={data.nuevas_mascotas}
                      icon={Sparkles}
                      hint="últimos 7 días"
                    />
                  </div>,
                )
              )
            case 'hoy':
              return (
                data &&
                frame(
                  SECTION_LABELS.hoy,
                  <div className="grid gap-4 lg:grid-cols-3">
                    <Card className="shadow-card lg:col-span-2">
                      <CardHeader>
                        <CardTitle className="font-display">
                          {period === 'day'
                            ? 'Flujo de pacientes por hora'
                            : 'Flujo de pacientes por período'}
                        </CardTitle>
                        <CardDescription>
                          {period === 'day'
                            ? 'Consultas atendidas por hora hoy'
                            : period === 'week'
                              ? 'Consultas atendidas en los últimos 7 días'
                              : 'Consultas atendidas en los últimos 30 días'}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="h-64">
                        <FlujoBarChart data={data.consultas_series} />
                      </CardContent>
                    </Card>

                    <Card className="shadow-card">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 font-display">
                          <Cake className="size-4 text-pink-500" aria-hidden="true" /> Cumpleaños del
                          día
                        </CardTitle>
                        <CardDescription>Mascotas que cumplen años hoy</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {!birthdays ? (
                          <LoadingState label="Cargando…" />
                        ) : birthdays.pets.length === 0 ? (
                          <div className="flex items-center gap-2 rounded-lg bg-secondary/60 px-3 py-2 text-sm text-muted-foreground">
                            <Cake className="size-4 shrink-0" aria-hidden="true" />
                            Sin cumpleaños hoy
                          </div>
                        ) : (
                          <>
                            {birthdays.pets.map((p) => (
                              <div
                                key={p.pet_id}
                                className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
                              >
                                <div className="flex min-w-0 items-center gap-2">
                                  <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary">
                                    {p.pet_photo ? (
                                      <img
                                        src={p.pet_photo}
                                        alt={p.pet_name}
                                        className="size-full object-cover"
                                      />
                                    ) : (
                                      <Cake className="size-4 text-pink-500" aria-hidden="true" />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">
                                      {p.pet_name}
                                      {p.age != null && (
                                        <span className="text-muted-foreground">
                                          {' '}
                                          · {p.age} años
                                        </span>
                                      )}
                                    </p>
                                    {p.owner_name && (
                                      <p className="truncate text-xs text-muted-foreground">
                                        Dueño: {p.owner_name}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                {p.already_sent ? (
                                  <Badge variant="soft-success">Felicitado</Badge>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="soft"
                                    onClick={() => celebrateBirthday(p)}
                                    disabled={birthdayBusy === p.pet_id}
                                  >
                                    {birthdayBusy === p.pet_id ? (
                                      <Loader2 className="animate-spin" />
                                    ) : (
                                      <PartyPopper className="size-3.5" />
                                    )}
                                    Felicitar
                                  </Button>
                                )}
                              </div>
                            ))}
                            {!birthdays.settings.send_email && !birthdays.settings.send_whatsapp && (
                              <p className="text-xs text-muted-foreground">
                                Configura el mensaje y los canales (correo/WhatsApp) en
                                Configuración de la clínica.
                              </p>
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </div>,
                )
              )
            case 'citas':
              return (
                data &&
                frame(
                  SECTION_LABELS.citas,
                  <Card className="shadow-card">
                    <CardHeader className="flex-row items-center justify-between space-y-0">
                      <div>
                        <CardTitle className="font-display">Citas del período</CardTitle>
                        <CardDescription>Próximas citas agendadas en el rango</CardDescription>
                      </div>
                      <Link
                        to="/agenda"
                        className="text-sm font-medium text-primary hover:text-primary-hover"
                      >
                        Ver agenda
                      </Link>
                    </CardHeader>
                    <CardContent>
                      {data.citas.length === 0 ? (
                        <EmptyState
                          title="Sin citas en el período"
                          description="Aún no hay citas agendadas en este rango."
                        />
                      ) : (
                        <div className="divide-y divide-border">
                          {data.citas.map((c) => {
                            const st = STATUS_LABELS[c.status] ?? {
                              label: c.status,
                              variant: 'secondary',
                            }
                            return (
                              <div key={c.id} className="flex items-center justify-between py-3">
                                <div className="flex items-center gap-3">
                                  <div className="flex size-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                                    <PawPrint className="size-4" aria-hidden="true" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">
                                      {c.pet_name ?? c.id.slice(0, 8)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {c.procedure_type}
                                      {c.vet_name ? ` · ${c.vet_name}` : ''}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-sm text-muted-foreground">
                                    {new Date(c.start_time).toLocaleString('es-MX', {
                                      day: period === 'day' ? undefined : 'numeric',
                                      month: period === 'day' ? undefined : 'short',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                  <Badge variant={st.variant}>{st.label}</Badge>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>,
                )
              )
            case 'modulos':
              return frame(
                SECTION_LABELS.modulos,
                <>
                  <div
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      setModulesDragOver(true)
                    }}
                    onDragLeave={() => setModulesDragOver(false)}
                    onDrop={handleModulesDrop}
                    className={cn(
                      'grid grid-cols-2 gap-4 rounded-xl sm:grid-cols-3 lg:grid-cols-4',
                      modulesDragOver && 'outline-2 outline-dashed outline-primary/40',
                    )}
                  >
                    {moduleItems.map((m) => {
                      const meta = MODULE_META[m.component]
                      return (
                        <Link
                          key={m.to}
                          to={m.to}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', m.component)
                            e.dataTransfer.effectAllowed = 'move'
                          }}
                          title="Arrastra a la barra lateral para fijarlo"
                          className={cn(
                            'group flex cursor-grab flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-card transition-transform duration-200 hover:-translate-y-0.5 active:cursor-grabbing',
                            meta.tint ?? 'bg-card',
                            meta.glow ?? 'hover:shadow-elevated',
                          )}
                        >
                          <div className="relative aspect-[4/3] w-full overflow-hidden bg-secondary/40">
                            {meta.img ? (
                              <>
                                <img
                                  src={meta.img}
                                  alt={m.label}
                                  loading="lazy"
                                  decoding="async"
                                  className={cn(
                                    'absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105',
                                    meta.imgGif && 'group-hover:hidden',
                                  )}
                                />
                                {meta.imgGif && (
                                  <img
                                    src={meta.imgGif}
                                    alt=""
                                    aria-hidden="true"
                                    decoding="async"
                                    className="absolute inset-0 hidden size-full object-cover group-hover:block"
                                  />
                                )}
                              </>
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div
                                  className={cn(
                                    'flex size-17 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105',
                                    meta.iconBg,
                                  )}
                                >
                                  <meta.icon
                                    className={cn('size-8', meta.text)}
                                    aria-hidden="true"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 border-t border-border/60 px-3 py-2.5">
                            <meta.icon
                              className={cn('size-4 shrink-0', meta.text)}
                              aria-hidden="true"
                            />
                            <p className="truncate text-sm font-semibold">{m.label}</p>
                          </div>
                        </Link>
                      )
                    })}
                    {moduleItems.length === 0 && (
                      <p className="col-span-full text-sm text-muted-foreground">
                        Todos los módulos están en la barra lateral. Arrastra uno aquí para
                        quitarlo.
                      </p>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Arrastra un módulo al sidebar para fijarlo, o desde el sidebar a aquí para
                    quitarlo.
                  </p>
                </>,
              )
            case 'dashboards':
              return frame(
                SECTION_LABELS.dashboards,
                <>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <div className="flex rounded-full border border-border bg-card p-0.5">
                      {PERIODS.map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setPeriod(p.value)}
                          className={cn(
                            'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                            period === p.value
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                          )}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTrayOpen((o) => !o)}
                      onDragOver={(e) => {
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                        setTrayBtnDragOver(true)
                      }}
                      onDragLeave={() => setTrayBtnDragOver(false)}
                      onDrop={handleTrayButtonDrop}
                      className={cn(trayBtnDragOver && 'border-primary/40 bg-primary/10')}
                    >
                      <PanelTop className="size-4" aria-hidden="true" />
                      Bandeja de dashboards
                    </Button>
                  </div>

                  <DashboardTray
                    open={trayOpen}
                    available={availableDashboards}
                    onClose={() => setTrayOpen(false)}
                  />

                  <div
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      setGridDragOver(true)
                    }}
                    onDragLeave={() => setGridDragOver(false)}
                    onDrop={handleGridDrop}
                    className={cn(
                      'grid gap-4 rounded-xl sm:grid-cols-2 xl:grid-cols-3',
                      gridDragOver && 'outline-2 outline-dashed outline-primary/40',
                      active.length === 0 &&
                        'border border-dashed border-border/60 bg-card/40 p-10',
                    )}
                  >
                    {active.length === 0 ? (
                      <p className="col-span-full text-center text-sm text-muted-foreground">
                        Arrastra aquí un dashboard de la bandeja para dibujarlo.
                      </p>
                    ) : (
                      active.map((slug) => {
                        const def = getDashboard(slug)
                        if (!def) return null
                        return (
                          <Card
                            key={slug}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', slug)
                              e.dataTransfer.effectAllowed = 'move'
                            }}
                            title="Arrastra a la bandeja para quitarlo"
                            className="group relative cursor-grab gap-3 active:cursor-grabbing"
                          >
                            <CardHeader className="flex-row items-start justify-between gap-2 space-y-0 pb-0">
                              <CardTitle className="font-display text-base">{def.title}</CardTitle>
                              <button
                                type="button"
                                onClick={() => remove(slug)}
                                aria-label={`Quitar ${def.title}`}
                                className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                              >
                                <X className="size-4" />
                              </button>
                            </CardHeader>
                            <CardContent className="h-60">
                              {dashData[slug] ? (
                                <DashboardChart slug={slug} data={dashData[slug]} />
                              ) : (
                                <LoadingState label="Cargando…" />
                              )}
                            </CardContent>
                          </Card>
                        )
                      })
                    )}
                  </div>
                </>,
              )
            default:
              return null
          }
        })}
      </div>

      <Separator className="mt-8" />
      <p className="mt-4 text-xs text-muted-foreground">
        El módulo Finanzas (ingresos y gastos) es exclusivo del admin.
      </p>
    </AppLayout>
  )
}
