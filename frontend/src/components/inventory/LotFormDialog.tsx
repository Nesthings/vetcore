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

export function LotFormDialog({
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
  const [lotNumber, setLotNumber] = useState('')
  const [expiration, setExpiration] = useState('')
  const [quantity, setQuantity] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await apiFetch(`/inventory/${product.id}/lots`, {
        method: 'POST',
        body: JSON.stringify({
          lot_number: lotNumber || null,
          expiration_date: expiration || null,
          quantity: Number(quantity),
        }),
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el lote')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo lote — {product.name}</DialogTitle>
          <DialogDescription>Registra un lote y su entrada de stock (compra).</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>N° de lote</Label>
              <Input
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
                placeholder="Ej. AMX-2026"
              />
            </div>
            <div className="space-y-2">
              <Label>Caducidad</Label>
              <Input
                type="date"
                value={expiration}
                onChange={(e) => setExpiration(e.target.value)}
              />
            </div>
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
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : 'Guardar lote'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
