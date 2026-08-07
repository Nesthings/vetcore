import { Fragment, useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon as MDIIcon } from '@mdi/react'
import { mdiPaw } from '@mdi/js'
import {
  ArrowLeft,
  Cake,
  CalendarDays,
  Camera,
  ClipboardPlus,
  FileSignature,
  Loader2,
  Mail,
  MailPlus,
  PawPrint,
  Phone,
  Plus,
  Syringe,
  TriangleAlert,
  UserRound,
  UserRoundCog,
  Weight,
  X,
} from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { AppLayout } from '@/components/layout/AppLayout'
import { ConsentDialog } from '@/components/pets/ConsentDialog'
import { InviteOwnerDialog } from '@/components/pets/InviteOwnerDialog'
import { PhotoComparison } from '@/components/pets/PhotoComparison'
import { TransferOwnerDialog } from '@/components/pets/TransferOwnerDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Pet } from '@/pages/Pets'
import { apiFetch } from '@/lib/api'
import { SPECIES_ICONS, speciesLabel } from '@/lib/species'
import type { PetVaccinationPlan } from '@/lib/vaccination'

interface TimelineEvent {
  type: 'consulta' | 'cita'
  id: string
  title: string
  subtitle: string
  author?: string | null
  date: string
  status?: string | null
}

interface WeightRecord {
  id: string
  weight_kg: number
  recorded_at: string
}

interface ClinicalAlert {
  id: string
  pet_id: string
  type: string
  description: string
  created_at: string
}

interface PhotoEvolutionItem {
  url: string
  consultation_id: string
  consultation_date: string
  reason?: string | null
}

interface Consent {
  id: string
  pet_id: string
  title: string
  body: string
  signature_url: string
  pdf_url: string
  signed_at: string
}

interface CarnetApp {
  id: string
  date_applied: string
  lot?: string | null
  notes?: string | null
  vet_name?: string | null
}

interface CarnetVaccine {
  name: string
  prevents?: string | null
  schedule?: string | null
  applications: CarnetApp[]
}

const ALERT_TYPES = [
  'Alergia',
  'Enfermedad crónica',
  'Comportamiento',
  'Medidas especiales',
  'Otra',
]

const ALERT_STYLES: Record<string, string> = {
  Alergia: 'border-destructive/40 bg-destructive/10 text-destructive',
  'Enfermedad crónica': 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  Comportamiento: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  'Medidas especiales': 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  Otra: 'border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300',
}

function calcAge(birth: string): string {
  const b = new Date(birth)
  const now = new Date()
  let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth())
  if (now.getDate() < b.getDate()) months -= 1
  if (months < 1) return 'Menos de 1 mes'
  if (months < 12) return `${months} mes${months === 1 ? '' : 'es'}`
  const years = Math.floor(months / 12)
  const rest = months % 12
  return rest
    ? `${years} año${years === 1 ? '' : 's'} ${rest} m`
    : `${years} año${years === 1 ? '' : 's'}`
}

function isMale(sex?: string | null): boolean {
  return sex === 'M' || sex === 'macho' || sex === 'Macho'
}

function isFemale(sex?: string | null): boolean {
  return sex === 'H' || sex === 'hembra' || sex === 'Hembra'
}

