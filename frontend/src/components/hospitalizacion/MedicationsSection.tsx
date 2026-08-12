import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2, Pill, Plus, SkipForward, XCircle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { apiFetch } from '@/lib/api'
import { ADMIN_STATUS_META } from '@/lib/hospitalization'
import type { MedOrder } from '@/lib/hospitalization'

interface InventoryItem {
  id: string
  name: string
  category: string | null
  unit: string | null
}

export function MedicationsSection({
  hospitalizationId,
  branchId,
}: {
  hospitalizationId: string
  branchId: string
}) {
  const { toast } = useToast()
  const [orders, setOrders] = useState<MedOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [prescribeOpen, setPrescribeOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setOrders(await apiFetch<MedOrder[]>(`/hospitalization/${hospitalizationId}/medications`))
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [hospitalizationId])

  useEffect(() => {
    load()
  }, [load])

  const act = async (adminId: string, action: 'administer' | 'skip' | 'refuse' | 'cancel') => {
    setBusyId(adminId)
    try {
      await apiFetch(`/hospitalization/medications/administrations/${adminId}/${action}`, { method: 'POST' })
      toast({ title: 'Dosis actualizada', variant: 'success' })
      await load()
    } catch (err) {
      toast({
        title: 'No se pudo actualizar',
        description: err instanceof Error ? err.message : 'Intenta de nuevo.',
        variant: 'error',
      })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Pill className="size-4 text-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold">Medicamentos</h3>
        </div>
        <Button size="sm" variant="outline" onClick={() => setPrescribeOpen(true)}>
          <Plus /> Prescribir
        </Button>
      </div>

      {loading ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : orders.length === 0 ? (
        <EmptyState title="Sin medicamentos" description="Aún no hay órdenes de medicación." icon={Pill} />
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{o.name}</p>
                {o.dose && (
                  <Badge variant="secondary">
                    {o.dose}
                    {o.unit ? ` ${o.unit}` : ''}
                  </Badge>
                )}
                {o.route && <Badge variant="outline">{o.route}</Badge>}
                {o.interval_hours && <Badge variant="outline">cada {o.interval_hours} h</Badge>}
              </div>
              {o.observations && <p className="mt-1 text-xs text-muted-foreground">{o.observations}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {o.administrations.map((a) => {
                  const meta = ADMIN_STATUS_META[a.status]
                  const isPending = a.status === 'pending'
                  return (
                    <span
                      key={a.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2 py-1 text-xs"
                    >
                      <span className="font-medium">
                        {new Date(a.scheduled_at).toLocaleString('es-MX', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <Badge variant={meta.badge}>{meta.label}</Badge>
                      {isPending && (
                        <>
                          <button
                            type="button"
                            disabled={busyId === a.id}
                            onClick={() => act(a.id, 'administer')}
                            className="flex size-6 items-center justify-center rounded bg-success/15 text-success hover:bg-success/25"
                            title="Administrar"
                          >
                            {busyId === a.id ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <Check className="size-3" />
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={busyId === a.id}
                            onClick={() => act(a.id, 'skip')}
                            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent"
                            title="Omitir"
                          >
                            <SkipForward className="size-3" />
                          </button>
                          <button
                            type="button"
                            disabled={busyId === a.id}
                            onClick={() => act(a.id, 'refuse')}
                            className="flex size-6 items-center justify-center rounded text-destructive hover:bg-destructive/10"
                            title="Rechazar"
                          >
                            <XCircle className="size-3" />
                          </button>
                        </>
                      )}
                    </span>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <PrescribeDialog
        open={prescribeOpen}
        onOpenChange={setPrescribeOpen}
        hospitalizationId={hospitalizationId}
        branchId={branchId}
        onSaved={() => {
          setPrescribeOpen(false)
          load()
        }}
      />
    </div>
  )
}

function PrescribeDialog({
  open,
  onOpenChange,
  hospitalizationId,
  branchId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  hospitalizationId: string
  branchId: string
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [products, setProducts] = useState<InventoryItem[]>([])
  const [productId, setProductId] = useState('')
  const [name, setName] = useState('')
  const [dose, setDose] = useState('')
  const [unit, setUnit] = useState('')
  const [route, setRoute] = useState('')
  const [intervalHours, setIntervalHours] = useState('8')
  const [startAt, setStartAt] = useState(() => new Date().toISOString().slice(0, 16))
  const [endAt, setEndAt] = useState('')
  const [observations, setObservations] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setProductId('')
    setName('')
    setDose('')
    setUnit('')
    setRoute('')
    setIntervalHours('8')
    setEndAt('')
    setObservations('')
    setError(null)
    apiFetch<InventoryItem[]>(`/inventory?branch_id=${branchId}`)
      .then(setProducts)
      .catch(() => setProducts([]))
  }, [open, branchId])

  const submit = async () => {
    setError(null)
    if (!name.trim() || !startAt) {
      setError('Nombre y fecha de inicio son obligatorios.')
      return
    }
    setBusy(true)
    try {
      await apiFetch(`/hospitalization/${hospitalizationId}/medications`, {
        method: 'POST',
        body: JSON.stringify({
          inventory_product_id: productId || null,
          name: name.trim(),
          dose: dose || null,
          unit: unit || null,
          route: route || null,
          interval_hours: Number(intervalHours) || null,
          start_at: new Date(startAt).toISOString(),
          end_at: endAt ? new Date(endAt).toISOString() : null,
          observations: observations || null,
        }),
      })
      toast({ title: 'Medicamento prescrito', variant: 'success' })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo prescribir')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Prescribir medicamento</DialogTitle>
          <DialogDescription>Registra una orden de medicación y sus dosis.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label>Medicamento (insumo)</Label>
            <select
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value)
                const p = products.find((x) => x.id === e.target.value)
                if (p) {
                  setName(p.name)
                  if (p.unit) setUnit(p.unit)
                }
              }}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— Sin catálogo (texto libre) —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.category ? ` · ${p.category}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Nombre *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Cefalexina" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Dosis</Label>
              <Input value={dose} onChange={(e) => setDose(e.target.value)} placeholder="500" />
            </div>
            <div className="space-y-2">
              <Label>Unidad</Label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="mg" />
            </div>
            <div className="space-y-2">
              <Label>Vía</Label>
              <Input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="PO" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Intervalo (horas)</Label>
              <Input type="number" min={1} value={intervalHours} onChange={(e) => setIntervalHours(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Inicio *</Label>
              <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Fin (opcional)</Label>
              <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Observaciones</Label>
            <Input value={observations} onChange={(e) => setObservations(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Pill />} Prescribir
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
