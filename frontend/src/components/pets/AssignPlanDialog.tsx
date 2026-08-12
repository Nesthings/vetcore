import { useEffect, useState } from 'react'
import { CalendarDays, Loader2, Syringe } from 'lucide-react'

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
import { useToast } from '@/components/ui/toast'

function todayISO() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function AssignPlanDialog({
  petId,
  petName,
  species,
  open,
  onOpenChange,
  onAssigned,
}: {
  petId: string
  petName: string
  species?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onAssigned: () => void
}) {
  const [plans, setPlans] = useState<
    { id: string; name: string; species?: string | null; steps: unknown[] }[]
  >([])
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [vets, setVets] = useState<{ id: string; full_name: string }[]>([])
  const [planId, setPlanId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [vetId, setVetId] = useState('')
  const [startDate, setStartDate] = useState(todayISO())
  const [startTime, setStartTime] = useState('10:00')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (!open) return
    let alive = true
    Promise.all([
      apiFetch<{ id: string; name: string; species?: string | null; steps: unknown[] }[]>(
        '/vaccination-plans?active_only=true',
      ),
      apiFetch<{ id: string; name: string }[]>('/branches'),
      apiFetch<{ id: string; full_name: string; role: string }[]>('/users'),
    ])
      .then(([pl, br, us]) => {
        if (!alive) return
        setPlans(
          pl.filter(
            (p) =>
              p.steps.length > 0 && (species == null || p.species == null || p.species === species),
          ),
        )
        setBranches(br)
        setVets(us.filter((u) => u.role === 'admin' || u.role === 'veterinario'))
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [open, species])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!planId || !branchId) {
      setError('Selecciona el plan y la sucursal.')
      return
    }
    setSubmitting(true)
    try {
      await apiFetch('/vaccination-plans/assign', {
        method: 'POST',
        body: JSON.stringify({
          pet_id: petId,
          plan_id: planId,
          branch_id: branchId,
          vet_user_id: vetId || null,
          start_date: startDate,
          start_time: `${startTime}:00`,
          duration_minutes: 30,
        }),
      })
      setPlanId('')
      setBranchId('')
      setVetId('')
      toast({
        title: 'Plan asignado',
        description: `El plan de vacunación quedó asignado a ${petName}. Las dosis y citas se generaron en la agenda.`,
        variant: 'success',
      })
      onAssigned()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo asignar el plan')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Syringe className="size-5 text-primary" aria-hidden="true" /> Asignar plan de
            vacunación
          </DialogTitle>
          <DialogDescription>
            {petName} · Se generarán las dosis del esquema y una cita por dosis en la agenda.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4">
          <div className="space-y-2">
            <Label>Plan *</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecciona un plan" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.steps.length} dosis)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Sucursal *</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecciona una sucursal" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Veterinario responsable (opcional)</Label>
            <Select value={vetId} onValueChange={setVetId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sin asignar" />
              </SelectTrigger>
              <SelectContent>
                {vets.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Fecha de inicio</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Hora</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : <CalendarDays />} Asignar plan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
