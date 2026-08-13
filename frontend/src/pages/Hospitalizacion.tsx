import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownUp,
  BedDouble,
  CalendarClock,
  Loader2,
  PawPrint,
  Plus,
  Search,
  Settings2,
  Stethoscope,
  UserRound,
  Weight,
} from 'lucide-react'

import { AppLayout } from '@/components/layout/AppLayout'
import { HospConfigDialog } from '@/components/hospitalizacion/HospConfigDialog'
import { ShiftDialog } from '@/components/hospitalizacion/ShiftDialog'
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
import { useAuth } from '@/lib/auth'
import {
  ACCOMMODATION_TYPE_LABELS,
  ISOLATION_META,
  MONITORING_LABELS,
  OPERATIONAL_META,
  STATUS_META,
  elapsedLabel,
} from '@/lib/hospitalization'
import type {
  Accommodation,
  HospitalizationItem,
  HospOverview,
  HospStatus,
  OperationalStatus,
} from '@/lib/hospitalization'

interface Branch {
  id: string
  name: string
}

const ACTIVE_STATUSES: HospStatus[] = ['planned', 'admitted', 'active', 'discharge_pending']

const SEVERITY_ORDER: Record<OperationalStatus, number> = {
  critical: 0,
  delicate: 1,
  monitoring: 2,
  stable: 3,
}

type SortKey = 'elapsed' | 'priority' | 'accommodation' | 'vet' | 'name'

