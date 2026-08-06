import { useCallback, useEffect, useState } from 'react'
import { Eye, LogOut, Plus, ShieldCheck } from 'lucide-react'

import { ClinicDetailDialog } from '@/components/superadmin/ClinicDetailDialog'
import { ClinicFormDialog } from '@/components/superadmin/ClinicFormDialog'
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
import { useAuth } from '@/lib/auth'

export interface Clinic {
  id: string
  name: string
  contact_name?: string | null
  contact_phone?: string | null
  contact_email?: string | null
  subscription_status: string
  created_at: string
}

const STATUS: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }
> = {
  active: { label: 'Activa', variant: 'success' },
  trial: { label: 'Prueba', variant: 'warning' },
  suspended: { label: 'Suspendida', variant: 'destructive' },
  cancelled: { label: 'Cancelada', variant: 'secondary' },
}

export function SuperAdminPanel() {
  const { logout } = useAuth()
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<Clinic | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<Clinic[]>('/clinics')
      setClinics(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las clínicas')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const toggleStatus = async (clinic: Clinic) => {
    setBusyId(clinic.id)
    setError(null)
    try {
      const next =
        clinic.subscription_status === 'suspended' || clinic.subscription_status === 'cancelled'
          ? 'active'
          : 'suspended'
      await apiFetch(`/clinics/${clinic.id}/subscription`, {
        method: 'POST',
        body: JSON.stringify({ status: next }),
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el estado')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="size-4" aria-hidden="true" />
          </div>
          <span className="text-sm font-semibold">VetCore · Panel Super-Admin</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            logout()
            window.location.href = '/login'
          }}
        >
          <LogOut /> Cerrar sesión
        </Button>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Clínicas</h1>
            <p className="text-sm text-muted-foreground">Control de suscripciones de la red</p>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus /> Alta de clínica
          </Button>
        </div>

        {error && <ErrorState description={error} onRetry={load} className="mb-6" />}
        {loading && <LoadingState label="Cargando clínicas…" />}

        {!loading && !error && clinics.length === 0 && (
          <EmptyState
            title="Sin clínicas"
            description="Da de alta tu primera clínica."
            action={
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus /> Alta de clínica
              </Button>
            }
          />
        )}

        {!loading && !error && clinics.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Clínica</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clinics.map((c) => {
                  const st = STATUS[c.subscription_status] ?? {
                    label: c.subscription_status,
                    variant: 'secondary',
                  }
                  const isBlocked =
                    c.subscription_status === 'suspended' || c.subscription_status === 'cancelled'
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(c.created_at).toLocaleDateString('es-MX')}
                        </p>
                      </TableCell>
                      <TableCell>
                        {c.contact_name ?? '—'}
                        {c.contact_email ? (
                          <p className="text-xs text-muted-foreground">{c.contact_email}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Detalle ${c.name}`}
                          onClick={() => setSelected(c)}
                        >
                          <Eye />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId === c.id}
                          onClick={() => toggleStatus(c)}
                        >
                          {isBlocked ? 'Activar' : 'Suspender'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </main>

      <ClinicFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={() => {
          setCreateOpen(false)
          load()
        }}
      />

      {selected && (
        <ClinicDetailDialog
          clinic={selected}
          open={Boolean(selected)}
          onOpenChange={(o) => !o && setSelected(null)}
          onChanged={() => {
            setSelected(null)
            load()
          }}
        />
      )}
    </div>
  )
}
