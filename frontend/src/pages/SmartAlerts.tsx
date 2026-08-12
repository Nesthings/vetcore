import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCheck, EyeOff, PawPrint, RefreshCw } from 'lucide-react'

import { AppLayout } from '@/components/layout/AppLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { LoadingState } from '@/components/ui/loading-state'
import { useToast } from '@/components/ui/toast'
import { apiFetch } from '@/lib/api'
import { EMPTY_ALERTS, SEVERITY_META, relativeTime } from '@/lib/smart-alerts'
import type { SmartAlertItem, SmartAlertsData } from '@/lib/smart-alerts'
import { cn } from '@/lib/utils'

const SEV_ORDER = ['critical', 'warning', 'info', 'success'] as const

export function SmartAlerts() {
  const { toast } = useToast()
  const [data, setData] = useState<SmartAlertsData>(EMPTY_ALERTS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await apiFetch<SmartAlertsData>('/alerts'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los avisos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const act = async (id: string, action: 'resolve' | 'dismiss') => {
    setBusyId(id)
    try {
      await apiFetch(`/alerts/${id}/${action}`, { method: 'POST' })
      toast({
        title: action === 'resolve' ? 'Aviso resuelto' : 'Aviso descartado',
        variant: 'success',
      })
      await load()
    } catch (err) {
      toast({
        title: 'No se pudo actualizar el aviso',
        description: err instanceof Error ? err.message : 'Intenta de nuevo.',
        variant: 'error',
      })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alertas inteligentes</h1>
          <p className="text-sm text-muted-foreground">
            Pacientes que requieren atención según las reglas configuradas
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} /> Actualizar
        </Button>
      </div>

      {error && <ErrorState description={error} onRetry={load} className="mb-6" />}
      {loading && <LoadingState label="Evaluando reglas…" />}

      {!loading && !error && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {SEV_ORDER.map((sev) => {
              const meta = SEVERITY_META[sev]
              const count = data.summary?.[sev] ?? 0
              return (
                <Badge key={sev} variant={meta.badge} className="gap-1.5 px-3 py-1.5">
                  <meta.icon className="size-4" aria-hidden="true" />
                  {count} {meta.label.toLowerCase()}
                </Badge>
              )
            })}
            <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
              {data.summary?.total ?? 0} avisos activos
            </Badge>
          </div>

          {data.items.length === 0 ? (
            <EmptyState
              title="Sin avisos"
              description="No hay pacientes que requieran atención en este momento."
              icon={PawPrint}
            />
          ) : (
            <div className="space-y-2">
              {data.items.map((a: SmartAlertItem) => {
                const meta = SEVERITY_META[a.severity] ?? SEVERITY_META.info
                return (
                  <div
                    key={a.id}
                    className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className={cn('mt-0.5 shrink-0', meta.text)}>
                        <meta.icon className="size-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <p className="text-sm font-semibold">{a.title}</p>
                          <Badge variant={meta.badge}>{meta.label}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {relativeTime(a.triggered_at)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground">{a.description}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link to={a.link}>Ver paciente</Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === a.id}
                        onClick={() => act(a.id, 'resolve')}
                      >
                        <CheckCheck /> Resolver
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === a.id}
                        onClick={() => act(a.id, 'dismiss')}
                      >
                        <EyeOff /> Descartar
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </AppLayout>
  )
}
