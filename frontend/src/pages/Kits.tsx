import { useCallback, useEffect, useState } from 'react'
import { Package, Pencil, Plus, Trash2 } from 'lucide-react'

import { AppLayout } from '@/components/layout/AppLayout'
import { KitFormDialog } from '@/components/kits/KitFormDialog'
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

export interface KitItem {
  id: string
  product_id: string
  quantity: number
  product_name?: string | null
}

export interface Kit {
  id: string
  name: string
  price: number
  items: KitItem[]
}

export function Kits() {
  const [kits, setKits] = useState<Kit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Kit | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<Kit[]>('/kits')
      setKits(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los kits')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const remove = async (k: Kit) => {
    if (!confirm(`¿Eliminar el kit "${k.name}"?`)) return
    try {
      await apiFetch(`/kits/${k.id}`, { method: 'DELETE' })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el kit')
    }
  }

  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kits</h1>
          <p className="text-sm text-muted-foreground">
            Paquetes de productos con precio propio (descuento por bundle)
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus /> Nuevo kit
        </Button>
      </div>

      {error && <ErrorState description={error} onRetry={load} className="mb-6" />}
      {loading && <LoadingState label="Cargando kits…" />}

      {!loading && !error && kits.length === 0 && (
        <EmptyState
          title="Sin kits"
          description="Crea kits para agrupar productos a un precio de conjunto."
          icon={Package}
          action={
            <Button
              size="sm"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus /> Nuevo kit
            </Button>
          }
        />
      )}

      {!loading && !error && kits.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kit</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Componentes</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {kits.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell className="font-semibold">${Number(k.price).toFixed(2)}</TableCell>
                  <TableCell className="max-w-md">
                    <div className="flex flex-wrap gap-1">
                      {k.items.length === 0 && (
                        <span className="text-muted-foreground">Sin componentes</span>
                      )}
                      {k.items.map((it) => (
                        <Badge key={it.id} variant="outline">
                          {it.product_name ?? it.product_id.slice(0, 8)} ×{it.quantity}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Editar ${k.name}`}
                      onClick={() => {
                        setEditing(k)
                        setFormOpen(true)
                      }}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Eliminar ${k.name}`}
                      className="text-destructive"
                      onClick={() => remove(k)}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <KitFormDialog
        open={formOpen}
        kit={editing}
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
