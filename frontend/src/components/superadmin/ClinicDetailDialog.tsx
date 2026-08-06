import { useEffect, useState } from 'react'
import { Building2, FileText, History, PawPrint, Receipt, Users } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { apiFetch } from '@/lib/api'
import type { Clinic } from '@/pages/superadmin/SuperAdminPanel'

interface Summary {
  id: string
  name: string
  subscription_status: string
  branches: number
  staff: number
  pets: number
  appointments: number
  invoices: number
}

interface EventItem {
  id: string
  event_type: string
  notes?: string | null
  created_at: string
}

const EVENT_LABELS: Record<string, string> = {
  activated: 'Activada',
  suspended: 'Suspendida',
  cancelled: 'Cancelada',
  payment_received: 'Pago recibido',
}

function CountCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: number
}) {
  return (
    <div className="rounded-md border border-border bg-muted/40 p-3">
      <Icon className="mb-1 size-4 text-primary" aria-hidden="true" />
      <p className="text-xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

export function ClinicDetailDialog({
  clinic,
  open,
  onOpenChange,
  onChanged,
}: {
  clinic: Clinic
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [events, setEvents] = useState<EventItem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    Promise.all([
      apiFetch<Summary>(`/clinics/${clinic.id}/summary`),
      apiFetch<EventItem[]>(`/clinics/${clinic.id}/events`),
    ])
      .then(([s, e]) => {
        setSummary(s)
        setEvents(e)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el detalle'))
  }, [open, clinic.id])

  const toggle = async () => {
    setBusy(true)
    setError(null)
    try {
      const isBlocked =
        clinic.subscription_status === 'suspended' || clinic.subscription_status === 'cancelled'
      await apiFetch(`/clinics/${clinic.id}/subscription`, {
        method: 'POST',
        body: JSON.stringify({ status: isBlocked ? 'active' : 'suspended' }),
      })
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el estado')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{clinic.name}</DialogTitle>
          <DialogDescription>
            {clinic.contact_name ?? 'Sin contacto'} · {clinic.contact_email ?? '—'} ·{' '}
            {clinic.contact_phone ?? '—'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
            <span className="text-sm font-medium">
              Estado:{' '}
              <Badge
                variant={
                  clinic.subscription_status === 'active' || clinic.subscription_status === 'trial'
                    ? 'success'
                    : 'destructive'
                }
              >
                {clinic.subscription_status}
              </Badge>
            </span>
            <Button size="sm" variant="outline" disabled={busy} onClick={toggle}>
              {clinic.subscription_status === 'suspended' ||
              clinic.subscription_status === 'cancelled'
                ? 'Activar suscripción'
                : 'Suspender suscripción'}
            </Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {summary && (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              <CountCard icon={Building2} label="Sucursales" value={summary.branches} />
              <CountCard icon={Users} label="Staff" value={summary.staff} />
              <CountCard icon={PawPrint} label="Pacientes" value={summary.pets} />
              <CountCard icon={FileText} label="Citas" value={summary.appointments} />
              <CountCard icon={Receipt} label="Facturas" value={summary.invoices} />
            </div>
          )}

          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-medium">
              <History className="size-4 text-primary" aria-hidden="true" />
              Historial de suscripción
            </p>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin eventos registrados.</p>
            ) : (
              <div className="divide-y divide-border rounded-md border border-border">
                {events.map((e) => (
                  <div key={e.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="font-medium">
                      {EVENT_LABELS[e.event_type] ?? e.event_type}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {e.notes ? `${e.notes} · ` : ''}
                      {new Date(e.created_at).toLocaleString('es-MX', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
