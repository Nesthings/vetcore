import { useCallback, useEffect, useState } from 'react'
import { CalendarX2, PackageMinus, PackagePlus, PackageX, Plus, TriangleAlert } from 'lucide-react'

import { AppLayout } from '@/components/layout/AppLayout'
import { LotFormDialog } from '@/components/inventory/LotFormDialog'
import { ProductFormDialog } from '@/components/inventory/ProductFormDialog'
import { StockEntryDialog } from '@/components/inventory/StockEntryDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { LoadingState } from '@/components/ui/loading-state'
import { SearchInput } from '@/components/ui/search-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { StatChip } from '@/components/ui/stat-chip'
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
  days_remaining?: number | null
}

function stockBadge(stock: number) {
  if (stock <= 0) return <Badge variant="destructive">Agotado</Badge>
  if (stock < 5) return <Badge variant="warning">Bajo</Badge>
  return <Badge variant="success">{stock} en stock</Badge>
}

export function Inventory() {
  const [products, setProducts] = useState<InventoryProduct[]>([])
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [branchId, setBranchId] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [lotFor, setLotFor] = useState<InventoryProduct | null>(null)
  const [stockFor, setStockFor] = useState<InventoryProduct | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (branchId) params.set('branch_id', branchId)
      const [res, branchList] = await Promise.all([
        apiFetch<InventoryProduct[]>(`/inventory?${params}`),
        apiFetch<{ id: string; name: string }[]>('/branches'),
      ])
      setProducts(res)
      setBranches(branchList)
      if (!branchId && branchList.length > 0) setBranchId(branchList[0].id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el inventario')
    } finally {
      setLoading(false)
    }
  }, [search, branchId])

  useEffect(() => {
    const t = setTimeout(() => load(), search ? 250 : 0)
    return () => clearTimeout(t)
  }, [search, branchId, load])

  const summary = {
    agotados: products.filter((p) => p.stock <= 0).length,
    bajos: products.filter((p) => p.stock > 0 && p.stock < 5).length,
    vencidos: products.filter((p) => p.expired).length,
    porVencer: products.filter((p) => p.expiring_soon).length,
  }

  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Insumos</h1>
          <p className="text-sm text-muted-foreground">Productos, stock y alertas de caducidad</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus /> Nuevo producto
        </Button>
      </div>

      <div className="mb-4 flex max-w-lg gap-3">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch('')}
          placeholder="Buscar producto…"
          className="flex-1"
        />
        <Select value={branchId} onValueChange={setBranchId}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Sucursal" />
          </SelectTrigger>
          <SelectContent>
            {branches.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!loading && !error && products.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatChip
            label="Agotados"
            value={summary.agotados}
            icon={PackageX}
            tint="bg-destructive/10 text-destructive"
          />
          <StatChip
            label="Stock bajo"
            value={summary.bajos}
            icon={PackageMinus}
            tint="bg-warning/10 text-warning"
          />
          <StatChip
            label="Vencidos"
            value={summary.vencidos}
            icon={CalendarX2}
            tint="bg-destructive/10 text-destructive"
          />
          <StatChip
            label="Por vencer"
            value={summary.porVencer}
            icon={TriangleAlert}
            tint="bg-warning/10 text-warning"
          />
        </div>
      )}

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
                <TableHead className="hidden lg:table-cell">Categoría</TableHead>
                <TableHead className="hidden md:table-cell">Unidad</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Caducidad</TableHead>
                <TableHead className="hidden lg:table-cell">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help underline decoration-dotted underline-offset-4">
                          Predicción
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        Días estimados antes de agotar el stock actual
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="hidden lg:table-cell">{p.category ?? '—'}</TableCell>
                  <TableCell className="hidden md:table-cell">{p.unit ?? '—'}</TableCell>
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
                  <TableCell className="hidden lg:table-cell">
                    {p.days_remaining !== null && p.days_remaining !== undefined ? (
                      <span className="text-sm text-muted-foreground">
                        {p.days_remaining < 7 ? (
                          <Badge variant="warning">~{p.days_remaining} días</Badge>
                        ) : (
                          `~${p.days_remaining} días`
                        )}
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
