import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, Syringe, Trash2 } from 'lucide-react'

import { AppLayout } from '@/components/layout/AppLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { LoadingState } from '@/components/ui/loading-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PlanFormDialog } from '@/components/vaccination/PlanFormDialog'
import { PlanViewDialog } from '@/components/vaccination/PlanViewDialog'
import { apiFetch } from '@/lib/api'
import { speciesLabel } from '@/lib/species'
import { cn } from '@/lib/utils'
import { humanizeLapso, type VaccinationPlan } from '@/lib/vaccination'

const SPECIES_ORDER = ['perro', 'gato', 'equino', 'hurones', 'conejo']

function stepsSummary(steps: VaccinationPlan['steps']): string {
  if (steps.length === 0) return 'Sin dosis'
  if (steps.length === 1) return '1 dosis'
  const parts = steps.slice(1).map((s) => humanizeLapso(s.offset_days))
  return `${steps.length} dosis · cada ${parts.join(' → ')}`
}

export function VaccinationPlans() {
  const [plans, setPlans] = useState<VaccinationPlan[]>([])
  const [speciesFilter, setSpeciesFilter] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<VaccinationPlan | null>(null)
  const [viewing, setViewing] = useState<VaccinationPlan | null>(null)
  const [confirm, setConfirm] = useState<{ title: string; onConfirm: () => void } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (speciesFilter) params.set('species', speciesFilter)
      const res = await apiFetch<VaccinationPlan[]>(`/vaccination-plans?${params}`)
      setPlans(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los planes')
    } finally {
      setLoading(false)
    }
  }, [speciesFilter])

  useEffect(() => {
    load()
  }, [load])

  const remove = async (p: VaccinationPlan) => {
    setConfirm({
      title: `¿Eliminar el plan "${p.name}"?`,
      onConfirm: async () => {
        try {
          await apiFetch(`/vaccination-plans/${p.id}`, { method: 'DELETE' })
          load()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'No se pudo eliminar el plan')
        }
        setConfirm(null)
      },
    })
  }

  const speciesInPlans = [
    ...new Set(plans.map((p) => p.species).filter((s): s is string => Boolean(s))),
  ].sort((a, b) => {
    const ia = SPECIES_ORDER.indexOf(a)
    const ib = SPECIES_ORDER.indexOf(b)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })

  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Planes de vacunación</h1>
          <p className="text-sm text-muted-foreground">
            Esquemas estándar y personalizados por especie; se editan aquí y alimentan el carnet de
            la cartilla
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus /> Nuevo plan
        </Button>
      </div>

      {speciesInPlans.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Especie
          </span>
          <button
            type="button"
            onClick={() => setSpeciesFilter(null)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              !speciesFilter
                ? 'border-primary bg-primary text-primary-foreground shadow-glow'
                : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            Todas
          </button>
          {speciesInPlans.map((sp) => (
            <button
              key={sp}
              type="button"
              onClick={() => setSpeciesFilter(speciesFilter === sp ? null : sp)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium capitalize transition-colors',
                speciesFilter === sp
                  ? 'border-primary bg-primary text-primary-foreground shadow-glow'
                  : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {speciesLabel(sp)}
            </button>
          ))}
        </div>
      )}

      {error && <ErrorState description={error} onRetry={load} className="mb-6" />}
      {loading && <LoadingState label="Cargando planes…" />}

      {!loading && !error && plans.length === 0 && (
        <EmptyState
          title="Sin planes de vacunación"
          description="Crea tu primer esquema o deja que se siembren los estándar para esta especie."
          icon={Syringe}
          action={
            <Button
              size="sm"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus /> Nuevo plan
            </Button>
          }
        />
      )}

      {!loading && !error && plans.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Especie</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead>Esquema</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => setViewing(p)}>
                  <TableCell className="font-medium">
                    {p.name}
                    {p.is_standard && (
                      <Badge variant="outline" className="ml-2 bg-primary/5 text-primary">
                        Estándar
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="capitalize">
                    {p.species ? speciesLabel(p.species) : '—'}
                  </TableCell>
                  <TableCell>{p.brand ?? '—'}</TableCell>
                  <TableCell className="max-w-md">{stepsSummary(p.steps)}</TableCell>
                  <TableCell>
                    <Badge variant={p.active ? 'default' : 'outline'}>
                      {p.active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Editar ${p.name}`}
                      onClick={() => {
                        setEditing(p)
                        setFormOpen(true)
                      }}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Eliminar ${p.name}`}
                      className="text-destructive"
                      onClick={() => remove(p)}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PlanFormDialog
        open={formOpen}
        plan={editing}
        onOpenChange={setFormOpen}
        onSaved={() => {
          setFormOpen(false)
          setEditing(null)
          load()
        }}
      />

      <PlanViewDialog
        plan={viewing}
        open={Boolean(viewing)}
        onOpenChange={(open) => {
          if (!open) setViewing(null)
        }}
        onEdit={() => {
          setEditing(viewing)
          setViewing(null)
          setFormOpen(true)
        }}
      />

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm?.title ?? ''}
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={() => confirm?.onConfirm()}
      />
    </AppLayout>
  )
}
