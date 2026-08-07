import { useEffect, useState } from 'react'
import { Info, Loader2 } from 'lucide-react'

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

function toLocalInputValue(d: string): string {
  const date = new Date(d)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function WaitlistFormDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [pets, setPets] = useState<{ id: string; name: string }[]>([])
  const [branchId, setBranchId] = useState('')
  const [petId, setPetId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setPetId('')
    setError(null)
    const d = new Date()
    d.setMinutes(0, 0, 0)
    const f = new Date(d)
    f.setDate(f.getDate() + 1)
    f.setHours(9)
    const t = new Date(f)
    t.setHours(12)
    setFrom(toLocalInputValue(f.toISOString()))
    setTo(toLocalInputValue(t.toISOString()))
    Promise.all([
      apiFetch<{ id: string; name: string }[]>('/branches'),
      apiFetch<{ id: string; name: string }[]>('/pets'),
    ])
      .then(([b, p]) => {
        setBranches(b)
        setPets(p)
        if (b.length > 0) setBranchId((cur) => cur || b[0].id)
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'No se pudieron cargar los datos'),
      )
  }, [open])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await apiFetch('/waitlist', {
        method: 'POST',
        body: JSON.stringify({
          branch_id: branchId,
          pet_id: petId,
          desired_from: new Date(from).toISOString(),
          desired_to: new Date(to).toISOString(),
        }),
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar a la lista')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar a la lista de espera</DialogTitle>
          <DialogDescription>Define la ventana de horario deseada.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="flex items-start gap-2.5 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <p>
              Cuando no hay hueco en la agenda, apunta aquí al paciente con la ventana de horario
              que le conviene. Al liberarse un espacio, contacta al dueño, agenda la cita y marca el
              estado en la lista (<b>ofrecer hueco</b> → <b>cumplida</b>); si ya no le interesa,
              <b> expírala</b>.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Paciente *</Label>
              <select
                value={petId}
                onChange={(e) => setPetId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Selecciona —</option>
                {pets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
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
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Desde</Label>
              <Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Hasta</Label>
              <Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting || !petId}>
              {submitting ? <Loader2 className="animate-spin" /> : 'Agregar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
