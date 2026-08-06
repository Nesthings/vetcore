import { useEffect, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiFetch } from '@/lib/api'

interface Product {
  id: string
  name: string
}

interface Line {
  product_id: string
  quantity: number
}

export function PurchaseOrderFormDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [branchId, setBranchId] = useState('')
  const [supplier, setSupplier] = useState('')
  const [lines, setLines] = useState<Line[]>([{ product_id: '', quantity: 1 }])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSupplier('')
    setLines([{ product_id: '', quantity: 1 }])
    setError(null)
    Promise.all([
      apiFetch<{ id: string; name: string }[]>('/branches'),
      apiFetch<Product[]>('/inventory'),
    ])
      .then(([b, p]) => {
        setBranches(b)
        setProducts(p)
        if (b.length > 0) setBranchId((cur) => cur || b[0].id)
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'No se pudieron cargar los datos'),
      )
  }, [open])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const valid = lines.filter((l) => l.product_id)
    if (valid.length === 0) {
      setError('Agrega al menos un producto.')
      return
    }
    setSubmitting(true)
    try {
      await apiFetch('/purchase-orders', {
        method: 'POST',
        body: JSON.stringify({
          branch_id: branchId,
          supplier_name: supplier || null,
          items: valid.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
        }),
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la orden')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nueva orden de compra</DialogTitle>
          <DialogDescription>Define proveedor y productos a ordenar.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Sucursal</Label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Proveedor</Label>
              <Input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="Distribuidora…"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Productos</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setLines((l) => [...l, { product_id: '', quantity: 1 }])}
              >
                <Plus /> Agregar
              </Button>
            </div>
            {lines.map((line, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select
                  value={line.product_id}
                  onChange={(e) =>
                    setLines((l) =>
                      l.map((x, i) => (i === idx ? { ...x, product_id: e.target.value } : x)),
                    )
                  }
                  className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">— Selecciona producto —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={line.quantity}
                  onChange={(e) =>
                    setLines((l) =>
                      l.map((x, i) => (i === idx ? { ...x, quantity: Number(e.target.value) } : x)),
                    )
                  }
                  className="w-20"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setLines((l) => l.filter((_, i) => i !== idx))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : 'Crear orden'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
