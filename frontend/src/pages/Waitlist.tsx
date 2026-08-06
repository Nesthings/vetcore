import { useCallback, useEffect, useState } from 'react'
import { Plus, Timer } from 'lucide-react'

import { AppLayout } from '@/components/layout/AppLayout'
import { WaitlistFormDialog } from '@/components/waitlist/WaitlistFormDialog'
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
import { apiFetch } from '@/lib/api'

export interface WaitlistEntry {
  id: string
  pet_id: string
  pet_name?: string | null
  branch_name?: string | null
  desired_from: string
  desired_to: string
  status: string
  created_at: string
}

const STATUS: Record<
  string,
  { label: string; variant: 'secondary' | 'warning' | 'info' | 'success' }
> = {
  waiting: { label: 'En espera', variant: 'warning' },
  offered: { label: 'Hueco ofrecido', variant: 'info' },
  fulfilled: { label: 'Cumplida', variant: 'success' },
  expired: { label: 'Expirada', variant: 'secondary' },
}

export function Waitlist() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<WaitlistEntry[]>('/waitlist')
      setEntries(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la lista de espera')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const setStatus = async (id: string, status: string) => {
    setError(null)
    try {
      await apiFetch(`/waitlist/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar')
    }
  }

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar de la lista de espera?')) return
    try {
      await apiFetch(`/waitlist/${id}`, { method: 'DELETE' })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lista de espera</h1>
          <p className="text-sm text-muted-foreground">Pacientes esperando un hueco en la agenda</p>
        </div>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus /> Agregar a la lista
        </Button>
      </div>

      {error && <ErrorState description={error} onRetry={load} className="mb-6" />}
      {loading && <LoadingState label="Cargando lista de espera…" />}

      {!loading && !error && entries.length === 0 && (
        <EmptyState
          title="Lista de espera vacía"
          description="Agrega pacientes que buscan un hueco en la agenda."
          icon={Timer}
          action={
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus /> Agregar a la lista
            </Button>
          }
        />
      )}

      {!loading && !error && entries.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paciente</TableHead>
                <TableHead>Sucursal</TableHead>
                <TableHead>Ventana deseada</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => {
                const st = STATUS[e.status] ?? { label: e.status, variant: 'secondary' }
                return (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">
                      {e.pet_name ?? e.pet_id.slice(0, 8)}
                    </TableCell>
                    <TableCell>{e.branch_name ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(e.desired_from).toLocaleDateString('es-MX', {
                        day: 'numeric',
                        month: 'short',
                      })}{' '}
                      {new Date(e.desired_from).toLocaleTimeString('es-MX', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {' – '}
                      {new Date(e.desired_to).toLocaleTimeString('es-MX', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {e.status === 'waiting' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setStatus(e.id, 'offered')}
                        >
                          Ofrecer hueco
                        </Button>
                      )}
                      {e.status === 'offered' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setStatus(e.id, 'fulfilled')}
                        >
                          Cumplida
                        </Button>
                      )}
                      {e.status === 'waiting' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground"
                          onClick={() => setStatus(e.id, 'expired')}
                        >
                          Expirar
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive"
                        onClick={() => remove(e.id)}
                      >
                        ×
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <WaitlistFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={() => {
          setFormOpen(false)
          load()
        }}
      />
    </AppLayout>
  )
}
