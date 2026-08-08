import { useCallback, useEffect, useState } from 'react'
import { DollarSign, Package, Receipt, Stethoscope, TrendingUp } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { AppLayout } from '@/components/layout/AppLayout'
import { ExpenseDialog } from '@/components/financial/ExpenseDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorState } from '@/components/ui/error-state'
import { LoadingState } from '@/components/ui/loading-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiFetch } from '@/lib/api'

interface Movement {
  id: string
  tipo: 'ingreso' | 'egreso'
  categoria?: string
  monto: number
  fecha: string
  origen: string
  concepto: string
  detalle: string
  sucursal: string
  status: string | null
}

interface FinancialReport {
  from: string
  to: string
  ingresos_total: number
  ingresos_servicios_total: number
  ingresos_productos_total: number
  ingresos_por_dia: { date: string; total: number }[]
  facturas_por_estado: Record<string, number>
  pendientes_por_cobrar: number
  ticket_promedio: number
  top_servicios: { name: string; total: number }[]
  top_productos: { name: string; total: number }[]
  ingresos_productos: Movement[]
  ingresos_servicios: Movement[]
  egresos: Movement[]
}

function toInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function fmt(n: number) {
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function TopBarChart({
  title,
  data,
  color,
}: {
  title: string
  data: { name: string; total: number }[]
  color: string
}) {
  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin ingresos en el rango.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip formatter={(v) => [fmt(Number(v)), 'Ingresos']} />
              <Bar dataKey="total" fill={color} radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

function MovementTable({
  title,
  description,
  rows,
  badgeLabel,
  badgeVariant,
  moneyClass,
  action,
}: {
  title: string
  description?: string
  rows: Movement[]
  badgeLabel: (m: Movement) => string
  badgeVariant: 'info' | 'success' | 'destructive'
  moneyClass: string
  action?: React.ReactNode
}) {
  return (
    <Card className="shadow-card">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin movimientos en el rango seleccionado.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha y hora</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Concepto / origen</TableHead>
                  <TableHead>Sucursal</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((m) => (
                  <TableRow key={`${m.tipo}-${m.id}`}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(m.fecha).toLocaleString('es-MX', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={badgeVariant}>{badgeLabel(m)}</Badge>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{m.concepto}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.origen}
                        {m.detalle !== '—' ? ` · ${m.detalle}` : ''}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.sucursal}</TableCell>
                    <TableCell className={`text-right font-semibold ${moneyClass}`}>
                      {m.tipo === 'ingreso' ? '+' : '-'}${m.monto.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function FinancialDashboard() {
  const [from, setFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return toInputValue(d)
  })
  const [to, setTo] = useState(() => toInputValue(new Date()))
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year' | 'custom'>('month')
  const [data, setData] = useState<FinancialReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expenseOpen, setExpenseOpen] = useState(false)

  const runReport = useCallback(async (fromStr: string, toStr: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        from: `${fromStr}T00:00:00Z`,
        to: `${toStr}T23:59:59Z`,
      })
      const res = await apiFetch<FinancialReport>(`/reports/financial?${params}`)
      setData(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (period === 'custom') return
    const today = new Date()
    const end = toInputValue(today)
    let start = end
    if (period === 'week') {
      const d = new Date()
      d.setDate(d.getDate() - 6)
      start = toInputValue(d)
    } else if (period === 'month') {
      const d = new Date()
      d.setDate(d.getDate() - 29)
      start = toInputValue(d)
    } else if (period === 'year') {
      const d = new Date()
      d.setDate(d.getDate() - 364)
      start = toInputValue(d)
    }
    setFrom(start)
    setTo(end)
    runReport(start, end)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  const ingresosServicios = data?.ingresos_servicios ?? []
  const ingresosProductos = data?.ingresos_productos ?? []
  const egresos = data?.egresos ?? []

  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard de finanzas</h1>
          <p className="text-sm text-muted-foreground">
            Exclusivo del admin · montos en moneda local
          </p>
        </div>
      </div>

      <div className="mb-6 space-y-3">
        <div className="inline-flex rounded-lg bg-muted p-1">
          {(['day', 'week', 'month', 'year'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                period === p
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {p === 'day' ? 'Día' : p === 'week' ? 'Semana' : p === 'month' ? 'Mes' : 'Año'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>Desde</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
                setPeriod('custom')
              }}
              className="w-44"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Hasta</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value)
                setPeriod('custom')
              }}
              className="w-44"
            />
          </div>
          <Button onClick={() => runReport(from, to)} disabled={loading}>
            Generar
          </Button>
        </div>
      </div>

      {error && (
        <ErrorState description={error} onRetry={() => runReport(from, to)} className="mb-6" />
      )}
      {loading && <LoadingState label="Generando dashboard…" />}

      {data && !loading && !error && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <Card className="shadow-card">
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardDescription>Ingresos</CardDescription>
                <DollarSign className="size-4 text-primary" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tracking-tight">{fmt(data.ingresos_total)}</p>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardDescription>Servicios</CardDescription>
                <Stethoscope className="size-4 text-primary" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tracking-tight">
                  {fmt(data.ingresos_servicios_total)}
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardDescription>Productos</CardDescription>
                <Package className="size-4 text-primary" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tracking-tight">
                  {fmt(data.ingresos_productos_total)}
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardDescription>Ticket promedio</CardDescription>
                <TrendingUp className="size-4 text-primary" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tracking-tight">{fmt(data.ticket_promedio)}</p>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardDescription>Facturas pagadas</CardDescription>
                <Receipt className="size-4 text-primary" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tracking-tight">
                  {data.facturas_por_estado.paid ?? 0}
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardDescription>Por cobrar</CardDescription>
                <DollarSign className="size-4 text-warning" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tracking-tight">
                  {fmt(data.pendientes_por_cobrar)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Ingresos por día</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              {data.ingresos_por_dia.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin ingresos en el rango.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={data.ingresos_por_dia}
                    margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip formatter={(v) => [fmt(Number(v)), 'Ingresos']} />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke="var(--chart-1)"
                      strokeWidth={2}
                      dot={{ r: 3, fill: 'var(--chart-1)' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <TopBarChart
              title="Top servicios por ingreso"
              data={data.top_servicios}
              color="var(--chart-2)"
            />
            <TopBarChart
              title="Top productos por ingreso"
              data={data.top_productos}
              color="var(--chart-3)"
            />
          </div>

          <div className="space-y-6">
            <MovementTable
              title="Ingresos por servicios"
              description="Facturas pagadas con líneas de servicio (consultas, procedimientos, etc.)"
              rows={ingresosServicios}
              badgeLabel={() => 'Servicio'}
              badgeVariant="info"
              moneyClass="text-success"
            />
            <MovementTable
              title="Ingresos por ventas de productos"
              description="Facturas pagadas con líneas de producto (insumos, medicamentos, etc.)"
              rows={ingresosProductos}
              badgeLabel={() => 'Producto'}
              badgeVariant="success"
              moneyClass="text-success"
            />
            <MovementTable
              title="Egresos (gastos)"
              description="Gastos registrados de la clínica"
              rows={egresos}
              badgeLabel={() => 'Egreso'}
              badgeVariant="destructive"
              moneyClass="text-destructive"
              action={
                <Button size="sm" onClick={() => setExpenseOpen(true)}>
                  Registrar gasto
                </Button>
              }
            />
          </div>
        </div>
      )}

      <ExpenseDialog
        open={expenseOpen}
        onOpenChange={setExpenseOpen}
        onSaved={() => {
          setExpenseOpen(false)
          runReport(from, to)
        }}
      />
    </AppLayout>
  )
}
