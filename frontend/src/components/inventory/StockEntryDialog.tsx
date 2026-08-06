import { useState } from 'react'
import { Loader2 } from 'lucide-react'

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
import type { InventoryProduct } from '@/pages/Inventory'
import { apiFetch } from '@/lib/api'

export function StockEntryDialog({
  product,
  open,
  onOpenChange,
  onSaved,
}: {
  product: InventoryProduct
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('purchase')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const qty = Number(quantity)
      if (reason === 'sale' && qty > 0) {
        // la salida se registra como negativa
        await apiFetch(`/inventory/${product.id}/stock-entry`, {
          method: 'POST',
          body: JSON.stringify({ quantity: -qty, reason }),
        })
      } else {
        await apiFetch(`/inventory/${product.id}/stock-entry`, {
          method: 'POST',
          body: JSON.stringify({ quantity: qty, reason }),
        })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el movimiento')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Movimiento de stock — {product.name}</DialogTitle>
          <DialogDescription>
            Stock actual: <b>{product.stock}</b>. Registra una entrada o salida manual.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="purchase">Entrada (compra)</option>
                <option value="sale">Salida (venta/ajuste)</option>
                <option value="adjustment">Ajuste</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Cantidad *</Label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : 'Registrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
