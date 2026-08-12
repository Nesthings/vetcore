import { useCallback, useEffect, useState } from 'react'
import { Wallet } from 'lucide-react'

import { EmptyState } from '@/components/ui/empty-state'
import { apiFetch } from '@/lib/api'
import type { HospCosts } from '@/lib/hospitalization'

const CATEGORY_LABELS: Record<string, string> = {
  hospitalizacion: 'Hospitalización',
  servicios: 'Servicios',
  productos: 'Productos',
  otros: 'Otros',
}

export function CostsSection({ hospitalizationId }: { hospitalizationId: string }) {
  const [costs, setCosts] = useState<HospCosts | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setCosts(await apiFetch<HospCosts>(`/hospitalization/${hospitalizationId}/costs`))
    } catch {
      setCosts(null)
    } finally {
      setLoading(false)
    }
  }, [hospitalizationId])

  useEffect(() => {
    load()
  }, [load])

  const money = (n: number) =>
    n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 })

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Wallet className="size-4 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-semibold">Costos acumulados</h3>
      </div>

      {loading ? (
        <p className="py-3 text-sm text-muted-foreground">Calculando…</p>
      ) : !costs ? (
        <EmptyState title="Sin costos" description="No se pudieron calcular los costos." icon={Wallet} />
      ) : (
        <div className="space-y-2">
          {costs.stay && (
            <div className="rounded-lg border border-border bg-card p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  Estancia · {costs.stay.days} día{costs.stay.days > 1 ? 's' : ''} × {money(costs.stay.price_per_day)}
                </span>
                <span className="font-medium">{money(costs.stay.total)}</span>
              </div>
            </div>
          )}
          {Object.entries(costs.breakdown ?? {})
            .filter(([, v]) => v > 0)
            .map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
                <span>{CATEGORY_LABELS[k] ?? k}</span>
                <span>{money(v)}</span>
              </div>
            ))}
          <div className="flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2 text-sm font-semibold text-primary">
            <span>Total</span>
            <span>{money(costs.total ?? 0)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
