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

interface ServiceOption {
  id: string
  name: string
  price: number
  discount_percent: number
}

interface ProductOption {
  id: string
  name: string
}

interface KitOption {
  id: string
  name: string
  price: number
}

interface Branch {
  id: string
  name: string
}

interface Pet {
  id: string
  name: string
}

interface Line {
  source: string // 'svc:<id>' | 'prod:<id>' | 'manual'
  service_id: string | null
  product_id: string | null
  description: string
  quantity: number
  unit_price: string
  discount_percent: string
}

const emptyLine = (): Line => ({
  source: 'manual',
  service_id: null,
  product_id: null,
  description: '',
  quantity: 1,
  unit_price: '',
  discount_percent: '0',
})

export function InvoiceFormDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [branches, setBranches] = useState<Branch[]>([])
  const [pets, setPets] = useState<Pet[]>([])
  const [services, setServices] = useState<ServiceOption[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [kits, setKits] = useState<KitOption[]>([])
  const [branchId, setBranchId] = useState('')
  const [petId, setPetId] = useState('')
  const [lines, setLines] = useState<Line[]>([emptyLine()])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setLines([emptyLine()])
    Promise.all([
      apiFetch<Branch[]>('/branches'),
      apiFetch<Pet[]>('/pets'),
      apiFetch<ServiceOption[]>('/services'),
      apiFetch<ProductOption[]>('/inventory'),
      apiFetch<KitOption[]>('/kits'),
    ])
      .then(([b, p, s, pr, k]) => {
        setBranches(b)
        setPets(p)
        setServices(s)
        setProducts(pr)
        setKits(k)
        if (b.length > 0) setBranchId((cur) => cur || b[0].id)
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'No se pudieron cargar los datos'),
      )
  }, [open])

  const applySource = (idx: number, source: string) => {
    setLines((list) =>
      list.map((line, i) => {
        if (i !== idx) return line
        const next: Line = { ...line, source, service_id: null, product_id: null }
        if (source.startsWith('svc:')) {
          const svc = services.find((s) => s.id === source.slice(4))
          if (svc) {
            next.service_id = svc.id
            next.description = svc.name
            next.unit_price = String(svc.price)
            next.discount_percent = String(svc.discount_percent)
          }
        } else if (source.startsWith('prod:')) {
          const prod = products.find((p) => p.id === source.slice(5))
          if (prod) {
            next.product_id = prod.id
            next.description = prod.name
          }
        } else if (source.startsWith('kit:')) {
          const kit = kits.find((k) => k.id === source.slice(4))
          if (kit) {
            next.description = `Kit: ${kit.name}`
            next.unit_price = String(kit.price)
            next.discount_percent = '0'
          }
        } else {
          next.description = ''
        }
        return next
      }),
    )
  }

  const updateLine = (idx: number, patch: Partial<Line>) => {
    setLines((list) => list.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const validLines = lines.filter((l) => l.description.trim() && Number(l.unit_price) > 0)
      if (validLines.length === 0) {
        setError('Agrega al menos un concepto válido.')
        setSubmitting(false)
        return
      }
      await apiFetch('/invoices', {
        method: 'POST',
        body: JSON.stringify({
          branch_id: branchId,
          pet_id: petId || null,
          status: 'paid',
          items: validLines.map((l) => ({
            service_id: l.service_id,
            product_id: l.product_id,
            description: l.description,
            quantity: l.quantity,
            unit_price: Number(l.unit_price),
            discount_percent: Number(l.discount_percent) || undefined,
          })),
        }),
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la factura')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nueva factura</DialogTitle>
          <DialogDescription>
            Agrega servicios del catálogo (descuento automático) o productos.
          </DialogDescription>
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
              <Label>Paciente</Label>
              <select
                value={petId}
                onChange={(e) => setPetId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Sin paciente —</option>
                {pets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Conceptos</Label>
            {lines.map((line, idx) => (
              <div key={idx} className="space-y-2 rounded-md border border-border p-3">
                <div className="flex items-center gap-2">
                  <select
                    value={line.source}
                    onChange={(e) => applySource(idx, e.target.value)}
                    className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="manual">— Manual —</option>
                    <optgroup label="Servicios del catálogo">
                      {services.map((s) => (
                        <option key={s.id} value={`svc:${s.id}`}>
                          {s.name} · ${s.price}
                          {s.discount_percent > 0 ? ` · -${s.discount_percent}%` : ''}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Productos">
                      {products.map((p) => (
                        <option key={p.id} value={`prod:${p.id}`}>
                          {p.name}
                        </option>
                      ))}
                    </optgroup>
                    {kits.length > 0 && (
                      <optgroup label="Kits">
                        {kits.map((k) => (
                          <option key={k.id} value={`kit:${k.id}`}>
                            {k.name} · ${k.price}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setLines((l) => l.filter((_, i) => i !== idx))}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <Input
                    className="col-span-2"
                    placeholder="Descripción"
                    value={line.description}
                    onChange={(e) => updateLine(idx, { description: e.target.value })}
                    required
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    placeholder="Cant."
                    value={line.quantity}
                    onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })}
                    required
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="P. unit."
                    value={line.unit_price}
                    onChange={(e) => updateLine(idx, { unit_price: e.target.value })}
                    required
                  />
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="Dto %"
                    value={line.discount_percent}
                    onChange={(e) => updateLine(idx, { discount_percent: e.target.value })}
                  />
                </div>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setLines((l) => [...l, emptyLine()])}
            >
              <Plus /> Agregar concepto
            </Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : 'Crear factura'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
