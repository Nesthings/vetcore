import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BedDouble,
  CalendarClock,
  Loader2,
  PawPrint,
  Plus,
  Search,
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
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { StatChip } from '@/components/ui/stat-chip'
import { useToast } from '@/components/ui/toast'
import { apiFetch } from '@/lib/api'
import {
  ISOLATION_META,
  MONITORING_LABELS,
  OPERATIONAL_META,
  STATUS_META,
  elapsedLabel,
} from '@/lib/hospitalization'
import type {
  Accommodation,
  HospitalizationItem,
  HospStatus,
} from '@/lib/hospitalization'

interface Branch {
  id: string
  name: string
}

const ACTIVE_STATUSES: HospStatus[] = ['planned', 'admitted', 'active', 'discharge_pending']

export function Hospitalizacion() {
  const [items, setItems] = useState<HospitalizationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [branches, setBranches] = useState<Branch[]>([])
  const [branchId, setBranchId] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [search, setSearch] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [spacesOpen, setSpacesOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (branchId) params.set('branch_id', branchId)
      if (search.trim()) params.set('search', search.trim())
      setItems(await apiFetch<HospitalizationItem[]>(`/hospitalization/hospitalizations?${params}`))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las hospitalizaciones')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, branchId, search])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    apiFetch<Branch[]>('/branches')
      .then((b) => {
        setBranches(b)
        setBranchId((cur) => cur || b[0]?.id || '')
      })
      .catch(() => undefined)
  }, [])

  const summary = useMemo(() => {
    const active = items.filter((i) => ACTIVE_STATUSES.includes(i.status))
    return {
      activos: active.length,
      criticos: active.filter((i) => i.operational_status === 'critical').length,
      vigilancia: active.filter((i) => i.operational_status === 'monitoring').length,
      alta_pendiente: active.filter((i) => i.status === 'discharge_pending').length,
      aislamiento: active.filter((i) => i.isolation_status !== 'normal').length,
    }
  }, [items])

  const visibleStatuses = statusFilter === 'active' ? ACTIVE_STATUSES : [statusFilter as HospStatus]

  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hospitalización</h1>
          <p className="text-sm text-muted-foreground">Pacientes internados, espacios y operación</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setSpacesOpen(true)}>
            <BedDouble /> Espacios
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus /> Nueva hospitalización
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <StatChip label="Hospitalizados" value={summary.activos} icon={BedDouble} tint="bg-primary/10 text-primary" />
        <StatChip label="Críticos" value={summary.criticos} icon={Stethoscope} tint="bg-destructive/10 text-destructive" />
        <StatChip label="En vigilancia" value={summary.vigilancia} icon={CalendarClock} tint="bg-info/10 text-info" />
        <StatChip label="Alta pendiente" value={summary.alta_pendiente} icon={PawPrint} tint="bg-warning/10 text-warning" />
        <StatChip label="Aislamiento" value={summary.aislamiento} icon={Stethoscope} tint="bg-orange-500/10 text-orange-600 dark:text-orange-300" />
      </div>

      <div className="mb-6 flex flex-col gap-2 sm:flex-row">
        <select
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Todas las sucursales</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="active">Activos</option>
          <option value="planned">Planeadas</option>
          <option value="admitted">Admitidos</option>
          <option value="discharge_pending">Alta pendiente</option>
          <option value="discharged">Dados de alta</option>
          <option value="cancelled">Canceladas</option>
        </select>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por paciente…"
            className="pl-9"
          />
        </div>
      </div>

      {error && <ErrorState description={error} onRetry={load} className="mb-6" />}
      {loading && <LoadingState label="Cargando hospitalizaciones…" />}

      {!loading && !error && (
        <>
          {items.length === 0 ? (
            <EmptyState
              title="Sin hospitalizaciones"
              description="No hay pacientes internados con estos filtros."
              icon={BedDouble}
            />
          ) : (
            <div className="space-y-3">
              {items
                .filter((i) => visibleStatuses.includes(i.status))
                .map((h) => {
                  const op = OPERATIONAL_META[h.operational_status]
                  const iso = ISOLATION_META[h.isolation_status]
                  return (
                    <Link
                      key={h.id}
                      to={`/hospitalizacion/${h.id}`}
                      className="block rounded-xl border border-border/60 bg-card p-3.5 shadow-sm transition-colors hover:bg-accent"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-border bg-secondary text-lg font-semibold text-primary">
                          {h.pet?.photo_url ? (
                            <img src={h.pet.photo_url} alt={h.pet.name} className="size-full object-cover" />
                          ) : (
                            <PawPrint className="size-5" aria-hidden="true" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">{h.pet?.name ?? 'Paciente'}</p>
                            <Badge variant={STATUS_META[h.status].badge}>{STATUS_META[h.status].label}</Badge>
                            <Badge variant={op.badge}>{op.label}</Badge>
                            {h.isolation_status !== 'normal' && (
                              <Badge variant="destructive">
                                <span className="mr-1 size-1.5 rounded-full bg-destructive" /> {iso.label}
                              </Badge>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                            <span className="capitalize">{h.pet?.species ?? ''}{h.pet?.breed ? ` · ${h.pet.breed}` : ''}</span>
                            {h.accommodation && (
                              <span className="inline-flex items-center gap-1">
                                <BedDouble className="size-3.5" /> {h.accommodation.code}
                              </span>
                            )}
                            {h.vet && (
                              <span className="inline-flex items-center gap-1">
                                <UserRound className="size-3.5" /> {h.vet.full_name}
                              </span>
                            )}
                            {h.pet?.latest_weight_kg != null && (
                              <span className="inline-flex items-center gap-1">
                                <Weight className="size-3.5" /> {h.pet.latest_weight_kg} kg
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1">
                              <CalendarClock className="size-3.5" /> {elapsedLabel(h.elapsed_minutes)}
                            </span>
                            {h.monitoring_level && (
                              <span>{MONITORING_LABELS[h.monitoring_level]}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  )
                })}
            </div>
          )}
        </>
      )}

      <CreateHospitalizationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        branches={branches}
        onSaved={() => {
          setCreateOpen(false)
          load()
        }}
      />

      <SpacesDialog
        open={spacesOpen}
        onOpenChange={setSpacesOpen}
        branches={branches}
        branchId={branchId}
        onChanged={() => load()}
      />
    </AppLayout>
  )
}

// ---------------------------------------------------------------------------
// Crear hospitalización
// ---------------------------------------------------------------------------

function CreateHospitalizationDialog({
  open,
  onOpenChange,
  branches,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  branches: Branch[]
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [petQuery, setPetQuery] = useState('')
  const [petResults, setPetResults] = useState<{ id: string; name: string; species: string }[]>([])
  const [petId, setPetId] = useState('')
  const [petName, setPetName] = useState('')
  const [branchId, setBranchId] = useState('')
  const [accommodationId, setAccommodationId] = useState('')
  const [vetUserId, setVetUserId] = useState('')
  const [reason, setReason] = useState('')
  const [monitoring, setMonitoring] = useState('basic')
  const [operational, setOperational] = useState('stable')
  const [isolation, setIsolation] = useState('normal')
  const [accommodations, setAccommodations] = useState<Accommodation[]>([])
  const [vets, setVets] = useState<{ id: string; full_name: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setPetQuery('')
    setPetResults([])
    setPetId('')
    setPetName('')
    setBranchId(branches[0]?.id ?? '')
    setAccommodationId('')
    setVetUserId('')
    setReason('')
    setMonitoring('basic')
    setOperational('stable')
    setIsolation('normal')
    setError(null)
    apiFetch<{ id: string; full_name: string; role: string }[]>('/users')
      .then((u) => setVets(u.filter((x) => x.role === 'admin' || x.role === 'veterinario')))
      .catch(() => undefined)
  }, [open, branches])

  useEffect(() => {
    if (!open || !branchId) return
    apiFetch<Accommodation[]>(`/hospitalization/accommodations?branch_id=${branchId}`)
      .then(setAccommodations)
      .catch(() => setAccommodations([]))
  }, [open, branchId])

  const searchPet = async () => {
    if (petQuery.trim().length < 2) return
    try {
      const res = await apiFetch<{ id: string; name: string; species: string }[]>(
        `/pets?search=${encodeURIComponent(petQuery.trim())}`,
      )
      setPetResults(res)
    } catch {
      setPetResults([])
    }
  }

  const submit = async () => {
    setError(null)
    if (!petId || !branchId) {
      setError('Selecciona el paciente y la sucursal.')
      return
    }
    setBusy(true)
    try {
      await apiFetch('/hospitalization/hospitalizations', {
        method: 'POST',
        body: JSON.stringify({
          pet_id: petId,
          branch_id: branchId,
          status: 'admitted',
          accommodation_id: accommodationId || null,
          vet_user_id: vetUserId || null,
          reason: reason || null,
          monitoring_level: monitoring,
          operational_status: operational,
          isolation_status: isolation,
        }),
      })
      toast({ title: 'Hospitalización creada', description: `${petName} fue admitido.`, variant: 'success' })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la hospitalización')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva hospitalización</DialogTitle>
          <DialogDescription>Admite a un paciente a hospitalización.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label>Paciente *</Label>
            <div className="flex gap-2">
              <Input value={petQuery} onChange={(e) => setPetQuery(e.target.value)} placeholder="Escribe para buscar…" />
              <Button type="button" variant="outline" onClick={searchPet}>
                <Search /> Buscar
              </Button>
            </div>
            {petResults.length > 0 && (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-1">
                {petResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPetId(p.id)
                      setPetName(p.name)
                      setPetResults([])
                      setPetQuery(p.name)
                    }}
                    className="block w-full rounded px-2 py-1.5 text-left text-sm capitalize hover:bg-accent"
                  >
                    {p.name} · {p.species}
                  </button>
                ))}
              </div>
            )}
            {petName && (
              <p className="text-xs text-success">Paciente seleccionado: {petName}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Sucursal *</Label>
              <select
                value={branchId}
                onChange={(e) => {
                  setBranchId(e.target.value)
                  setAccommodationId('')
                }}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Espacio</Label>
              <select
                value={accommodationId}
                onChange={(e) => setAccommodationId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Sin asignar —</option>
                {accommodations.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Veterinario responsable</Label>
              <select
                value={vetUserId}
                onChange={(e) => setVetUserId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Sin asignar —</option>
                {vets.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Monitorización</Label>
              <select
                value={monitoring}
                onChange={(e) => setMonitoring(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="basic">Básico</option>
                <option value="intermediate">Intermedio</option>
                <option value="intensive">Intensivo</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Estado operativo</Label>
              <select
                value={operational}
                onChange={(e) => setOperational(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="stable">Estable</option>
                <option value="monitoring">Vigilancia</option>
                <option value="delicate">Delicado</option>
                <option value="critical">Crítico</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Aislamiento</Label>
              <select
                value={isolation}
                onChange={(e) => setIsolation(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="normal">Normal</option>
                <option value="precaution">Precaución</option>
                <option value="isolation">Aislamiento</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Motivo de internamiento</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Observación postoperatoria" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Plus />} Admitir paciente
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Espacios / jaulas
// ---------------------------------------------------------------------------

function SpacesDialog({
  open,
  onOpenChange,
  branches,
  branchId,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  branches: Branch[]
  branchId: string
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [accommodations, setAccommodations] = useState<Accommodation[]>([])
  const [selBranch, setSelBranch] = useState(branchId)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState('general')
  const [capacity, setCapacity] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSpaces = async (b: string) => {
    try {
      setAccommodations(
        await apiFetch<Accommodation[]>(`/hospitalization/accommodations?branch_id=${b}&include_inactive=true`),
      )
    } catch {
      setAccommodations([])
    }
  }

  useEffect(() => {
    if (!open) return
    setSelBranch(branchId)
    setCode('')
    setName('')
    setType('general')
    setCapacity(1)
    setError(null)
    loadSpaces(branchId)
  }, [open, branchId])

  const create = async () => {
    setError(null)
    if (!selBranch || !code.trim() || !name.trim()) {
      setError('Código, nombre y sucursal son obligatorios.')
      return
    }
    setBusy(true)
    try {
      await apiFetch('/hospitalization/accommodations', {
        method: 'POST',
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          branch_id: selBranch,
          type,
          capacity,
          status: 'available',
          max_isolation: 'normal',
        }),
      })
      toast({ title: 'Espacio creado', description: `${code.trim()} listo.`, variant: 'success' })
      setCode('')
      setName('')
      await loadSpaces(selBranch)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el espacio')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Espacios / Jaulas</DialogTitle>
          <DialogDescription>Gestiona los espacios de hospitalización por sucursal.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Sucursal</Label>
            <select
              value={selBranch}
              onChange={(e) => {
                setSelBranch(e.target.value)
                loadSpaces(e.target.value)
              }}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Código *</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="J1" />
            </div>
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jaula 1" />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <select value={type} onChange={(e) => setType(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="general">General</option>
                <option value="uci">UCI</option>
                <option value="isolation">Aislamiento</option>
                <option value="recovery">Recuperación</option>
                <option value="postop">Postoperatorio</option>
                <option value="other">Otro</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Capacidad</Label>
              <Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value) || 1)} />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={create} disabled={busy} className="w-full">
            {busy ? <Loader2 className="animate-spin" /> : <Plus />} Agregar espacio
          </Button>

          <div className="space-y-1.5">
            {accommodations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin espacios en esta sucursal.</p>
            ) : (
              accommodations.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">
                      {a.code} · {a.name}
                    </p>
                    <p className="text-xs capitalize text-muted-foreground">
                      {a.type} · capacidad {a.capacity} · {a.status}
                    </p>
                  </div>
                  <Badge variant={a.active ? 'success' : 'secondary'}>{a.active ? 'Activo' : 'Inactivo'}</Badge>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
