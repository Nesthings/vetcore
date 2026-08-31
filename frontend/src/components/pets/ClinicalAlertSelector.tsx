import { useEffect, useState } from 'react'
import { Loader2, Plus, TriangleAlert, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api'
import { ALERT_LIMIT, ALERT_STYLES, ALERT_TYPES } from '@/lib/clinical-alerts'
import { useToast } from '@/components/ui/toast'

export interface ClinicalAlertItem {
  id: string
  type: string
  description: string
}

export interface PendingAlert {
  type: string
  description: string
}

/**
 * Selector unificado de alertas clínicas (alergias, comportamiento, etc.).
 * - Con `petId` (mascota existente): lee/agrega/elimina contra la API del
 *   expediente (POST/DELETE /pets/{id}/alerts).
 * - Con `pending`/`onPendingChange` (mascota en creación): acumula la lista en
 *   el padre, que la persiste al guardar la mascota.
 */
export function ClinicalAlertSelector({
  petId,
  pending,
  onPendingChange,
}: {
  petId?: string | null
  pending?: PendingAlert[]
  onPendingChange?: (items: PendingAlert[]) => void
}) {
  const serverMode = Boolean(petId)
  const { toast } = useToast()
  const [type, setType] = useState(ALERT_TYPES[0])
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const [items, setItems] = useState<ClinicalAlertItem[]>([])
  const [loading, setLoading] = useState(serverMode)

  useEffect(() => {
    if (!serverMode) {
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    apiFetch<ClinicalAlertItem[]>(`/pets/${petId}/alerts`)
      .then((res) => {
        if (alive) setItems(res)
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [petId, serverMode])

  const visibleItems: ClinicalAlertItem[] = serverMode
    ? items
    : (pending ?? []).map((p, i) => ({ id: `pending-${i}`, type: p.type, description: p.description }))

  const add = async () => {
    const d = desc.trim()
    if (!d || visibleItems.length >= ALERT_LIMIT) return
    setBusy(true)
    try {
      if (serverMode) {
        const created = await apiFetch<ClinicalAlertItem>(`/pets/${petId}/alerts`, {
          method: 'POST',
          body: JSON.stringify({ type, description: d }),
        })
        setItems((prev) => [created, ...prev])
      } else if (onPendingChange) {
        onPendingChange([...(pending ?? []), { type, description: d }])
      }
      setDesc('')
    } catch (err) {
      toast({
        title: 'No se pudo agregar la alerta',
        description: err instanceof Error ? err.message : 'Intenta de nuevo.',
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string, index: number) => {
    try {
      if (serverMode) {
        await apiFetch(`/pets/${petId}/alerts/${id}`, { method: 'DELETE' })
        setItems((prev) => prev.filter((a) => a.id !== id))
      } else if (onPendingChange) {
        const next = (pending ?? []).filter((_, i) => i !== index)
        onPendingChange(next)
      }
    } catch (err) {
      toast({
        title: 'No se pudo eliminar la alerta',
        description: err instanceof Error ? err.message : 'Intenta de nuevo.',
        variant: 'error',
      })
    }
  }

  return (
    <div className="space-y-3">
      {visibleItems.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {visibleItems.map((a, i) => (
            <span
              key={a.id}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${
                ALERT_STYLES[a.type] ?? ALERT_STYLES.Otra
              }`}
            >
              <TriangleAlert className="size-3.5" aria-hidden="true" />
              <span>
                <b>{a.type}:</b> {a.description}
              </span>
              <button
                type="button"
                onClick={() => remove(a.id, i)}
                aria-label="Eliminar alerta"
                className="text-current opacity-60 hover:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          {ALERT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Describe la alerta…"
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={add}
          disabled={busy || loading || visibleItems.length >= ALERT_LIMIT || !desc.trim()}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Plus />} Agregar
        </Button>
      </div>
      {loading && <p className="text-xs text-muted-foreground">Cargando alertas…</p>}
    </div>
  )
}