export function Hospitalizacion() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [items, setItems] = useState<HospitalizationItem[]>([])
  const [overview, setOverview] = useState<HospOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [branches, setBranches] = useState<Branch[]>([])
  const [branchId, setBranchId] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [search, setSearch] = useState('')
  const [spaceFilter, setSpaceFilter] = useState('')
  const [vetFilter, setVetFilter] = useState('')
  const [monitoringFilter, setMonitoringFilter] = useState('')
  const [isolationFilter, setIsolationFilter] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('priority')

  const [createOpen, setCreateOpen] = useState(false)
  const [spacesOpen, setSpacesOpen] = useState(false)
  const [shiftOpen, setShiftOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)

  const loadOverview = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (branchId) params.set('branch_id', branchId)
      setOverview(await apiFetch<HospOverview>(`/hospitalization/overview?${params}`))
    } catch {
      setOverview(null)
    }
  }, [branchId])

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
    loadOverview()
  }, [loadOverview])

  useEffect(() => {
    apiFetch<Branch[]>('/branches')
      .then((b) => {
        setBranches(b)
        setBranchId((cur) => cur || b[0]?.id || '')
      })
      .catch(() => undefined)
  }, [])

  const summary = overview?.summary

  const visibleStatuses = statusFilter === 'active' ? ACTIVE_STATUSES : [statusFilter as HospStatus]

  const filtered = useMemo(() => {
    let list = items.filter((i) => visibleStatuses.includes(i.status))
    if (spaceFilter) list = list.filter((i) => i.accommodation_id === spaceFilter)
    if (vetFilter) list = list.filter((i) => i.vet_user_id === vetFilter)
    if (monitoringFilter) list = list.filter((i) => i.monitoring_level === monitoringFilter)
    if (isolationFilter)
      list = list.filter((i) => (isolationFilter === 'normal' ? i.isolation_status === 'normal' : i.isolation_status === isolationFilter))
    const sorted = [...list]
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return (a.pet?.name ?? '').localeCompare(b.pet?.name ?? '')
        case 'elapsed':
          return b.elapsed_minutes - a.elapsed_minutes
        case 'accommodation':
          return (a.accommodation?.code ?? '~').localeCompare(b.accommodation?.code ?? '~')
        case 'vet':
          return (a.vet?.full_name ?? '~').localeCompare(b.vet?.full_name ?? '~')
        case 'priority':
          return (
            SEVERITY_ORDER[a.operational_status] - SEVERITY_ORDER[b.operational_status] ||
            b.elapsed_minutes - a.elapsed_minutes
          )
        default:
          return 0
      }
    })
    return sorted
  }, [items, visibleStatuses, spaceFilter, vetFilter, monitoringFilter, isolationFilter, sortBy])

  const uniqueSpaces = useMemo(
    () => Array.from(new Map(items.map((i) => [i.accommodation_id, i.accommodation])).values()).filter(Boolean),
    [items],
  )
  const uniqueVets = useMemo(
    () => Array.from(new Map(items.map((i) => [i.vet_user_id, i.vet])).values()).filter(Boolean),
    [items],
  )

  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hospitalización</h1>
          <p className="text-sm text-muted-foreground">Pacientes internados, espacios y operación</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
              <Settings2 /> Configuración
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShiftOpen(true)}>
            <CalendarClock /> Turno
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSpacesOpen(true)}>
            <BedDouble /> Espacios
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus /> Nueva hospitalización
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <StatChip label="Hospitalizados" value={summary?.active ?? 0} icon={BedDouble} tint="bg-primary/10 text-primary" />
        <StatChip label="Críticos" value={summary?.critical ?? 0} icon={Stethoscope} tint="bg-destructive/10 text-destructive" />
        <StatChip label="En vigilancia" value={summary?.monitoring ?? 0} icon={CalendarClock} tint="bg-info/10 text-info" />
        <StatChip label="Alta pendiente" value={summary?.discharge_pending ?? 0} icon={PawPrint} tint="bg-warning/10 text-warning" />
        <StatChip label="Aislamiento" value={summary?.isolation ?? 0} icon={Stethoscope} tint="bg-orange-500/10 text-orange-600 dark:text-orange-300" />
        <StatChip label="Ingresos hoy" value={summary?.admitted_today ?? 0} icon={Plus} tint="bg-success/10 text-success" />
        <StatChip label="Alta hoy" value={summary?.expected_discharge_today ?? 0} icon={CalendarClock} tint="bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" />
      </div>

      <div className="mb-6 flex flex-col gap-2 lg:flex-row">
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Todas las sucursales</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="active">Activos</option>
          <option value="planned">Planeadas</option>
          <option value="admitted">Admitidos</option>
          <option value="discharge_pending">Alta pendiente</option>
          <option value="discharged">Dados de alta</option>
          <option value="cancelled">Canceladas</option>
        </select>
        <select value={spaceFilter} onChange={(e) => setSpaceFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Todos los espacios</option>
          {uniqueSpaces.map((a) => (
            <option key={a!.id} value={a!.id}>
              {a!.code} · {a!.name}
            </option>
          ))}
        </select>
        <select value={vetFilter} onChange={(e) => setVetFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Todos los veterinarios</option>
          {uniqueVets.map((v) => (
            <option key={v!.id} value={v!.id}>
              {v!.full_name}
            </option>
          ))}
        </select>
        <select value={monitoringFilter} onChange={(e) => setMonitoringFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Toda monitorización</option>
          <option value="basic">Básico</option>
          <option value="intermediate">Intermedio</option>
          <option value="intensive">Intensivo</option>
        </select>
        <select value={isolationFilter} onChange={(e) => setIsolationFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Sin filtro aislamiento</option>
          <option value="normal">Normal</option>
          <option value="precaution">Precaución</option>
          <option value="isolation">Aislamiento</option>
        </select>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por paciente…" className="pl-9" />
        </div>
        <div className="relative">
          <ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)} className="h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm">
            <option value="priority">Prioridad</option>
            <option value="elapsed">Tiempo internado</option>
            <option value="accommodation">Espacio</option>
            <option value="vet">Veterinario</option>
            <option value="name">Nombre</option>
          </select>
        </div>
      </div>

      {error && <ErrorState description={error} onRetry={load} className="mb-6" />}
      {loading && <LoadingState label="Cargando hospitalizaciones…" />}

      {!loading && !error && (
        <>
          {overview && overview.accommodations.length > 0 && (
            <div className="mb-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">Ocupación de espacios</h2>
                <span className="text-xs text-muted-foreground">
                  {overview.accommodations.filter((a) => a.occupied).length}/{overview.accommodations.length} ocupados
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {overview.accommodations.map((a) => (
                  <div
                    key={a.id}
                    className={`rounded-lg border px-3 py-2.5 ${
                      a.occupied
                        ? 'border-destructive/40 bg-destructive/5'
                        : a.status === 'unavailable' || a.status === 'maintenance'
                          ? 'border-border bg-muted/40 opacity-60'
                          : 'border-border bg-card'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{a.code}</p>
                      <span
                        className={`size-2.5 rounded-full ${
                          a.occupied ? 'bg-destructive' : a.status === 'maintenance' ? 'bg-warning' : 'bg-success'
                        }`}
                        aria-hidden="true"
                      />
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{a.name}</p>
                    <p className="mt-0.5 text-[11px] capitalize text-muted-foreground">
                      {ACCOMMODATION_TYPE_LABELS[a.type] ?? a.type} · {a.active_count}/{a.capacity}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filtered.length === 0 ? (
            <EmptyState
              title="Sin hospitalizaciones"
              description="No hay pacientes internados con estos filtros."
              icon={BedDouble}
            />
          ) : (
            <div className="space-y-3">
              {filtered.map((h) => {
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

      <ShiftDialog open={shiftOpen} onOpenChange={setShiftOpen} branchId={branchId} />

      <HospConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        onSaved={() => {
          setConfigOpen(false)
          load()
          loadOverview()
        }}
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

  // Búsqueda de mascotas en tiempo real (con debounce).
  useEffect(() => {
    if (!open) return
    const term = petQuery.trim()
    if (term.length < 2) {
      setPetResults([])
      return
    }
    const handle = window.setTimeout(async () => {
      try {
        const res = await apiFetch<{ id: string; name: string; species: string }[]>(
          `/pets?search=${encodeURIComponent(term)}`,
        )
        setPetResults(res)
      } catch {
        setPetResults([])
      }
    }, 300)
    return () => window.clearTimeout(handle)
  }, [petQuery, open])

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
            <div className="relative">
              <Input
                value={petQuery}
                onChange={(e) => setPetQuery(e.target.value)}
                placeholder="Escribe el nombre para buscar…"
                autoComplete="off"
              />
              {petResults.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto rounded-md border border-border bg-card p-1 shadow-card">
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
              {petQuery.trim().length >= 2 && petResults.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">Sin resultados.</p>
              )}
            </div>
            {petName && <p className="text-xs text-success">Paciente seleccionado: {petName}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Sucursal *</Label>
              {branches.length === 0 ? (
                <p className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
                  No hay sucursales registradas. Crea una desde Configuración para poder hospitalizar.
                </p>
              ) : (
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
              )}
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
