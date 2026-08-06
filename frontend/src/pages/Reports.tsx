import { useCallback, useState } from 'react'
import { CalendarCheck2, ClipboardList, PawPrint } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { AppLayout } from '@/components/layout/AppLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorState } from '@/components/ui/error-state'
import { LoadingState } from '@/components/ui/loading-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'

interface OperationalReport {
  from: string
  to: string
  citas_total: number
  citas_por_estado: Record<string, number>
  consultas_total: number
  consultas_por_veterinario: { vet: string; count: number }[]
  pacientes_atendidos: number
  top_productos: { name: string; count: number }[]
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendadas',
  confirmed: 'Confirmadas',
  completed: 'Completadas',
  cancelled: 'Canceladas',
  no_show: 'No asistió',
}

function toInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function KpiCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number | string
  icon: React.ElementType
}) {
  return (
    <Card className="shadow-card">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription>{label}</CardDescription>
        <Icon className="size-4 text-primary" aria-hidden="true" />
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  )
}

export function Reports() {
  const { user } = useAuth()
  const [from, setFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return toInputValue(d)
  })
  const [to, setTo] = useState(() => toInputValue(new Date()))
  const [data, setData] = useState<OperationalReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        from: `${from}T00:00:00Z`,
        to: `${to}T23:59:59Z`,
      })
      const res = await apiFetch<OperationalReport>(`/reports/operational?${params}`)
      setData(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el reporte')
    } finally {
      setLoading(false)
    }
  }, [from, to])

  const estadoData = data
    ? Object.entries(data.citas_por_estado).map(([k, v]) => ({
        name: STATUS_LABELS[k] ?? k,
        count: v,
      }))
    : []
  const vetData = data
    ? data.consultas_por_veterinario.map((v) => ({ name: v.vet, count: v.count }))
    : []

  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reportes operativos</h1>
          <p className="text-sm text-muted-foreground">
            Indicadores de la clínica (sin cifras de dinero)
          </p>
        </div>
        {user?.role === 'admin' && (
          <a
            href="/reports/financial"
            className="text-sm font-medium text-primary hover:text-primary-hover"
          >
            Ir al dashboard financiero →
          </a>
        )}
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>Desde</Label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-44"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Hasta</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
        </div>
        <Button onClick={load} disabled={loading}>
          Generar reporte
        </Button>
      </div>

      {error && <ErrorState description={error} onRetry={load} className="mb-6" />}
      {loading && <LoadingState label="Generando reporte…" />}

      {data && !loading && !error && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard label="Citas en el rango" value={data.citas_total} icon={CalendarCheck2} />
            <KpiCard label="Consultas" value={data.consultas_total} icon={ClipboardList} />
            <KpiCard label="Pacientes atendidos" value={data.pacientes_atendidos} icon={PawPrint} />
            <KpiCard
              label="Cancelaciones/No-show"
              value={(data.citas_por_estado.cancelled ?? 0) + (data.citas_por_estado.no_show ?? 0)}
              icon={CalendarCheck2}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Citas por estado</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={estadoData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="name"
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
                    <Tooltip cursor={{ fill: 'var(--muted)' }} />
                    <Bar
                      dataKey="count"
                      fill="var(--chart-1)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={36}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Consultas por veterinario</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                {vetData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin consultas en el rango.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={vetData}
                      margin={{ top: 4, right: 8, left: -24, bottom: 0 }}
                      layout="vertical"
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border)"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                        tickLine={false}
                        axisLine={false}
                        width={130}
                      />
                      <Tooltip cursor={{ fill: 'var(--muted)' }} />
                      <Bar
                        dataKey="count"
                        fill="var(--chart-2)"
                        radius={[0, 4, 4, 0]}
                        maxBarSize={24}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Top productos en consultas</CardTitle>
              <CardDescription>Productos más usados en el rango</CardDescription>
            </CardHeader>
            <CardContent>
              {data.top_productos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin productos registrados en consultas.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.top_productos.map((p) => (
                    <Badge key={p.name} variant="outline">
                      {p.name} · {p.count}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </AppLayout>
  )
}
