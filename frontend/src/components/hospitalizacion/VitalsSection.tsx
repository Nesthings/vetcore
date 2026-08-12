import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, Loader2, Save } from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { apiFetch } from '@/lib/api'
import {
  CHARTABLE_VITALS,
  MONITORING_VITAL_PARAMS,
  VITAL_PARAM_LABELS,
  VITAL_PARAM_UNITS,
} from '@/lib/hospitalization'
import type { HospVital, MonitoringLevel } from '@/lib/hospitalization'

export function VitalsSection({
  hospitalizationId,
  monitoringLevel,
}: {
  hospitalizationId: string
  monitoringLevel: MonitoringLevel | null
}) {
  const [vitals, setVitals] = useState<HospVital[]>([])
  const [loading, setLoading] = useState(true)
  const [chartParam, setChartParam] = useState('temperature')

  const params = monitoringLevel ? MONITORING_VITAL_PARAMS[monitoringLevel] : MONITORING_VITAL_PARAMS.basic

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setVitals(await apiFetch<HospVital[]>(`/hospitalization/${hospitalizationId}/vitals?limit=200`))
    } catch {
      setVitals([])
    } finally {
      setLoading(false)
    }
  }, [hospitalizationId])

  useEffect(() => {
    load()
  }, [load])

  const latest = useMemo(() => {
    const map: Record<string, HospVital> = {}
    for (const v of vitals) {
      if (!map[v.parameter] || new Date(v.observed_at) > new Date(map[v.parameter].observed_at)) {
        map[v.parameter] = v
      }
    }
    return map
  }, [vitals])

  const chartData = useMemo(() => {
    return vitals
      .filter((v) => v.parameter === chartParam && v.value != null)
      .slice()
      .reverse()
      .map((v) => ({
        fecha: new Date(v.observed_at).toLocaleString('es-MX', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }),
        valor: v.value,
      }))
  }, [vitals, chartParam])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Activity className="size-4 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-semibold">Signos vitales</h3>
        {params.map((p) => (
          <Badge key={p} variant="secondary">
            {VITAL_PARAM_LABELS[p] ?? p}
            {latest[p]?.value != null && (
              <span className="ml-1 font-semibold">
                {latest[p].value} {latest[p].unit ?? VITAL_PARAM_UNITS[p] ?? ''}
              </span>
            )}
          </Badge>
        ))}
      </div>

      <QuickCapture
        hospitalizationId={hospitalizationId}
        params={params}
        onSaved={load}
      />

      {chartData.length > 1 && (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">
              Evolución · {VITAL_PARAM_LABELS[chartParam] ?? chartParam}
            </p>
            <select
              value={chartParam}
              onChange={(e) => setChartParam(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              {CHARTABLE_VITALS.map((p) => (
                <option key={p} value={p}>
                  {VITAL_PARAM_LABELS[p] ?? p}
                </option>
              ))}
            </select>
          </div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} domain={['auto', 'auto']} />
                <Tooltip />
                <Line type="monotone" dataKey="valor" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {!loading && vitals.length === 0 && (
        <EmptyState
          title="Sin signos vitales"
          description="Registra la primera medición para ver la evolución."
          icon={Activity}
        />
      )}
    </div>
  )
}

function QuickCapture({
  hospitalizationId,
  params,
  onSaved,
}: {
  hospitalizationId: string
  params: string[]
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const measurements = params
      .filter((p) => values[p] !== '' && values[p] != null)
      .map((p) => ({
        parameter: p,
        value: Number(values[p]),
        unit: VITAL_PARAM_UNITS[p] ?? null,
      }))
    if (measurements.length === 0) {
      toast({ title: 'Captura valores', description: 'Ingresa al menos una medición.', variant: 'warning' })
      return
    }
    setBusy(true)
    try {
      await apiFetch(`/hospitalization/${hospitalizationId}/vitals/batch`, {
        method: 'POST',
        body: JSON.stringify({ measurements }),
      })
      toast({ title: 'Signos vitales registrados', variant: 'success' })
      setValues({})
      onSaved()
    } catch (err) {
      toast({
        title: 'No se pudieron guardar',
        description: err instanceof Error ? err.message : 'Intenta de nuevo.',
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Captura rápida
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {params.map((p) => (
          <div key={p} className="space-y-1">
            <Label className="text-xs">{VITAL_PARAM_LABELS[p] ?? p}</Label>
            <div className="relative">
              <input
                type="number"
                step="any"
                min="0"
                value={values[p] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [p]: e.target.value }))}
                placeholder="—"
                className="h-9 w-full rounded-md border border-input bg-background pl-3 pr-10 text-sm"
              />
              {VITAL_PARAM_UNITS[p] && (
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {VITAL_PARAM_UNITS[p]}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <Button size="sm" className="mt-3" onClick={submit} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Save />} Guardar signos
      </Button>
    </div>
  )
}
