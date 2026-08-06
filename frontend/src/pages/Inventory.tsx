import { useCallback, useEffect, useState } from 'react'
import { CalendarX2, PackagePlus, Plus, Search, TriangleAlert } from 'lucide-react'

import { AppLayout } from '@/components/layout/AppLayout'
import { LotFormDialog } from '@/components/inventory/LotFormDialog'
import { ProductFormDialog } from '@/components/inventory/ProductFormDialog'
import { StockEntryDialog } from '@/components/inventory/StockEntryDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
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

export interface InventoryProduct {
  id: string
  branch_id: string
  name: string
  category?: string | null
  unit?: string | null
  stock: number
  lots: {
    id: string
    lot_number?: string | null
    expiration_date?: string | null
    quantity: number
  }[]
  expiring_soon: boolean
  expired: boolean
}

function stockBadge(stock: number) {
  if (stock <= 0) return <Badge variant="destructive">Agotado</Badge>
  if (stock < 5) return <Badge variant="warning">Bajo</Badge>
  return <Badge variant="success">{stock} en stock</Badge>
}

export function Inventory() {
  const [products, setProducts] = useState<InventoryProduct[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [lotFor, setLotFor] = useState<InventoryProduct | null>(null)
  const [stockFor, setStockFor] = useState<InventoryProduct | null>(null)

  const load = useCallback(
    async (q = search) => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (q) params.set('search', q)
        const res = await apiFetch<InventoryProduct[]>(`/inventory?${params}`)
        setProducts(res)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo cargar el inventario')
      } finally {
        setLoading(false)
      }
    },
    [search],
  )

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
          <p className="text-sm text-muted-foreground">Productos, stock y alertas de caducidad</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus /> Nuevo producto
        </Button>
      </div>

      <div className="mb-4 max-w-md">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load(search)}
            placeholder="Buscar producto…"
            className="pl-9"
          />
        </div>
      </div>

      {error && <ErrorState description={error} onRetry={() => load()} className="mb-6" />}
      {loading && <LoadingState label="Cargando inventario…" />}

      {!loading && !error && products.length === 0 && (
        <EmptyState
          title="Sin productos"
          description="Registra tu primer producto para llevar el control de stock."
          icon={PackagePlus}
          action={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus /> Nuevo producto
            </Button>
          }
        />
      )}

      {!loading && !error && products.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Caducidad</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.category ?? '—'}</TableCell>
                  <TableCell>{p.unit ?? '—'}</TableCell>
                  <TableCell>{stockBadge(p.stock)}</TableCell>
                  <TableCell>
                    {p.expired ? (
                      <Badge variant="destructive">Vencido</Badge>
                    ) : p.expiring_soon ? (
                      <span className="inline-flex items-center gap-1">
                        <TriangleAlert className="size-3.5 text-warning" aria-hidden="true" />
                        <Badge variant="warning">Vence pronto</Badge>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setLotFor(p)}>
                      <CalendarX2 /> Lote
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setStockFor(p)}>
                      Stock
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ProductFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={() => {
          setCreateOpen(false)
          load()
        }}
      />

      {lotFor && (
        <LotFormDialog
          product={lotFor}
          open={Boolean(lotFor)}
          onOpenChange={(o) => !o && setLotFor(null)}
          onSaved={() => {
            setLotFor(null)
            load()
          }}
        />
      )}

      {stockFor && (
        <StockEntryDialog
          product={stockFor}
          open={Boolean(stockFor)}
          onOpenChange={(o) => !o && setStockFor(null)}
          onSaved={() => {
            setStockFor(null)
            load()
          }}
        />
      )}
    </AppLayout>
  )
}