function sexLabel(sex?: string | null): string | null {
  if (isMale(sex)) return 'Macho'
  if (isFemale(sex)) return 'Hembra'
  return null
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/80 px-3 py-2.5 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5 text-primary" aria-hidden="true" />
        {label}
      </div>
      <p className="mt-1 truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}

export function PetDetail() {
  const { id } = useParams<{ id: string }>()
  const [pet, setPet] = useState<Pet | null>(null)
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [weights, setWeights] = useState<WeightRecord[]>([])
  const [alerts, setAlerts] = useState<ClinicalAlert[]>([])
  const [photos, setPhotos] = useState<PhotoEvolutionItem[]>([])
  const [consents, setConsents] = useState<Consent[]>([])
  const [vaccination, setVaccination] = useState<PetVaccinationPlan[]>([])
  const [carnet, setCarnet] = useState<CarnetVaccine[]>([])
  const [carnetSpecies, setCarnetSpecies] = useState('')
  const [vets, setVets] = useState<{ id: string; full_name: string }[]>([])
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [appDate, setAppDate] = useState('')
  const [appLot, setAppLot] = useState('')
  const [appVet, setAppVet] = useState('')
  const [carnetBusy, setCarnetBusy] = useState(false)
  const [compareIdx, setCompareIdx] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [consentOpen, setConsentOpen] = useState(false)
  const [alertType, setAlertType] = useState(ALERT_TYPES[0])
  const [alertDesc, setAlertDesc] = useState('')
  const [alertBusy, setAlertBusy] = useState(false)
  const [ownerPhotoBusy, setOwnerPhotoBusy] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [p, tl, w, al, ph, cs, vp, ca, us] = await Promise.all([
        apiFetch<Pet>(`/pets/${id}`),
        apiFetch<TimelineEvent[]>(`/pets/${id}/timeline`),
        apiFetch<WeightRecord[]>(`/pets/${id}/weights`),
        apiFetch<ClinicalAlert[]>(`/pets/${id}/alerts`),
        apiFetch<PhotoEvolutionItem[]>(`/pets/${id}/photo-evolution`),
        apiFetch<Consent[]>(`/consents/pets/${id}`),
        apiFetch<PetVaccinationPlan[]>(`/vaccination-plans/pets/${id}`),
        apiFetch<{ species: string; vaccines: CarnetVaccine[] }>(`/pets/${id}/carnet`),
        apiFetch<{ id: string; full_name: string; role: string }[]>('/users'),
      ])
      setPet(p)
      setTimeline(tl)
      setWeights(w)
      setAlerts(al)
      setPhotos(ph)
      setConsents(cs)
      setVaccination(vp)
      setCarnet(ca.vaccines)
      setCarnetSpecies(ca.species)
      setVets(us.filter((u) => u.role === 'admin' || u.role === 'veterinario'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el paciente')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const addAlert = async () => {
    if (!alertDesc.trim()) return
    setAlertBusy(true)
    setError(null)
    try {
      await apiFetch(`/pets/${id}/alerts`, {
        method: 'POST',
        body: JSON.stringify({ type: alertType, description: alertDesc }),
      })
      setAlertDesc('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la alerta')
    } finally {
      setAlertBusy(false)
    }
  }

  const removeAlert = async (alertId: string) => {
    if (!confirm('¿Eliminar (resolver) esta alerta?')) return
    setError(null)
    try {
      await apiFetch(`/pets/${id}/alerts/${alertId}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la alerta')
    }
  }

  const uploadOwnerPhoto = async (file: File) => {
    if (!pet) return
    setOwnerPhotoBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      await apiFetch(`/pets/${pet.id}/owner-photo`, { method: 'POST', body: fd })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la foto del dueño')
    } finally {
      setOwnerPhotoBusy(false)
    }
  }

  const saveCarnetApp = async (vaccine: string) => {
    if (!appDate) return
    setCarnetBusy(true)
    setError(null)
    try {
      await apiFetch(`/pets/${id}/carnet`, {
        method: 'POST',
        body: JSON.stringify({
          vaccine,
          date_applied: appDate,
          lot: appLot || null,
          vet_user_id: appVet || null,
        }),
      })
      setAddingFor(null)
      setAppDate('')
      setAppLot('')
      setAppVet('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la aplicación')
    } finally {
      setCarnetBusy(false)
    }
  }

  const removeCarnetApp = async (recordId: string) => {
    if (!confirm('¿Eliminar esta aplicación del carnet?')) return
    setError(null)
    try {
      await apiFetch(`/pets/${id}/carnet/${recordId}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la aplicación')
    }
  }

  const weightChart = [...weights].reverse().map((w) => ({
    fecha: new Date(w.recorded_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }),
    peso: Number(w.weight_kg),
  }))

  return (
    <AppLayout>
      <div className="mb-5 flex items-center gap-3">
        <Link
          to="/pets"
          className="flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-accent"
          aria-label="Volver a pacientes"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <p className="text-xs text-muted-foreground">
            Pacientes / <span className="font-medium text-foreground">{pet?.name ?? 'Ficha'}</span>
          </p>
        </div>
      </div>

      {error && <ErrorState description={error} onRetry={load} className="mb-6" />}
      {loading && <LoadingState label="Cargando ficha…" />}

      {pet && !error && (
        <div className="space-y-6">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-card">
            {(() => {
              const male = isMale(pet.sex)
              const female = isFemale(pet.sex)
              const accent = male
                ? {
                    gradient: 'from-sky-500/[0.16] via-primary/[0.03] to-transparent',
                    ring: 'border-sky-400/70',
                    speciesBg: 'bg-sky-500',
                    chip: 'bg-sky-500/10 text-sky-700 hover:bg-sky-500/10 dark:text-sky-300',
                    glow: 'shadow-[0_0_30px_-4px_rgba(14,165,233,0.55)]',
                  }
                : female
                  ? {
                      gradient: 'from-pink-500/[0.16] via-primary/[0.03] to-transparent',
                      ring: 'border-pink-400/70',
                      speciesBg: 'bg-pink-500',
                      chip: 'bg-pink-500/10 text-pink-700 hover:bg-pink-500/10 dark:text-pink-300',
                      glow: 'shadow-[0_0_30px_-4px_rgba(236,72,153,0.55)]',
                    }
                  : {
                      gradient: 'from-slate-500/[0.12] via-primary/[0.03] to-transparent',
                      ring: 'border-primary/20',
                      speciesBg: 'bg-primary',
                      chip: 'bg-primary/10 text-primary hover:bg-primary/10',
                      glow: 'shadow-glow',
                    }
              return (
                <>
                  <div
                    className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${accent.gradient}`}
                    aria-hidden="true"
                  />
                  <CardContent className="relative flex flex-col items-center p-8 text-center">
                    <div className="relative">
                      <div
                        className={`flex size-44 items-center justify-center overflow-hidden rounded-[2rem] border-4 ${accent.ring} bg-secondary/60 shadow-elevated ${accent.glow}`}
                      >
                        {pet.clinical_photo_url ? (
                          <img
                            src={pet.clinical_photo_url}
                            alt={pet.name}
                            className="size-full object-cover"
                          />
                        ) : (
                          <PawPrint className="size-16 text-primary" aria-hidden="true" />
                        )}
                      </div>
                      <span
                        className={`absolute -bottom-2 -right-2 flex size-10 items-center justify-center rounded-full border-4 border-card ${accent.speciesBg} text-white shadow-glow`}
                        title={speciesLabel(pet.species)}
                      >
                        <MDIIcon
                          path={SPECIES_ICONS[pet.species] ?? mdiPaw}
                          size={0.7}
                          aria-hidden="true"
                        />
                      </span>
                    </div>

                    <h1 className="mt-5 text-3xl font-bold tracking-tight text-foreground">
                      {pet.name}
                    </h1>
                    <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
                      <Badge className={`gap-1.5 ${accent.chip}`}>
                        <MDIIcon
                          path={SPECIES_ICONS[pet.species] ?? mdiPaw}
                          size={0.6}
                          aria-hidden="true"
                        />
                        {speciesLabel(pet.species)}
                      </Badge>
                      {pet.breed && <Badge variant="secondary">{pet.breed}</Badge>}
                      {sexLabel(pet.sex) && (
                        <Badge className={accent.chip}>{sexLabel(pet.sex)}</Badge>
                      )}
                      {pet.markings && (
                        <Badge variant="outline" className="text-muted-foreground">
                          {pet.markings}
                        </Badge>
                      )}
                    </div>
                    {pet.allergies && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Alergias:</span>{' '}
                        {pet.allergies}
                      </p>
                    )}

                    <div className="mt-7 grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
                      <Stat
                        icon={Cake}
                        label="Edad"
                        value={pet.birth_date ? calcAge(pet.birth_date) : '—'}
                      />
                      <Stat
                        icon={CalendarDays}
                        label="Nacimiento"
                        value={
                          pet.birth_date
                            ? new Date(pet.birth_date).toLocaleDateString('es-MX', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })
                            : '—'
                        }
                      />
                      <Stat
                        icon={Weight}
                        label="Último peso"
                        value={pet.latest_weight_kg ? `${pet.latest_weight_kg} kg` : '—'}
                      />
                      <Stat
                        icon={UserRound}
                        label="Dueño"
                        value={pet.owners?.find((o) => o.is_active)?.full_name ?? '—'}
                      />
                    </div>

                    <div className="mt-7 flex flex-wrap justify-center gap-2">
                      <Button asChild size="sm">
                        <Link to={`/consultas/nueva?pet=${id}`}>
                          <ClipboardPlus /> Nueva consulta
                        </Link>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setConsentOpen(true)}>
                        <FileSignature /> Consentimiento
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)}>
                        <MailPlus /> Invitar dueño
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setTransferOpen(true)}>
                        <UserRoundCog /> Transferir dueño
                      </Button>
                    </div>
                  </CardContent>
                </>
              )
            })()}
          </div>

          {pet.clinical_alert_text && (
            <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">Alerta clínica</p>
                <p>{pet.clinical_alert_text}</p>
              </div>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <UserRound className="size-4 text-primary" aria-hidden="true" />
                  Dueño
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {!pet.owners || pet.owners.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sin dueño registrado. Usa «Invitar dueño» o «Transferir dueño».
                  </p>
                ) : (
                  pet.owners.map((o) => {
                    const initials =
                      (o.full_name ?? 'D')
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((w) => w[0]?.toUpperCase() ?? '')
                        .join('') || 'D'
                    return (
                      <div
                        key={o.owner_id}
                        className="flex flex-col gap-4 rounded-xl border border-border/60 bg-muted/30 p-4 sm:flex-row sm:items-center"
                      >
                        <div className="relative shrink-0 self-center">
                          <div className="flex size-16 items-center justify-center overflow-hidden rounded-full border-2 border-primary/20 bg-secondary text-base font-semibold text-primary shadow-card">
                            {o.profile_photo_url ? (
                              <img
                                src={o.profile_photo_url}
                                alt={o.full_name ?? 'Dueño'}
                                className="size-full object-cover"
                              />
                            ) : (
                              initials
                            )}
                          </div>
                          <label
                            className={`absolute -bottom-1 -right-1 flex size-7 cursor-pointer items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-card transition-colors hover:bg-primary-hover ${
                              ownerPhotoBusy ? 'pointer-events-none opacity-70' : ''
                            }`}
                            title="Subir foto de perfil del dueño"
                          >
                            {ownerPhotoBusy ? (
                              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <Camera className="size-3.5" aria-hidden="true" />
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0]
                                if (f) uploadOwnerPhoto(f)
                                e.target.value = ''
                              }}
                            />
                          </label>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-base font-semibold text-foreground">
                              {o.full_name ?? 'Dueño registrado'}
                            </p>
                            {!o.is_active && (
                              <span className="text-xs text-muted-foreground">
                                (vínculo inactivo)
                              </span>
                            )}
                          </div>
                          <div className="mt-2 space-y-1">
                            {o.phone && (
                              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Phone
                                  className="size-3.5 shrink-0 text-primary"
                                  aria-hidden="true"
                                />
                                {o.phone}
                              </p>
                            )}
                            {o.email && (
                              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Mail
                                  className="size-3.5 shrink-0 text-primary"
                                  aria-hidden="true"
                                />
                                {o.email}
                              </p>
                            )}
                            {!o.phone && !o.email && (
                              <p className="text-sm text-muted-foreground">
                                Sin contacto registrado
                              </p>
                            )}
                            {(o.alt_contact_name || o.alt_phone) && (
                              <p className="text-xs text-muted-foreground">
                                Alternativo:{' '}
                                {[o.alt_contact_name, o.alt_phone].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col gap-1.5 sm:items-end">
                          <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)}>
                            <MailPlus /> Invitar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground"
                            onClick={() => setTransferOpen(true)}
                          >
                            <UserRoundCog /> Transferir
                          </Button>
                        </div>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>

            <Card className="border-warning/40 shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TriangleAlert className="size-4 text-warning" aria-hidden="true" />
                  Alertas clínicas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {alerts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin alertas registradas.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {alerts.map((a) => (
                      <span
                        key={a.id}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${
                          ALERT_STYLES[a.type] ?? 'border-warning/40 bg-warning/10 text-warning'
                        }`}
                      >
                        <TriangleAlert className="size-3.5" aria-hidden="true" />
                        <span>
                          <b>{a.type}:</b> {a.description}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeAlert(a.id)}
                          aria-label="Resolver alerta"
                          className="text-current opacity-60 hover:opacity-100"
                        >
                          <X className="size-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={alertType}
                    onChange={(e) => setAlertType(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {ALERT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <input
                    value={alertDesc}
                    onChange={(e) => setAlertDesc(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addAlert()}
                    placeholder="Describe la alerta…"
                    className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={addAlert}
                    disabled={alertBusy}
                  >
                    {alertBusy ? <Loader2 className="animate-spin" /> : <Plus />} Agregar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Syringe className="size-4 text-primary" aria-hidden="true" />
                Carnet de vacunación
              </CardTitle>
              <CardDescription>
                {carnet.length > 0
                  ? `Esquema estándar para ${speciesLabel(carnetSpecies)} · Cartilla Nacional de Vacunación (México)`
                  : 'Sin esquema estándar definido para esta especie'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {carnet.length === 0 ? (
                <EmptyState
                  title="Sin esquema de vacunación"
                  description={`No hay un esquema estándar registrado para la especie «${speciesLabel(carnetSpecies)}».`}
                  icon={Syringe}
                />
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <Table className="table-fixed [&_th]:border-l [&_th:first-child]:border-l-0 [&_td]:border-l [&_td:first-child]:border-l-0">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[25%]">Vacuna</TableHead>
                        <TableHead className="w-[22%]">Enfermedades que previene</TableHead>
                        <TableHead className="w-[28%]">Esquema recomendado</TableHead>
                        <TableHead className="w-[14%]">Aplicaciones</TableHead>
                        <TableHead className="w-[11%] text-right">Registrar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {carnet.map((v) => (
                        <Fragment key={v.name}>
                          <TableRow>
                            <TableCell className="whitespace-normal break-words font-medium">
                              {v.name}
                            </TableCell>
                            <TableCell className="whitespace-normal break-words text-muted-foreground">
                              {v.prevents ?? '—'}
                            </TableCell>
                            <TableCell className="whitespace-normal break-words text-xs text-muted-foreground">
                              {v.schedule ?? '—'}
                            </TableCell>
                            <TableCell className="whitespace-normal">
                              {v.applications.length === 0 ? (
                                <span className="text-sm text-muted-foreground">—</span>
                              ) : (
                                <div className="space-y-1.5">
                                  {v.applications.map((app) => (
                                    <div
                                      key={app.id}
                                      className="rounded-md border border-border/60 bg-muted/30 px-2 py-1"
                                    >
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-medium">
                                          {new Date(app.date_applied).toLocaleDateString('es-MX')}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => removeCarnetApp(app.id)}
                                          aria-label={`Eliminar aplicación ${new Date(
                                            app.date_applied,
                                          ).toLocaleDateString('es-MX')}`}
                                          className="ml-auto shrink-0 text-muted-foreground hover:text-destructive"
                                        >
                                          <X className="size-3" />
                                        </button>
                                      </div>
                                      {(app.lot || app.vet_name) && (
                                        <p className="mt-0.5 break-words text-xs text-muted-foreground">
                                          {[app.lot && `Lote ${app.lot}`, app.vet_name]
                                            .filter(Boolean)
                                            .join(' · ')}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setAddingFor(addingFor === v.name ? null : v.name)
                                  setAppDate('')
                                  setAppLot('')
                                  setAppVet('')
                                }}
                              >
                                <Plus /> Añadir
                              </Button>
                            </TableCell>
                          </TableRow>
                          {addingFor === v.name && (
                            <TableRow>
                              <TableCell colSpan={5} className="bg-muted/30">
                                <div className="flex flex-wrap items-end gap-3 py-1">
                                  <div className="space-y-1.5">
                                    <Label>Fecha</Label>
                                    <Input
                                      type="date"
                                      value={appDate}
                                      onChange={(e) => setAppDate(e.target.value)}
                                      className="w-40"
                                    />
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label>Lote</Label>
                                    <Input
                                      value={appLot}
                                      onChange={(e) => setAppLot(e.target.value)}
                                      placeholder="Ej. RAB-2026-01"
                                      className="w-40"
                                    />
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label>Veterinario</Label>
                                    <select
                                      value={appVet}
                                      onChange={(e) => setAppVet(e.target.value)}
                                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                    >
                                      <option value="">—</option>
                                      {vets.map((u) => (
                                        <option key={u.id} value={u.id}>
                                          {u.full_name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() => saveCarnetApp(v.name)}
                                      disabled={carnetBusy || !appDate}
                                    >
                                      {carnetBusy ? (
                                        <Loader2 className="animate-spin" />
                                      ) : (
                                        'Guardar'
                                      )}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setAddingFor(null)}
                                    >
                                      Cancelar
                                    </Button>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Tabs defaultValue="timeline">
            <TabsList>
              <TabsTrigger value="timeline">Línea de tiempo</TabsTrigger>
              <TabsTrigger value="peso">Peso histórico</TabsTrigger>
              <TabsTrigger value="fotos">Fotos de evolución</TabsTrigger>
              <TabsTrigger value="consents">Consentimientos</TabsTrigger>
              <TabsTrigger value="vacunacion">Vacunación</TabsTrigger>
            </TabsList>

            <TabsContent value="timeline" className="space-y-4">
              {timeline.length === 0 ? (
                <EmptyState
                  title="Sin actividad"
                  description="Aún no hay consultas ni citas para este paciente."
                />
              ) : (
                <div className="relative space-y-4 pl-6">
                  <div className="absolute bottom-0 left-2 top-0 w-px bg-border" />
                  {timeline.map((e) => (
                    <div key={`${e.type}-${e.id}`} className="relative">
                      <span
                        className={`absolute -left-6 top-1.5 size-3 rounded-full border-2 border-background ${
                          e.type === 'consulta' ? 'bg-primary' : 'bg-info'
                        }`}
                      />
                      <Card className="shadow-card">
                        <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
                          <div>
                            <p className="text-sm font-medium">{e.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(e.date).toLocaleString('es-MX', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                              {e.author ? ` · ${e.author}` : ''}
                            </p>
                            {e.subtitle && (
                              <p className="mt-1 text-xs text-muted-foreground">{e.subtitle}</p>
                            )}
                          </div>
                          {e.type === 'cita' && e.status && (
                            <Badge variant="secondary">{e.status}</Badge>
                          )}
                          {e.type === 'consulta' && <Badge variant="success">Consulta</Badge>}
                        </CardContent>
                      </Card>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="peso">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>Peso histórico</CardTitle>
                  <CardDescription>
                    Serie de tiempo por consulta (el default visual es el último valor)
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-72">
                  {weights.length === 0 ? (
                    <EmptyState
                      title="Sin registros de peso"
                      description="Aún no hay pesajes registrados."
                    />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={weightChart}
                        margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="fecha"
                          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          domain={['auto', 'auto']}
                          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip formatter={(v) => [`${v} kg`, 'Peso']} />
                        <Line
                          type="monotone"
                          dataKey="peso"
                          stroke="var(--chart-1)"
                          strokeWidth={2}
                          dot={{ r: 4, fill: 'var(--chart-1)' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="fotos" className="space-y-4">
              {photos.length === 0 ? (
                <EmptyState
                  title="Sin fotos de evolución"
                  description="Las fotos adjuntas a las consultas aparecerán aquí para comparar la evolución."
                  icon={Camera}
                />
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex w-full max-w-md items-center justify-between gap-3">
                    <select
                      value={compareIdx}
                      onChange={(e) => setCompareIdx(Number(e.target.value))}
                      className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {photos.map((p, i) => (
                        <option key={p.consultation_id} value={i}>
                          Antes: {new Date(p.consultation_date).toLocaleDateString('es-MX')}{' '}
                          {p.reason ? `· ${p.reason}` : ''}
                        </option>
                      ))}
                    </select>
                    <span className="text-sm text-muted-foreground">
                      vs.{' '}
                      {new Date(photos[photos.length - 1].consultation_date).toLocaleDateString(
                        'es-MX',
                      )}
                    </span>
                  </div>
                  <PhotoComparison
                    before={photos[compareIdx].url}
                    after={photos[photos.length - 1].url}
                    beforeLabel={new Date(photos[compareIdx].consultation_date).toLocaleDateString(
                      'es-MX',
                    )}
                    afterLabel={new Date(
                      photos[photos.length - 1].consultation_date,
                    ).toLocaleDateString('es-MX')}
                  />
                  <p className="text-center text-xs text-muted-foreground">
                    Arrastra el divisor para comparar la evolución entre dos consultas.
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="consents" className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Consentimientos informados firmados por el dueño.
                </p>
                <Button size="sm" onClick={() => setConsentOpen(true)}>
                  <FileSignature /> Nuevo consentimiento
                </Button>
              </div>
              {consents.length === 0 ? (
                <EmptyState
                  title="Sin consentimientos"
                  description="Genera el primero para procedimientos como anestesia o cirugía."
                  icon={FileSignature}
                />
              ) : (
                <div className="space-y-2">
                  {consents.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{c.title}</p>
                        <p className="text-xs text-muted-foreground">
                          Firmado{' '}
                          {new Date(c.signed_at).toLocaleString('es-MX', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <a
                        href={c.pdf_url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-sm font-medium text-primary hover:text-primary-hover"
                      >
                        Ver PDF
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="vacunacion" className="space-y-4">
              {vaccination.length === 0 ? (
                <EmptyState
                  title="Sin plan de vacunación"
                  description="Asigna un plan al dar de alta a la mascota para generar sus citas de vacunación automáticamente."
                  icon={Syringe}
                />
              ) : (
                vaccination.map((vp) => (
                  <div key={vp.id} className="space-y-2 rounded-md border border-border/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {vp.plan_name}
                          {vp.compound ? ` · ${vp.compound}` : ''}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {vp.branch_name}
                          {vp.vet_name ? ` · ${vp.vet_name}` : ''} · Inicia{' '}
                          {new Date(`${vp.start_date}T00:00:00`).toLocaleDateString('es-MX')}
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {vp.doses.map((d) => (
                        <div
                          key={d.id}
                          className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{d.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(`${d.due_date}T00:00:00`).toLocaleDateString('es-MX')}
                              {d.appointment_start
                                ? ` · ${new Date(d.appointment_start).toLocaleTimeString('es-MX', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}`
                                : ''}
                            </p>
                          </div>
                          <Badge
                            variant={
                              d.status === 'completed'
                                ? 'success'
                                : d.status === 'skipped'
                                  ? 'outline'
                                  : 'warning'
                            }
                          >
                            {d.status === 'completed'
                              ? 'Completada'
                              : d.status === 'skipped'
                                ? 'Omitida'
                                : 'Programada'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}

      {pet && (
        <InviteOwnerDialog
          petId={pet.id}
          petName={pet.name}
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          defaultOwner={{
            name: pet.owners?.find((o) => o.is_active)?.full_name ?? null,
            phone: pet.owners?.find((o) => o.is_active)?.phone ?? null,
            email: pet.owners?.find((o) => o.is_active)?.email ?? null,
          }}
        />
      )}

      {pet && (
        <TransferOwnerDialog
          petId={pet.id}
          petName={pet.name}
          open={transferOpen}
          onOpenChange={setTransferOpen}
        />
      )}

      {pet && (
        <ConsentDialog
          petId={pet.id}
          petName={pet.name}
          open={consentOpen}
          onOpenChange={setConsentOpen}
          onSaved={() => {
            setConsentOpen(false)
            load()
          }}
        />
      )}
    </AppLayout>
  )
}
