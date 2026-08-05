import { useEffect, useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { apiFetch } from '@/lib/api'

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface PetOption {
  id: string
  name: string
}

interface VetOption {
  id: string
  full_name: string
  role: string
}

export function AppointmentFormDialog({
  open,
  onOpenChange,
  defaultDay,
  defaultBranchId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultDay: Date
  defaultBranchId: string
  onSaved: () => void
}) {
  const [pets, setPets] = useState<PetOption[]>([])
  const [vets, setVets] = useState<VetOption[]>([])
  const [petId, setPetId] = useState('')
  const [vetId, setVetId] = useState('')
  const [procedure, setProcedure] = useState('Consulta')
  const [start, setStart] = useState(() => {
    const d = new Date(defaultDay)
    d.setHours(9, 0, 0, 0)
    return toLocalInputValue(d)
  })
  const [end, setEnd] = useState(() => {
    const d = new Date(defaultDay)
    d.setHours(9, 30, 0, 0)
    return toLocalInputValue(d)
  })
  const [branchId, setBranchId] = useState(defaultBranchId)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setBranchId(defaultBranchId)
    setError(null)
    const d = new Date(defaultDay)
    d.setHours(9, 0, 0, 0)
    setStart(toLocalInputValue(d))
    d.setMinutes(30)
    setEnd(toLocalInputValue(d))
    Promise.all([apiFetch<PetOption[]>('/pets'), apiFetch<VetOption[]>('/users')])
      .then(([p, u]) => {
        setPets(p)
        setVets(u)
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'No se pudieron cargar los datos'),
      )
  }, [open, defaultDay, defaultBranchId])

  const submit = async () => {
    setError(null)
    setSubmitting(true)
    try {
      await apiFetch('/appointments', {
        method: 'POST',
        body: JSON.stringify({
          branch_id: branchId,
          pet_id: petId,
          vet_user_id: vetId || null,
          procedure_type: procedure,
          start_time: new Date(start).toISOString(),
          end_time: new Date(end).toISOString(),
          status: 'scheduled',
        }),
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cita')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva cita</DialogTitle>
          <DialogDescription>Agenda una cita para un paciente.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label>Paciente</Label>
            <Select value={petId} onValueChange={setPetId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona el paciente" />
              </SelectTrigger>
              <SelectContent>
                {pets.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Veterinario</Label>
              <Select value={vetId} onValueChange={setVetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  {vets.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.full_name} · {v.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Procedimiento</Label>
              <Input value={procedure} onChange={(e) => setProcedure(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Inicio</Label>
              <Input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Fin</Label>
              <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={submitting || !petId}>
            {submitting ? <Loader2 className="animate-spin" /> : 'Guardar cita'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
