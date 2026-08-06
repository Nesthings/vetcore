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
import type { Kit } from '@/pages/Kits'
import { apiFetch } from '@/lib/api'

interface Product {
  id: string
  name: string
}

interface Line {
  product_id: string
  quantity: number
}

export function KitFormDialog({
  open,
  kit,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  kit: Kit | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [products, setProducts] = useState<Product[]>([])
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [lines, setLines] = useState<Line[]>([{ product_id: '', quantity: 1 }])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(kit?.name ?? '')
    setPrice(kit ? String(kit.price) : '')
    setLines(
      kit?.items?.length
        ? kit.items.map((i) => ({ product_id: i.product_id, quantity: Number(i.quantity) }))
        : [{ product_id: '', quantity: 1 }],
    )
    setError(null)
    apiFetch<Product[]>('/inventory')
      .then(setProducts)
      .catch(() => undefined)
  }, [open, kit])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const valid = lines.filter((l) => l.product_id)
    setSubmitting(true)
    try {
      const body = JSON.stringify({
        name,
        price: Number(price) || 0,
        items: valid.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
      })
      if (kit) {
        await apiFetch(`/kits/${kit.id}`, { method: 'PATCH', body })
      } else {
        await apiFetch('/kits', { method: 'POST', body })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el kit')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{kit ? 'Editar kit' : 'Nuevo kit'}</DialogTitle>
          <DialogDescription>
            Define los productos del kit y su precio de conjunto.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-[1fr_140px] gap-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Precio *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Componentes</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setLines((l) => [...l, { product_id: '', quantity: 1 }])}
              >
                <Plus /> Agregar producto
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
              {submitting ? <Loader2 className="animate-spin" /> : 'Guardar kit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
