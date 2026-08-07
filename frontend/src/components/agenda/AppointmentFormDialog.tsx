import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, Search } from 'lucide-react'

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
import { cn } from '@/lib/utils'

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
  const [petQuery, setPetQuery] = useState('')
  const [petOpen, setPetOpen] = useState(false)
  const petRef = useRef<HTMLDivElement>(null)
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
    setPetId('')
    setPetQuery('')
    setPetOpen(false)
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

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (petRef.current && !petRef.current.contains(e.target as Node)) setPetOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const filteredPets = pets.filter((p) =>
    p.name.toLowerCase().includes(petQuery.trim().toLowerCase()),
  )

  const pickPet = (p: PetOption) => {
    setPetId(p.id)
    setPetQuery(p.name)
    setPetOpen(false)
  }

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
            <div className="relative" ref={petRef}>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={petQuery}
                  onChange={(e) => {
                    setPetQuery(e.target.value)
                    setPetId('')
                    setPetOpen(true)
                  }}
                  onFocus={() => setPetOpen(true)}
                  placeholder="Escribe para buscar el paciente…"
                  className="pl-9"
                  autoComplete="off"
                />
              </div>
              {petOpen && (
                <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-md border border-border bg-card p-1 shadow-card">
                  {filteredPets.length === 0 ? (
                    <p className="px-2 py-1.5 text-sm text-muted-foreground">
                      Sin resultados para «{petQuery.trim()}».
                    </p>
                  ) : (
                    filteredPets.slice(0, 12).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => pickPet(p)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent',
                          p.id === petId && 'bg-accent',
                        )}
                      >
                        <span className="flex-1 truncate">{p.name}</span>
                        {p.id === petId && (
                          <Check className="size-4 text-primary" aria-hidden="true" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
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
