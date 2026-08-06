import { useCallback, useEffect, useState } from 'react'
import { Package, Pencil, Plus, Trash2 } from 'lucide-react'

import { AppLayout } from '@/components/layout/AppLayout'
import { ProductFormDialog } from '@/components/products/ProductFormDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { LoadingState } from '@/components/ui/loading-state'
import { apiFetch } from '@/lib/api'
import type { SaleProduct } from '@/lib/product'

export function Products() {
  const [products, setProducts] = useState<SaleProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SaleProduct | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<SaleProduct[]>('/products')
      setProducts(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los productos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const remove = async (p: SaleProduct) => {
    if (!confirm(`¿Eliminar el producto "${p.name}"?`)) return
    try {
      await apiFetch(`/products/${p.id}`, { method: 'DELETE' })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el producto')
    }
  }

  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo de productos de venta: croquetas, premios, ropas, camas, platos…
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus /> Nuevo producto
        </Button>
      </div>

      {error && <ErrorState description={error} onRetry={load} className="mb-6" />}
      {loading && <LoadingState label="Cargando productos…" />}

      {!loading && !error && products.length === 0 && (
        <EmptyState
          title="Sin productos"
          description="Agrega el primer producto que venda la veterinaria."
          icon={Package}
          action={
            <Button
              size="sm"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus /> Nuevo producto
            </Button>
          }
        />
      )}

      {!loading && !error && products.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <div
              key={p.id}
              className="overflow-hidden rounded-lg border border-border bg-card shadow-card"
            >
              <div className="flex aspect-square items-center justify-center bg-secondary/40">
                {p.photo_url ? (
                  <img
                    src={p.photo_url}
                    alt={p.name}
                    className="size-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <Package className="size-10 text-muted-foreground" />
                )}
              </div>
              <div className="space-y-1.5 p-3">
                <p className="truncate font-medium" title={p.name}>
                  {p.name}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary">{p.category}</Badge>
                  {!p.active && <Badge variant="outline">Inactivo</Badge>}
                </div>
                <p className="text-sm font-semibold">
                  {p.price != null ? `$${Number(p.price).toFixed(2)}` : 'Sin precio'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.stock_quantity > 0 ? (
                    <span>{p.stock_quantity} en existencia</span>
                  ) : (
                    <span className="font-medium text-destructive">Agotado</span>
                  )}
                </p>
                <div className="flex justify-end gap-1 pt-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Editar ${p.name}`}
                    onClick={() => {
                      setEditing(p)
                      setFormOpen(true)
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Eliminar ${p.name}`}
                    className="text-destructive"
                    onClick={() => remove(p)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ProductFormDialog
        open={formOpen}
        product={editing}
        onOpenChange={setFormOpen}
        onSaved={() => {
          setFormOpen(false)
          setEditing(null)
          load()
        }}
      />
    </AppLayout>
  )
}
