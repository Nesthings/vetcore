import { useCallback, useEffect, useState } from 'react'
import { Plus, ShoppingCart } from 'lucide-react'

import { AppLayout } from '@/components/layout/AppLayout'
import { PurchaseOrderFormDialog } from '@/components/purchase/PurchaseOrderFormDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { LoadingState } from '@/components/ui/loading-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiFetch } from '@/lib/api'

export interface PurchaseOrderItem {
  id: string
  product_id: string
  quantity: number
  product_name?: string | null
}

export interface PurchaseOrder {
  id: string
  branch_id: string
  supplier_name?: string | null
  status: string
  created_at: string
  items: PurchaseOrderItem[]
  branch_name?: string | null
}

const STATUS: Record<
  string,
  { label: string; variant: 'secondary' | 'info' | 'success' | 'destructive' }
> = {
  draft: { label: 'Borrador', variant: 'secondary' },
  sent: { label: 'Enviada', variant: 'info' },
  received: { label: 'Recibida', variant: 'success' },
  cancelled: { label: 'Cancelada', variant: 'destructive' },
}

export function PurchaseOrders() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<PurchaseOrder[]>('/purchase-orders')
      setOrders(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las órdenes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const changeStatus = async (order: PurchaseOrder, status: string) => {
    setBusyId(order.id)
    setError(null)
    try {
      await apiFetch(`/purchase-orders/${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la orden')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Órdenes de compra</h1>
          <p className="text-sm text-muted-foreground">
            Al recibir una orden, el stock entra automáticamente
          </p>
        </div>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus /> Nueva orden
        </Button>
      </div>

      {error && <ErrorState description={error} onRetry={load} className="mb-6" />}
      {loading && <LoadingState label="Cargando órdenes…" />}

      {!loading && !error && orders.length === 0 && (
        <EmptyState
          title="Sin órdenes de compra"
          description="Crea una orden para proveedores y recíbela para sumar stock."
          icon={ShoppingCart}
          action={
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus /> Nueva orden
            </Button>
          }
        />
      )}

      {!loading && !error && orders.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Folio</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Sucursal</TableHead>
                <TableHead>Conceptos</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => {
                const st = STATUS[o.status] ?? { label: o.status, variant: 'secondary' }
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">{o.id.slice(0, 8)}</TableCell>
                    <TableCell>{o.supplier_name ?? '—'}</TableCell>
                    <TableCell>{o.branch_name ?? '—'}</TableCell>
                    <TableCell className="max-w-xs">
                      <div className="flex flex-wrap gap-1">
                        {o.items.map((it) => (
                          <Badge key={it.id} variant="outline">
                            {it.product_name ?? it.product_id.slice(0, 8)} ×{it.quantity}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {o.status === 'draft' && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId === o.id}
                          onClick={() => changeStatus(o, 'sent')}
                        >
                          Enviar
                        </Button>
                      )}
                      {o.status === 'sent' && (
                        <Button
                          size="sm"
                          disabled={busyId === o.id}
                          onClick={() => changeStatus(o, 'received')}
                        >
                          Recibir
                        </Button>
                      )}
                      {(o.status === 'draft' || o.status === 'sent') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          disabled={busyId === o.id}
                          onClick={() => changeStatus(o, 'cancelled')}
                        >
                          Cancelar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <PurchaseOrderFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={() => {
          setFormOpen(false)
          load()
        }}
      />
    </AppLayout>
  )
}
