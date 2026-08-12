import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  BedDouble,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Pencil,
  Phone,
  Stethoscope,
  UserRound,
  Weight,
} from 'lucide-react'

import { AppLayout } from '@/components/layout/AppLayout'
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
import { ErrorState } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { SectionHeading } from '@/components/ui/section-heading'
import { useToast } from '@/components/ui/toast'
import { apiFetch } from '@/lib/api'
import {
  ISOLATION_META,
  MONITORING_LABELS,
  OPERATIONAL_META,
  STATUS_META,
  elapsedLabel,
} from '@/lib/hospitalization'
import type { Accommodation, HospitalizationItem } from '@/lib/hospitalization'

export function HospitalizacionPaciente() {
  const { id } = useParams()
  const { toast } = useToast()
  const [data, setData] = useState<HospitalizationItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      setData(await apiFetch<HospitalizationItem>(`/hospitalization/hospitalizations/${id}`))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la hospitalización')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const action = async (path: string, label: string, successMsg: string) => {
    setBusy(true)
    try {
      await apiFetch(`/hospitalization/hospitalizations/${id}/${path}`, { method: 'POST' })
      toast({ title: label, description: successMsg, variant: 'success' })
      await load()
    } catch (err) {
      toast({
        title: 'No se pudo actualizar',
        description: err instanceof Error ? err.message : 'Intenta de nuevo.',
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <LoadingState label="Cargando hospitalización…" />
      </AppLayout>
    )
  }

  if (error || !data) {
    return (
      <AppLayout>
        <ErrorState description={error ?? 'Hospitalización no encontrada'} onRetry={load} />
      </AppLayout>
    )
  }

  const op = OPERATIONAL_META[data.operational_status]
  const iso = ISOLATION_META[data.isolation_status]
  const statusMeta = STATUS_META[data.status]

  return (
    <AppLayout>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          to="/hospitalizacion"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Hospitalización
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} disabled={busy}>
            <Pencil /> Editar
          </Button>
          {data.status === 'planned' && (
            <Button size="sm" disabled={busy} onClick={() => action('admit', 'Admitido', 'Paciente admitido.')}>
              Admitir
            </Button>
          )}
          {data.status === 'admitted' && (
            <Button size="sm" disabled={busy} onClick={() => action('activate', 'Activo', 'Hospitalización activa.')}>
              Activar
            </Button>
          )}
          {(data.status === 'active' || data.status === 'admitted') && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => action('request-discharge', 'Alta solicitada', 'Alta pendiente de completar.')}>
              Solicitar alta
            </Button>
          )}
          {data.status === 'discharge_pending' && (
            <Button size="sm" variant="success" disabled={busy} onClick={() => action('complete-discharge', 'Dado de alta', 'Paciente dado de alta.')}>
              <CheckCircle2 /> Completar alta
            </Button>
          )}
          {(data.status === 'planned' || data.status === 'admitted' || data.status === 'active') && (
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => action('cancel', 'Cancelada', 'Hospitalización cancelada.')}>
              Cancelar
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex size-20 items-center justify-center overflow-hidden rounded-full border-2 border-border bg-secondary text-2xl font-semibold text-primary">
            {data.pet?.photo_url ? (
              <img src={data.pet.photo_url} alt={data.pet?.name} className="size-full object-cover" />
            ) : (
              <Stethoscope className="size-8" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{data.pet?.name ?? 'Paciente'}</h1>
              <Badge variant={statusMeta.badge}>{statusMeta.label}</Badge>
              <Badge variant={op.badge}>{op.label}</Badge>
              {data.isolation_status !== 'normal' && (
                <Badge variant="destructive">
                  <span className="mr-1 size-1.5 rounded-full bg-destructive" /> {iso.label}
                </Badge>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
              <span className="capitalize">
                {data.pet?.species ?? ''}
                {data.pet?.breed ? ` · ${data.pet.breed}` : ''}
              </span>
              {data.pet?.latest_weight_kg != null && (
                <span className="inline-flex items-center gap-1">
                  <Weight className="size-4" /> {data.pet.latest_weight_kg} kg
                </span>
              )}
              {data.accommodation && (
                <span className="inline-flex items-center gap-1">
                  <BedDouble className="size-4" /> {data.accommodation.code} · {data.accommodation.name}
                </span>
              )}
              {data.vet && (
                <span className="inline-flex items-center gap-1">
                  <UserRound className="size-4" /> {data.vet.full_name}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-4" /> Hospitalizado {elapsedLabel(data.elapsed_minutes)}
              </span>
              {data.monitoring_level && <span>Monitorización: {MONITORING_LABELS[data.monitoring_level]}</span>}
            </div>
          </div>
          <div className="flex flex-col gap-1 text-sm">
            {data.owner && (
              <>
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <UserRound className="size-4 text-primary" /> {data.owner.full_name ?? 'Dueño'}
                </span>
                {data.owner.phone && (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Phone className="size-4 text-primary" /> {data.owner.phone}
                  </span>
                )}
              </>
            )}
            {data.pet && (
              <Button asChild variant="link" size="sm" className="h-auto justify-start px-0">
                <Link to={`/pets/${data.pet.id}`}>Ver expediente del paciente</Link>
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Ingreso</p>
            <p className="text-sm font-medium">
              {data.admitted_at ? new Date(data.admitted_at).toLocaleString('es-MX') : '—'}
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Alta estimada</p>
            <p className="text-sm font-medium">
              {data.expected_discharge_at
                ? new Date(data.expected_discharge_at).toLocaleString('es-MX')
                : '—'}
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Alta real</p>
            <p className="text-sm font-medium">
              {data.actual_discharge_at ? new Date(data.actual_discharge_at).toLocaleString('es-MX') : '—'}
            </p>
          </div>
        </div>

        {(data.reason || data.diagnosis || data.notes) && (
          <div className="mt-4 space-y-3">
            {data.reason && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Motivo</p>
                <p className="text-sm">{data.reason}</p>
              </div>
            )}
            {data.diagnosis && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Diagnóstico</p>
                <p className="text-sm">{data.diagnosis}</p>
              </div>
            )}
            {data.notes && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notas</p>
                <p className="text-sm whitespace-pre-wrap">{data.notes}</p>
              </div>
            )}
          </div>
        )}

        <div className="mt-6">
          <SectionHeading icon={BedDouble} title="Siguientes módulos" subtitle="Tareas, signos vitales, medicamentos y evolución llegarán en los próximos hitos." />
        </div>
      </div>

      <EditHospitalizationDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        data={data}
        onSaved={() => {
          setEditOpen(false)
          load()
        }}
      />
    </AppLayout>
  )
}

function EditHospitalizationDialog({
  open,
  onOpenChange,
  data,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: HospitalizationItem
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [reason, setReason] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [notes, setNotes] = useState('')
  const [monitoring, setMonitoring] = useState('')
  const [operational, setOperational] = useState('')
  const [isolation, setIsolation] = useState('')
  const [expected, setExpected] = useState('')
  const [accommodationId, setAccommodationId] = useState('')
  const [vetUserId, setVetUserId] = useState('')
  const [accommodations, setAccommodations] = useState<Accommodation[]>([])
  const [vets, setVets] = useState<{ id: string; full_name: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setReason(data.reason ?? '')
    setDiagnosis(data.diagnosis ?? '')
    setNotes(data.notes ?? '')
    setMonitoring(data.monitoring_level ?? 'basic')
    setOperational(data.operational_status)
    setIsolation(data.isolation_status)
    setExpected(data.expected_discharge_at ? data.expected_discharge_at.slice(0, 16) : '')
    setAccommodationId(data.accommodation_id ?? '')
    setVetUserId(data.vet_user_id ?? '')
    setError(null)
    apiFetch<Accommodation[]>(`/hospitalization/accommodations?branch_id=${data.branch_id}`)
      .then(setAccommodations)
      .catch(() => undefined)
    apiFetch<{ id: string; full_name: string; role: string }[]>('/users')
      .then((u) => setVets(u.filter((x) => x.role === 'admin' || x.role === 'veterinario')))
      .catch(() => undefined)
  }, [open, data])

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await apiFetch(`/hospitalization/hospitalizations/${data.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          reason: reason || null,
          diagnosis: diagnosis || null,
          notes: notes || null,
          monitoring_level: monitoring,
          operational_status: operational,
          isolation_status: isolation,
          expected_discharge_at: expected ? new Date(expected).toISOString() : null,
          accommodation_id: accommodationId || null,
          vet_user_id: vetUserId || null,
        }),
      })
      toast({ title: 'Guardado', description: 'Hospitalización actualizada.', variant: 'success' })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar hospitalización</DialogTitle>
          <DialogDescription>Actualiza el expediente de internamiento.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Espacio</Label>
              <select value={accommodationId} onChange={(e) => setAccommodationId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">— Sin asignar —</option>
                {accommodations.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Veterinario responsable</Label>
              <select value={vetUserId} onChange={(e) => setVetUserId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">— Sin asignar —</option>
                {vets.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Monitorización</Label>
              <select value={monitoring} onChange={(e) => setMonitoring(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="basic">Básico</option>
                <option value="intermediate">Intermedio</option>
                <option value="intensive">Intensivo</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Operativo</Label>
              <select value={operational} onChange={(e) => setOperational(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="stable">Estable</option>
                <option value="monitoring">Vigilancia</option>
                <option value="delicate">Delicado</option>
                <option value="critical">Crítico</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Aislamiento</Label>
              <select value={isolation} onChange={(e) => setIsolation(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="normal">Normal</option>
                <option value="precaution">Precaución</option>
                <option value="isolation">Aislamiento</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Alta estimada</Label>
            <Input type="datetime-local" value={expected} onChange={(e) => setExpected(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Motivo</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Diagnóstico</Label>
            <Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Notas</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Pencil />} Guardar
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
