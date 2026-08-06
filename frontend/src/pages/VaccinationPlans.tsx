import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, Syringe, Trash2 } from 'lucide-react'

import { AppLayout } from '@/components/layout/AppLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { apiFetch } from '@/lib/api'
import type { VaccinationPlan } from '@/lib/vaccination'

function stepsSummary(steps: VaccinationPlan['steps']): string {
  if (steps.length === 0) return 'Sin dosis'
  if (steps.length === 1) return '1 dosis'
  const parts = steps.slice(1).map((s) => {
    if (s.offset_days % 365 === 0)
      return `${s.offset_days / 365} año${s.offset_days / 365 > 1 ? 's' : ''}`
    if (s.offset_days % 30 === 0) return `${s.offset_days / 30} meses`
    return `${s.offset_days} días`
  })
  return `${steps.length} dosis · cada ${parts.join(' → ')}`
}

export function VaccinationPlans() {
  const [plans, setPlans] = useState<VaccinationPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<VaccinationPlan | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<VaccinationPlan[]>('/vaccination-plans')
      setPlans(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los planes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const remove = async (p: VaccinationPlan) => {
    if (!confirm(`¿Eliminar el plan "${p.name}"?`)) return
    try {
      await apiFetch(`/vaccination-plans/${p.id}`, { method: 'DELETE' })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el plan')
    }
  }

  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Planes de vacunación</h1>
          <p className="text-sm text-muted-foreground">
            Esquemas de vacunación que generan citas automáticas al asignarlos a una mascota
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

      {error && <ErrorState description={error} onRetry={load} className="mb-6" />}
      {loading && <LoadingState label="Cargando planes…" />}

      {!loading && !error && plans.length === 0 && (
        <EmptyState
          title="Sin planes de vacunación"
          description="Crea tu primer esquema (ej. vacuna quintuple) para poder asignarlo a las mascotas."
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
                <TableHead>Compuesto activo</TableHead>
                <TableHead>Esquema</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.compound}</TableCell>
                  <TableCell className="max-w-md">{stepsSummary(p.steps)}</TableCell>
                  <TableCell>
                    <Badge variant={p.active ? 'default' : 'outline'}>
                      {p.active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
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
    </AppLayout>
  )
}
