import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarCheck2,
  CalendarClock,
  CalendarX2,
  ClipboardPlus,
  PackageMinus,
  PawPrint,
  ShoppingBag,
  TriangleAlert,
} from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { AppLayout } from '@/components/layout/AppLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { LoadingState } from '@/components/ui/loading-state'
import { Separator } from '@/components/ui/separator'
import { apiFetch } from '@/lib/api'

interface DayDashboard {
  date: string
  citas_total: number
  citas_por_estado: Record<string, number>
  citas_por_hora: { hora: number; count: number }[]
  citas_hoy: {
    id: string
    pet_name?: string
    vet_name?: string
    procedure_type: string
    start_time: string
    end_time: string
    status: string
  }[]
  bloques_hoy: number
  stock_alerts: { product_id: string; name: string; stock: number }[]
  pacientes_activos: number
}

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
    <Card className="bg-gradient-to-br from-primary/[0.06] via-transparent to-transparent">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription>{label}</CardDescription>
        <Icon className="size-4 text-primary" aria-hidden="true" />
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

export function Dashboard() {
  const [data, setData] = useState<DayDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await apiFetch<DayDashboard>('/dashboard/day')
      setData(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el dashboard')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <AppLayout>
      <div className="mb-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <Button
            asChild
            variant="success"
            size="lg"
            className="h-12 w-full px-8 text-base sm:w-auto"
          >
            <Link to="/consultas/nueva">
              <ClipboardPlus className="size-6" aria-hidden="true" />
              Nueva consulta
            </Link>
          </Button>
          <Button asChild size="lg" className="h-12 w-full px-8 text-base sm:w-auto">
            <Link to="/ventas/nueva">
              <ShoppingBag className="size-6" aria-hidden="true" />
              Nueva venta
            </Link>
          </Button>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard del día</h1>
        <p className="text-sm text-muted-foreground">
          {data ? `Resumen operativo del ${data.date}` : 'Resumen operativo de hoy'}
        </p>
      </div>

      {error && <ErrorState description={error} onRetry={load} className="mb-6" />}

      {!data && !error && <LoadingState label="Cargando dashboard…" />}

      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <KpiCard
              label="Citas de hoy"
              value={data.citas_total}
              icon={CalendarCheck2}
              hint={`${data.citas_por_estado.confirmed} confirmadas`}
            />
            <KpiCard
              label="Pendientes"
              value={data.citas_por_estado.scheduled}
              icon={CalendarClock}
              hint="por confirmar"
            />
            <KpiCard
              label="Completadas"
              value={data.citas_por_estado.completed}
              icon={CalendarCheck2}
            />
            <KpiCard
              label="Bloques de horario"
              value={data.bloques_hoy}
              icon={CalendarX2}
              hint="horario bloqueado"
            />
            <KpiCard label="Pacientes activos" value={data.pacientes_activos} icon={PawPrint} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="shadow-card lg:col-span-2">
              <CardHeader>
                <CardTitle>Citas por hora</CardTitle>
                <CardDescription>Distribución de citas del día</CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.citas_por_hora}
                    margin={{ top: 4, right: 8, left: -24, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="hora"
                      tickFormatter={(h: number) => `${h}:00`}
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
                    <Tooltip
                      cursor={{ fill: 'var(--muted)' }}
                      formatter={(v) => [`${v} citas`, 'Citas']}
                      labelFormatter={(h) => `${h}:00 hrs`}
                    />
                    <Bar
                      dataKey="count"
                      fill="var(--chart-1)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Alertas de stock</CardTitle>
                <CardDescription>Productos bajo el umbral mínimo</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.stock_alerts.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
                    <PackageMinus className="size-4" aria-hidden="true" />
                    Sin alertas de stock
                  </div>
                ) : (
                  data.stock_alerts.map((p) => (
                    <div
                      key={p.product_id}
                      className="flex items-center justify-between rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <TriangleAlert className="size-4 text-warning" aria-hidden="true" />
                        <span className="font-medium">{p.name}</span>
                      </div>
                      <Badge variant="warning">{p.stock} en stock</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-card">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Citas del día</CardTitle>
                <CardDescription>Próximas citas agendadas</CardDescription>
              </div>
              <Link
                to="/agenda"
                className="text-sm font-medium text-primary hover:text-primary-hover"
              >
                Ver agenda
              </Link>
            </CardHeader>
            <CardContent>
              {data.citas_hoy.length === 0 ? (
                <EmptyState
                  title="Sin citas hoy"
                  description="Aún no hay citas agendadas para este día."
                />
              ) : (
                <div className="divide-y divide-border">
                  {data.citas_hoy.map((c) => {
                    const st = STATUS_LABELS[c.status] ?? { label: c.status, variant: 'secondary' }
                    return (
                      <div key={c.id} className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex size-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                            <PawPrint className="size-4" aria-hidden="true" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{c.pet_name ?? c.id.slice(0, 8)}</p>
                            <p className="text-xs text-muted-foreground">
                              {c.procedure_type}
                              {c.vet_name ? ` · ${c.vet_name}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-muted-foreground">
                            {new Date(c.start_time).toLocaleTimeString('es-MX', {
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
          </Card>

          <Separator />
          <p className="text-xs text-muted-foreground">
            El módulo Financiero (ingresos y gastos) es exclusivo del admin.
          </p>
        </div>
      )}
    </AppLayout>
  )
}
