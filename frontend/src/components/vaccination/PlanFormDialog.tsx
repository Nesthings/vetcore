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
import { Textarea } from '@/components/ui/textarea'
import { apiFetch } from '@/lib/api'
import type { VaccinationPlan } from '@/lib/vaccination'

interface StepDraft {
  label: string
  value: string
  unit: 'dias' | 'meses' | 'anos'
}

type Unit = StepDraft['unit']

const toDays = (step: StepDraft): number => {
  const value = Number(step.value) || 0
  if (step.unit === 'anos') return value * 365
  if (step.unit === 'meses') return value * 30
  return value
}

const fromDays = (days: number): { value: string; unit: Unit } => {
  if (days > 0 && days % 365 === 0) return { value: String(days / 365), unit: 'anos' }
  if (days > 0 && days % 30 === 0) return { value: String(days / 30), unit: 'meses' }
  return { value: String(days), unit: 'dias' }
}

const emptyStep = (): StepDraft => ({ label: '', value: '', unit: 'meses' })

export function PlanFormDialog({
  open,
  plan,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  plan: VaccinationPlan | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [compound, setCompound] = useState('')
  const [notes, setNotes] = useState('')
  const [active, setActive] = useState(true)
  const [steps, setSteps] = useState<StepDraft[]>([emptyStep()])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(plan?.name ?? '')
    setCompound(plan?.compound ?? '')
    setNotes(plan?.notes ?? '')
    setActive(plan?.active ?? true)
    if (plan && plan.steps.length > 0) {
      setSteps(
        plan.steps.map((s, i) => {
          const conv = fromDays(s.offset_days)
          return {
            label: s.label,
            value: i === 0 ? '0' : conv.value,
            unit: i === 0 ? 'dias' : conv.unit,
          }
        }),
      )
    } else {
      setSteps([emptyStep()])
    }
    setError(null)
  }, [open, plan])

  const updateStep = (idx: number, patch: Partial<StepDraft>) => {
    setSteps((list) => list.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (steps.length === 0 || !steps[0].label.trim()) {
      setError('Define al menos la primera dosis del plan.')
      return
    }
    for (let i = 1; i < steps.length; i++) {
      if (toDays(steps[i]) <= 0) {
        setError('Cada dosis debe tener un intervalo mayor a cero.')
        return
      }
    }
    setSubmitting(true)
    try {
      const body = JSON.stringify({
        name,
        compound,
        notes: notes || null,
        active,
        steps: steps.map((s, i) => ({
          label: s.label,
          offset_days: i === 0 ? 0 : toDays(s),
        })),
      })
      if (plan) {
        await apiFetch(`/vaccination-plans/${plan.id}`, { method: 'PATCH', body })
      } else {
        await apiFetch('/vaccination-plans', { method: 'POST', body })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el plan')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {plan ? 'Editar plan de vacunación' : 'Nuevo plan de vacunación'}
          </DialogTitle>
          <DialogDescription>
            Define el esquema: cada dosis con su intervalo respecto a la anterior. La primera se
            agenda en la fecha de asignación.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vp-name">Nombre *</Label>
              <Input
                id="vp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Vacuna quintuple"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vp-compound">Compuesto activo *</Label>
              <Input
                id="vp-compound"
                value={compound}
                onChange={(e) => setCompound(e.target.value)}
                placeholder="Quintuple canina"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vp-notes">Notas</Label>
            <Textarea
              id="vp-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Esquema para cachorros, refuerzos, observaciones…"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Dosis del esquema</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setSteps((s) => [...s, emptyStep()])}
              >
                <Plus /> Agregar dosis
              </Button>
            </div>
            <div className="space-y-2">
              {steps.map((s, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 rounded-md border border-border p-2"
                >
                  <Input
                    className="flex-1"
                    placeholder={
                      idx === 0 ? '1ª dosis (fecha de asignación)' : 'Ej. Refuerzo anual'
                    }
                    value={s.label}
                    onChange={(e) => updateStep(idx, { label: e.target.value })}
                    required
                  />
                  <Input
                    type="number"
                    min="0"
                    className="w-24"
                    placeholder="Cada"
                    value={s.value}
                    disabled={idx === 0}
                    onChange={(e) => updateStep(idx, { value: e.target.value })}
                    required
                  />
                  <select
                    className="h-9 w-28 rounded-md border border-input bg-background px-2 text-sm"
                    value={s.unit}
                    disabled={idx === 0}
                    onChange={(e) => updateStep(idx, { unit: e.target.value as Unit })}
                  >
                    <option value="dias">días</option>
                    <option value="meses">meses</option>
                    <option value="anos">años</option>
                  </select>
                  {steps.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Quitar dosis"
                      onClick={() => setSteps((list) => list.filter((_, i) => i !== idx))}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              La primera dosis se agenda el día de la asignación; las siguientes suman el intervalo
              de la dosis anterior (ej. 0, +2 meses, +2 meses, +1 año).
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="size-4 rounded border-border"
            />
            Plan activo (disponible para asignar a mascotas)
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : 'Guardar plan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
