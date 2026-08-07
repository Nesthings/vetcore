import { Fragment } from 'react'
import { Pencil, Syringe } from 'lucide-react'

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
import { speciesLabel } from '@/lib/species'
import type { VaccinationPlan } from '@/lib/vaccination'

function formatLapso(days: number): string {
  if (days === 0) return 'Día de la asignación'
  if (days % 365 === 0) return `${days / 365} año${days / 365 > 1 ? 's' : ''}`
  if (days % 30 === 0) return `${days / 30} meses`
  if (days % 15 === 0) return `${days / 15} quincenas`
  if (days % 7 === 0) return `${days / 7} semanas`
  return `${days} días`
}

export function PlanViewDialog({
  plan,
  open,
  onOpenChange,
  onEdit,
}: {
  plan: VaccinationPlan | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: () => void
}) {
  if (!plan) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <Syringe className="size-5 text-primary" aria-hidden="true" />
            {plan.name}
            {plan.is_standard && (
              <Badge variant="outline" className="bg-primary/5 text-primary">
                Estándar
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Esquema de vacunación{plan.species ? ` para ${speciesLabel(plan.species)}` : ' general'}
            .
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Especie</p>
              <p className="text-sm font-medium capitalize">
                {plan.species ? speciesLabel(plan.species) : 'General'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Marca</p>
              <p className="text-sm font-medium">{plan.brand ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Compuesto activo</p>
              <p className="text-sm font-medium">{plan.compound}</p>
            </div>
          </div>

          {plan.prevents && (
            <div>
              <p className="text-xs text-muted-foreground">Enfermedades que previene</p>
              <p className="text-sm font-medium">{plan.prevents}</p>
            </div>
          )}

          {plan.notes && (
            <div>
              <p className="text-xs text-muted-foreground">Esquema recomendado</p>
              <p className="text-sm font-medium">{plan.notes}</p>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs text-muted-foreground">Dosis ({plan.steps.length})</p>
            {plan.steps.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin dosis definidas.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-primary">
                        Dosis
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-primary">
                        Lapso
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.steps.map((s, i) => (
                      <Fragment key={i}>
                        <tr className="border-b border-border/60 last:border-0">
                          <td className="px-3 py-2 font-medium">{s.label}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {i === 0
                              ? 'Se agenda el día de la asignación'
                              : `Después de ${formatLapso(s.offset_days)}`}
                          </td>
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-sm">
            <span className="text-muted-foreground">Estado: </span>
            <Badge variant={plan.active ? 'default' : 'outline'}>
              {plan.active ? 'Activo' : 'Inactivo'}
            </Badge>
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button onClick={onEdit}>
            <Pencil /> Editar plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
