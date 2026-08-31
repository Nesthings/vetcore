import { useEffect, useRef, useState } from 'react'
import { Check, FileText, Loader2, PawPrint, Search, UserRoundPlus, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
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
  const [petMode, setPetMode] = useState<'pet' | 'walk_in' | null>(null)
  const [creatingPet, setCreatingPet] = useState(false)
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
    setPetMode(null)
    setCreatingPet(false)
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
    setPetMode('pet')
    setPetOpen(false)
    setCreatingPet(false)
  }

  const pickWalkIn = () => {
    const name = petQuery.trim()
    if (!name) return
    setPetId('')
    setPetQuery(name)
    setPetMode('walk_in')
    setPetOpen(false)
  }

  const onPetQueryChange = (value: string) => {
    setPetQuery(value)
    setPetId('')
    setPetMode(null)
    setPetOpen(true)
    setCreatingPet(false)
  }

  const submit = async () => {
    setError(null)
    setSubmitting(true)
    try {
      await apiFetch('/appointments', {
        method: 'POST',
        body: JSON.stringify({
          branch_id: branchId,
          pet_id: petMode === 'pet' ? petId : null,
          walk_in_name: petMode === 'walk_in' ? petQuery.trim() : null,
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
                  onChange={(e) => onPetQueryChange(e.target.value)}
                  onFocus={() => setPetOpen(true)}
                  placeholder="Escribe para buscar el paciente…"
                  className="pl-9"
                  autoComplete="off"
                />
              </div>
              {petOpen && (
                <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-card p-1 shadow-card">
                  {filteredPets.length === 0 ? (
                    <p className="px-2 py-1.5 text-sm text-muted-foreground">
                      No hay mascotas que coincidan con «{petQuery.trim()}».
                    </p>
                  ) : (
                    <>
                      <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                        Mascotas registradas
                      </p>
                      {filteredPets.slice(0, 10).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => pickPet(p)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent',
                            p.id === petId && 'bg-accent',
                          )}
                        >
                          <PawPrint
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <span className="flex-1 truncate">{p.name}</span>
                          {p.id === petId && (
                            <Check className="size-4 text-primary" aria-hidden="true" />
                          )}
                        </button>
                      ))}
                    </>
                  )}
                  <div className="my-1 border-t border-border" />
                  <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                    ¿No está registrado?
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setPetOpen(false)
                      setCreatingPet(true)
                    }}
                    className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-accent"
                  >
                    <UserRoundPlus
                      className="mt-0.5 size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span className="flex-1">
                      <span className="block text-sm font-medium">
                        Registrar como mascota nueva
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Crea su expediente (historial, vacunas, recordatorios) y queda disponible
                        para futuras citas.
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={pickWalkIn}
                    disabled={!petQuery.trim()}
                    className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FileText
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="flex-1">
                      <span className="block text-sm font-medium">Agendar sin registro</span>
                      <span className="block text-xs text-muted-foreground">
                        Solo guarda el nombre «{petQuery.trim() || '…'}» sin crear expediente. No
                        tendrá historial ni recordatorios.
                      </span>
                    </span>
                  </button>
                </div>
              )}
            </div>
            {petMode === 'walk_in' && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant="secondary">Sin registro</Badge>
                Se agendará solo con el nombre, sin expediente ni recordatorios.
                <button
                  type="button"
                  onClick={() => onPetQueryChange('')}
                  className="inline-flex items-center gap-0.5 font-medium text-foreground hover:text-destructive"
                >
                  <X className="size-3" aria-hidden="true" /> Quitar
                </button>
              </p>
            )}
          </div>

          {creatingPet && (
            <QuickCreatePet
              initialName={petQuery}
              onCancel={() => setCreatingPet(false)}
              onCreated={pickPet}
            />
          )}

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
          <Button onClick={submit} disabled={submitting || !(petId || petMode === 'walk_in')}>
            {submitting ? <Loader2 className="animate-spin" /> : 'Guardar cita'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function QuickCreatePet({
  initialName,
  onCancel,
  onCreated,
}: {
  initialName: string
  onCancel: () => void
  onCreated: (p: PetOption) => void
}) {
  const [name, setName] = useState(initialName)
  const [species, setSpecies] = useState('perro')
  const [breed, setBreed] = useState('')
  const [sex, setSex] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ownerPhone, setOwnerPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    setError(null)
    if (!name.trim()) {
      setError('Escribe el nombre de la mascota')
      return
    }
    setSubmitting(true)
    try {
      const pet = await apiFetch<PetOption & { species: string }>('/pets', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          species,
          breed: breed.trim() || null,
          sex: sex || null,
          birth_date: birthDate || null,
          owner:
            ownerName.trim() || ownerPhone.trim()
              ? { full_name: ownerName.trim() || null, phone: ownerPhone.trim() || null }
              : null,
        }),
      })
      onCreated({ id: pet.id, name: pet.name })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la mascota')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
      <p className="flex items-center justify-between text-sm font-medium">
        <span className="flex items-center gap-1.5">
          <PawPrint className="size-4 text-primary" aria-hidden="true" />
          Registrar mascota nueva
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Cerrar"
        >
          <X className="size-4" />
        </button>
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Nombre *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Especie</Label>
          <Select value={species} onValueChange={setSpecies}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="perro">Perro</SelectItem>
              <SelectItem value="gato">Gato</SelectItem>
              <SelectItem value="otro">Otro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Raza</Label>
          <Input value={breed} onChange={(e) => setBreed(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Sexo</Label>
          <Select value={sex} onValueChange={setSex}>
            <SelectTrigger>
              <SelectValue placeholder="Opcional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hembra">Hembra</SelectItem>
              <SelectItem value="macho">Macho</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Fec. nacimiento</Label>
          <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
        </div>
      </div>
      <p className="text-xs font-medium text-muted-foreground">Contacto del dueño (opcional)</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Nombre del dueño</Label>
          <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Teléfono</Label>
          <Input value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="button" size="sm" onClick={create} disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : 'Crear y seleccionar'}
        </Button>
      </div>
    </div>
  )
}
