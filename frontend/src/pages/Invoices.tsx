import { useCallback, useEffect, useState } from 'react'
import { Plus, Receipt } from 'lucide-react'

import { AppLayout } from '@/components/layout/AppLayout'
import { InvoiceDetailDialog } from '@/components/invoices/InvoiceDetailDialog'
import { InvoiceFormDialog } from '@/components/invoices/InvoiceFormDialog'
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

export interface InvoiceItem {
  id: string
  description: string
  quantity: number
  unit_price: number
  discount_percent: number
  line_total?: number
}

export interface Invoice {
  id: string
  branch_id: string
  pet_id: string | null
  pet_name?: string | null
  branch_name?: string | null
  total: string
  status: string
  created_at: string
  items: InvoiceItem[]
}

const STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' }> = {
  paid: { label: 'Pagada', variant: 'success' },
  pending: { label: 'Pendiente', variant: 'warning' },
  cancelled: { label: 'Cancelada', variant: 'destructive' },
}

export function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [selected, setSelected] = useState<Invoice | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<Invoice[]>('/invoices')
      setInvoices(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las facturas')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Facturación</h1>
          <p className="text-sm text-muted-foreground">
            Historial de facturas y recibos (exclusivo del admin)
          </p>
        </div>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus /> Nueva factura
        </Button>
      </div>

      {error && <ErrorState description={error} onRetry={load} className="mb-6" />}
      {loading && <LoadingState label="Cargando facturas…" />}

      {!loading && !error && invoices.length === 0 && (
        <EmptyState
          title="Sin facturas"
          description="Genera tu primera factura para comenzar a registrar ingresos."
          icon={Receipt}
          action={
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus /> Nueva factura
            </Button>
          }
        />
      )}

      {!loading && !error && invoices.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Folio</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Sucursal</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => {
                const st = STATUS[inv.status] ?? { label: inv.status, variant: 'warning' }
                return (
                  <TableRow
                    key={inv.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(inv)}
                  >
                    <TableCell className="font-mono text-xs">{inv.id.slice(0, 8)}</TableCell>
                    <TableCell className="font-medium">{inv.pet_name ?? '—'}</TableCell>
                    <TableCell>{inv.branch_name ?? '—'}</TableCell>
                    <TableCell>{new Date(inv.created_at).toLocaleDateString('es-MX')}</TableCell>
                    <TableCell className="font-semibold">${Number(inv.total).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelected(inv)
                        }}
                      >
                        Ver
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <InvoiceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={() => {
          setFormOpen(false)
          load()
        }}
      />

      {selected && (
        <InvoiceDetailDialog
          invoice={selected}
          open={Boolean(selected)}
          onOpenChange={(o) => !o && setSelected(null)}
        />
      )}
    </AppLayout>
  )
}
